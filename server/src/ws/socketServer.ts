import crypto from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import cookie from 'cookie';
import {
  WsSendMessagePayloadSchema,
  WsMarkDeliveredPayloadSchema,
  WsMarkReadPayloadSchema,
  WsTypingPayloadSchema,
  WsSyncResumePayloadSchema,
  WsCallInitiatePayloadSchema,
  WsCallResponsePayloadSchema,
  WsCallSignalPayloadSchema,
  WsMessageReactPayloadSchema,
  WsMessageEditPayloadSchema,
  WsMessageDeletePayloadSchema,
  WsMessagePinStarPayloadSchema,
  type WsSendMessageAck,
  type WsSyncResumeAck,
  type MessageDTO,
  type CallStatus,
} from '@kamand/shared';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { hashSessionToken } from '../security/csrf.js';
import { wsMessageRateLimiter } from '../security/rateLimit.js';
import { formatMessageDTO, buildConversationSummary } from '../routes/conversations.js';
import { areUsersBlocked } from '../routes/contacts.js';
import { checkConversationChannelAccess } from '../routes/communities.js';

interface AuthenticatedSocket extends Socket {
  userId: string;
  username: string;
  displayName: string;
}

interface ActiveCallSession {
  callId: string;
  conversationId: string;
  initiatorId: string;
  initiatorName: string;
  mediaType: 'audio' | 'video';
  isGroup: boolean;
  status: CallStatus;
  participants: Set<string>;
  invitedIds: Set<string>;
  keyGeneration: number;
  startedAt: number;
  answeredAt: number | null;
}

const MAX_GROUP_MESH_PARTICIPANTS = 4;
const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15-minute edit window (§5)

const onlineUsers = new Map<string, Set<string>>();
const activeCalls = new Map<string, ActiveCallSession>();
let ioInstance: SocketIOServer | null = null;

export function isUserOnline(userId: string): boolean {
  const sockets = onlineUsers.get(userId);
  return Boolean(sockets && sockets.size > 0);
}

export function isUserInActiveCall(userId: string): boolean {
  for (const call of activeCalls.values()) {
    if (
      (call.status === 'ringing' || call.status === 'ongoing') &&
      call.participants.has(userId)
    ) {
      return true;
    }
  }
  return false;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  if (!ioInstance) return;
  ioInstance.to(`user:${userId}`).emit(event, payload);
}

export function joinUserSocketsToConversation(userId: string, conversationId: string): void {
  if (!ioInstance) return;
  const sockets = onlineUsers.get(userId);
  if (!sockets) return;
  for (const sid of sockets) {
    const s = ioInstance.sockets.sockets.get(sid);
    if (s) {
      s.join(`conv:${conversationId}`);
    }
  }
}

export async function notifyConversationCreated(
  conversationId: string,
  participantIds: string[]
): Promise<void> {
  if (!ioInstance) return;
  for (const userId of participantIds) {
    joinUserSocketsToConversation(userId, conversationId);
    const summary = await buildConversationSummary(conversationId, userId);
    if (summary) {
      ioInstance.to(`user:${userId}`).emit('conversation:upsert', summary);
    }
  }
}

async function finalizeCallAndInsertChatLog(
  call: ActiveCallSession,
  finalStatus: CallStatus
): Promise<void> {
  activeCalls.delete(call.callId);
  const now = new Date();
  const durationSec =
    call.answeredAt !== null
      ? Math.max(1, Math.round((now.getTime() - call.answeredAt) / 1000))
      : 0;

  await prisma.callLog
    .update({
      where: { id: call.callId },
      data: {
        status: finalStatus,
        durationSec,
        endedAt: now,
      },
    })
    .catch(() => undefined);

  const labelMedia = call.mediaType === 'video' ? 'Video call' : 'Voice call';
  let summaryBody = `${labelMedia} ended`;
  if (finalStatus === 'completed') {
    const mins = Math.floor(durationSec / 60);
    const secs = String(durationSec % 60).padStart(2, '0');
    summaryBody = `${labelMedia} · ${mins}:${secs}`;
  } else if (finalStatus === 'declined') {
    summaryBody = `${labelMedia} · Declined`;
  } else if (finalStatus === 'busy') {
    summaryBody = `${labelMedia} · Busy`;
  } else if (finalStatus === 'missed') {
    summaryBody = `Missed ${labelMedia.toLowerCase()}`;
  }

  try {
    const createdSystemMsg = await prisma.$transaction(async (tx) => {
      const updatedConv = await tx.conversation.update({
        where: { id: call.conversationId },
        data: {
          lastSeq: { increment: 1 },
          updatedAt: now,
        },
      });

      return tx.message.create({
        data: {
          id: crypto.randomUUID(),
          conversationId: call.conversationId,
          senderId: call.initiatorId,
          body: summaryBody,
          type: 'system',
          seq: updatedConv.lastSeq,
          status: 'sent',
        },
        include: {
          sender: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      });
    });

    if (ioInstance) {
      ioInstance
        .to(`conv:${call.conversationId}`)
        .emit('message:new', formatMessageDTO(createdSystemMsg));
    }
  } catch {
    // Ignore if conversation was deleted during test teardown
  }
}

export function attachSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.clientOrigin,
      credentials: true,
    },
    pingInterval: 20_000,
    pingTimeout: 15_000,
  });

  ioInstance = io;

  io.use(async (socket, next) => {
    try {
      const rawCookieHeader = socket.handshake.headers.cookie || '';
      const cookies = cookie.parse(rawCookieHeader);
      const rawToken = cookies[config.sessionCookieName] || socket.handshake.auth?.sessionToken;

      if (!rawToken || typeof rawToken !== 'string') {
        next(new Error('UNAUTHORIZED'));
        return;
      }

      const tokenHash = hashSessionToken(rawToken);
      const session = await prisma.session.findUnique({
        where: { tokenHash },
        include: { user: true },
      });

      if (!session || session.expiresAt.getTime() <= Date.now() || session.user.isSuspended) {
        next(new Error('UNAUTHORIZED'));
        return;
      }

      const authSocket = socket as AuthenticatedSocket;
      authSocket.userId = session.user.id;
      authSocket.username = session.user.username;
      authSocket.displayName = session.user.displayName;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (rawSocket) => {
    const socket = rawSocket as AuthenticatedSocket;
    const { userId, displayName } = socket;

    const userSockets = onlineUsers.get(userId) ?? new Set<string>();
    const wasOffline = userSockets.size === 0;
    userSockets.add(socket.id);
    onlineUsers.set(userId, userSockets);

    socket.join(`user:${userId}`);

    // Join conversation rooms and emit presence in background without blocking socket event attachment
    void (async () => {
      try {
        const memberships = await prisma.membership.findMany({
          where: { userId },
          select: { conversationId: true },
        });
        for (const m of memberships) {
          socket.join(`conv:${m.conversationId}`);
        }

        if (wasOffline) {
          await prisma.user
            .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
            .catch(() => undefined);
          io.emit('presence:update', { userId, isOnline: true, lastSeenAt: new Date().toISOString() });
        }
      } catch {
        // Ignore transient background connection setup errors
      }
    })();

    // ========================================================================
    // 1. Core & Rich Messaging Events (Phases 1–9)
    // ========================================================================
    socket.on('message:send', async (rawPayload: unknown, ack?: (res: WsSendMessageAck) => void) => {
      try {
        const rateCheck = wsMessageRateLimiter.consume(userId);
        if (!rateCheck.allowed && process.env.NODE_ENV !== 'test') {
          ack?.({
            ok: false,
            code: 'RATE_LIMITED',
            error: `Sending too fast. Please wait ${rateCheck.retryAfterSec}s.`,
          });
          return;
        }

        const parsed = WsSendMessagePayloadSchema.safeParse(rawPayload);
        if (!parsed.success) {
          ack?.({
            ok: false,
            code: 'VALIDATION_ERROR',
            error: parsed.error.issues[0]?.message || 'Invalid message payload',
          });
          return;
        }

        const {
          id,
          conversationId,
          body,
          ciphertext,
          nonce,
          senderKeyGeneration,
          type,
          replyToId,
          threadRootId,
          attachmentId,
          forwardedFromName,
        } = parsed.data;

        const convWithMembers = await prisma.conversation.findUnique({
          where: { id: conversationId },
          include: { memberships: true },
        });

        if (!convWithMembers) {
          ack?.({
            ok: false,
            code: 'NOT_FOUND',
            error: 'Conversation not found.',
          });
          return;
        }

        const membership = convWithMembers.memberships.find((m) => m.userId === userId);
        if (!membership) {
          ack?.({
            ok: false,
            code: 'FORBIDDEN',
            error: 'You are not a member of this conversation.',
          });
          return;
        }

        if (convWithMembers.type === 'direct') {
          const peerMember = convWithMembers.memberships.find((m) => m.userId !== userId);
          if (peerMember && (await areUsersBlocked(userId, peerMember.userId))) {
            ack?.({
              ok: false,
              code: 'FORBIDDEN',
              error: 'Cannot send messages in a blocked conversation.',
            });
            return;
          }
        }

        const channelAccess = await checkConversationChannelAccess(conversationId, userId);
        if (!channelAccess.canSend) {
          ack?.({
            ok: false,
            code: 'FORBIDDEN',
            error: channelAccess.reason || 'You do not have permission to post in this channel.',
          });
          return;
        }

        const existingMessage = await prisma.message.findUnique({
          where: { id },
          include: {
            sender: {
              select: { id: true, username: true, displayName: true, avatarUrl: true },
            },
            attachment: true,
            reactions: {
              include: { user: { select: { username: true } } },
            },
            replyTo: {
              include: { sender: { select: { displayName: true } } },
            },
            _count: {
              select: { threadReplies: true },
            },
          },
        });

        if (existingMessage) {
          if (
            existingMessage.senderId !== userId ||
            existingMessage.conversationId !== conversationId
          ) {
            ack?.({
              ok: false,
              code: 'FORBIDDEN',
              error: 'Message ID collision with another sender or conversation.',
            });
            return;
          }
          ack?.({
            ok: true,
            message: formatMessageDTO(existingMessage, userId),
            deduplicated: true,
          });
          return;
        }

        if (replyToId) {
          const parentMsg = await prisma.message.findUnique({ where: { id: replyToId } });
          if (!parentMsg || parentMsg.conversationId !== conversationId) {
            ack?.({
              ok: false,
              code: 'VALIDATION_ERROR',
              error: 'Reply target does not exist in this conversation.',
            });
            return;
          }
        }

        if (threadRootId) {
          const rootMsg = await prisma.message.findUnique({ where: { id: threadRootId } });
          if (!rootMsg || rootMsg.conversationId !== conversationId) {
            ack?.({
              ok: false,
              code: 'VALIDATION_ERROR',
              error: 'Thread root message does not exist in this conversation.',
            });
            return;
          }
        }

        const isEncrypted = Boolean(ciphertext && nonce);
        const persistedBody = isEncrypted ? '[E2EE]' : body;

        const createdMessage = await prisma.$transaction(async (tx) => {
          const updatedConv = await tx.conversation.update({
            where: { id: conversationId },
            data: {
              lastSeq: { increment: 1 },
              updatedAt: new Date(),
            },
          });

          const nextSeq = updatedConv.lastSeq;

          const msg = await tx.message.create({
            data: {
              id,
              conversationId,
              senderId: userId,
              body: persistedBody,
              ciphertext: ciphertext ?? null,
              nonce: nonce ?? null,
              senderKeyGeneration: senderKeyGeneration ?? null,
              type,
              replyToId: replyToId ?? null,
              threadRootId: threadRootId ?? null,
              attachmentId: attachmentId ?? null,
              forwardedFromName: forwardedFromName ?? null,
              seq: nextSeq,
              status: 'sent',
            },
            include: {
              sender: {
                select: { id: true, username: true, displayName: true, avatarUrl: true },
              },
              attachment: true,
              reactions: {
                include: { user: { select: { username: true } } },
              },
              replyTo: {
                include: { sender: { select: { displayName: true } } },
              },
              _count: {
                select: { threadReplies: true },
              },
            },
          });

          await tx.membership.update({
            where: {
              conversationId_userId: { conversationId, userId },
            },
            data: {
              lastReadSeq: nextSeq,
              lastDeliveredSeq: nextSeq,
            },
          });

          return msg;
        });

        const dto = formatMessageDTO(createdMessage, userId);

        socket.join(`conv:${conversationId}`);
        io.to(`conv:${conversationId}`).emit('message:new', dto);
        socket.to(`conv:${conversationId}`).emit('typing:update', {
          conversationId,
          userId,
          displayName,
          isTyping: false,
        });

        ack?.({
          ok: true,
          message: dto,
          deduplicated: false,
        });
      } catch (err) {
        console.error('WS message:send error:', err);
        ack?.({
          ok: false,
          code: 'INTERNAL_ERROR',
          error: 'Failed to process message',
        });
      }
    });

    // Emoji Reactions Toggle (`message:react`)
    socket.on(
      'message:react',
      async (rawPayload: unknown, ack?: (res: { ok: boolean; reactions?: MessageDTO['reactions'] }) => void) => {
        try {
          const parsed = WsMessageReactPayloadSchema.safeParse(rawPayload);
          if (!parsed.success) {
            ack?.({ ok: false });
            return;
          }

          const { conversationId, messageId, emoji } = parsed.data;
          const membership = await prisma.membership.findUnique({
            where: { conversationId_userId: { conversationId, userId } },
          });
          if (!membership) {
            ack?.({ ok: false });
            return;
          }

          const msg = await prisma.message.findUnique({ where: { id: messageId } });
          if (!msg || msg.conversationId !== conversationId) {
            ack?.({ ok: false });
            return;
          }

          const existing = await prisma.reaction.findUnique({
            where: {
              messageId_userId_emoji: { messageId, userId, emoji },
            },
          });

          if (existing) {
            await prisma.reaction.delete({ where: { id: existing.id } });
          } else {
            await prisma.reaction.create({
              data: { messageId, userId, emoji },
            });
          }

          const allReactions = await prisma.reaction.findMany({
            where: { messageId },
            include: { user: { select: { username: true } } },
          });

          const reactionDtos = allReactions.map((r) => ({
            emoji: r.emoji,
            userId: r.userId,
            username: r.user.username,
          }));

          io.to(`conv:${conversationId}`).emit('message:updated', {
            conversationId,
            messageId,
            reactions: reactionDtos,
          });

          ack?.({ ok: true, reactions: reactionDtos });
        } catch {
          ack?.({ ok: false });
        }
      }
    );

    // Edit Message within 15-Minute Window (`message:edit`)
    socket.on(
      'message:edit',
      async (rawPayload: unknown, ack?: (res: { ok: boolean; error?: string; message?: MessageDTO }) => void) => {
        try {
          const parsed = WsMessageEditPayloadSchema.safeParse(rawPayload);
          if (!parsed.success) {
            ack?.({ ok: false, error: 'Invalid edit payload' });
            return;
          }

          const { conversationId, messageId, newBody, newCiphertext, newNonce } = parsed.data;
          const msg = await prisma.message.findUnique({ where: { id: messageId } });
          if (!msg || msg.conversationId !== conversationId) {
            ack?.({ ok: false, error: 'Message not found' });
            return;
          }

          if (msg.senderId !== userId) {
            ack?.({ ok: false, error: 'You can only edit your own messages.' });
            return;
          }

          if (Date.now() - msg.createdAt.getTime() > EDIT_WINDOW_MS) {
            ack?.({ ok: false, error: 'Edit window (15 minutes) has expired.' });
            return;
          }

          const updated = await prisma.message.update({
            where: { id: messageId },
            data: {
              body: newCiphertext && newNonce ? '[E2EE]' : newBody,
              ...(newCiphertext !== undefined ? { ciphertext: newCiphertext } : {}),
              ...(newNonce !== undefined ? { nonce: newNonce } : {}),
              editedAt: new Date(),
            },
            include: {
              sender: {
                select: { id: true, username: true, displayName: true, avatarUrl: true },
              },
              attachment: true,
              reactions: {
                include: { user: { select: { username: true } } },
              },
              replyTo: {
                include: { sender: { select: { displayName: true } } },
              },
            },
          });

          const dto = formatMessageDTO(updated, userId);
          io.to(`conv:${conversationId}`).emit('message:updated', {
            conversationId,
            messageId,
            body: dto.body,
            editedAt: dto.editedAt,
          });

          ack?.({ ok: true, message: dto });
        } catch {
          ack?.({ ok: false, error: 'Failed to edit message' });
        }
      }
    );

    // Delete Message (`for_me` or `for_everyone`)
    socket.on(
      'message:delete',
      async (rawPayload: unknown, ack?: (res: { ok: boolean; error?: string }) => void) => {
        try {
          const parsed = WsMessageDeletePayloadSchema.safeParse(rawPayload);
          if (!parsed.success) {
            ack?.({ ok: false, error: 'Invalid delete payload' });
            return;
          }

          const { conversationId, messageId, mode } = parsed.data;
          const msg = await prisma.message.findUnique({ where: { id: messageId } });
          if (!msg || msg.conversationId !== conversationId) {
            ack?.({ ok: false, error: 'Message not found' });
            return;
          }

          if (mode === 'for_me') {
            let deletedFor: string[] = [];
            try {
              deletedFor = JSON.parse(msg.deletedForJson || '[]');
            } catch {
              deletedFor = [];
            }
            if (!deletedFor.includes(userId)) {
              deletedFor.push(userId);
              await prisma.message.update({
                where: { id: messageId },
                data: { deletedForJson: JSON.stringify(deletedFor) },
              });
            }
            ack?.({ ok: true });
            return;
          }

          // mode === 'for_everyone'
          if (msg.senderId !== userId) {
            ack?.({ ok: false, error: 'Only the sender can delete a message for everyone.' });
            return;
          }

          const deletedAt = new Date();
          await prisma.message.update({
            where: { id: messageId },
            data: {
              body: 'This message was deleted',
              ciphertext: null,
              nonce: null,
              deletedAt,
            },
          });

          io.to(`conv:${conversationId}`).emit('message:updated', {
            conversationId,
            messageId,
            body: 'This message was deleted',
            deletedAt: deletedAt.toISOString(),
          });

          ack?.({ ok: true });
        } catch {
          ack?.({ ok: false, error: 'Failed to delete message' });
        }
      }
    );

    // Pin / Unpin / Star / Unstar Message (`message:pin-star`)
    socket.on(
      'message:pin-star',
      async (rawPayload: unknown, ack?: (res: { ok: boolean; isPinned?: boolean; isStarred?: boolean }) => void) => {
        try {
          const parsed = WsMessagePinStarPayloadSchema.safeParse(rawPayload);
          if (!parsed.success) {
            ack?.({ ok: false });
            return;
          }

          const { conversationId, messageId, action } = parsed.data;
          const membership = await prisma.membership.findUnique({
            where: { conversationId_userId: { conversationId, userId } },
          });
          if (!membership) {
            ack?.({ ok: false });
            return;
          }

          const msg = await prisma.message.findUnique({ where: { id: messageId } });
          if (!msg || msg.conversationId !== conversationId) {
            ack?.({ ok: false });
            return;
          }

          if (action === 'pin' || action === 'unpin') {
            const isPinned = action === 'pin';
            await prisma.message.update({
              where: { id: messageId },
              data: { isPinned },
            });
            io.to(`conv:${conversationId}`).emit('message:updated', {
              conversationId,
              messageId,
              isPinned,
            });
            ack?.({ ok: true, isPinned });
            return;
          }

          // star / unstar (per-user)
          let starredBy: string[] = [];
          try {
            starredBy = JSON.parse(msg.starredByJson || '[]');
          } catch {
            starredBy = [];
          }
          const isStarred = action === 'star';
          if (isStarred && !starredBy.includes(userId)) {
            starredBy.push(userId);
          } else if (!isStarred) {
            starredBy = starredBy.filter((id) => id !== userId);
          }

          await prisma.message.update({
            where: { id: messageId },
            data: { starredByJson: JSON.stringify(starredBy) },
          });

          ack?.({ ok: true, isStarred });
        } catch {
          ack?.({ ok: false });
        }
      }
    );

    socket.on('typing:set', async (rawPayload: unknown) => {
      try {
        const parsed = WsTypingPayloadSchema.safeParse(rawPayload);
        if (!parsed.success) return;

        const { conversationId, isTyping } = parsed.data;
        const conv = await prisma.conversation.findUnique({
          where: { id: conversationId },
          include: { memberships: true },
        });
        if (!conv) return;

        const isMember = conv.memberships.some((m) => m.userId === userId);
        if (!isMember) return;

        if (conv.type === 'direct') {
          const peer = conv.memberships.find((m) => m.userId !== userId);
          if (peer && (await areUsersBlocked(userId, peer.userId))) return;
        }

        socket.to(`conv:${conversationId}`).emit('typing:update', {
          conversationId,
          userId,
          displayName,
          isTyping,
        });
      } catch {
        // Ignore transient typing indicator errors
      }
    });

    socket.on('message:delivered', async (rawPayload: unknown) => {
      try {
        const parsed = WsMarkDeliveredPayloadSchema.safeParse(rawPayload);
        if (!parsed.success) return;

        const { conversationId, messageId, seq } = parsed.data;
        const membership = await prisma.membership.findUnique({
          where: { conversationId_userId: { conversationId, userId } },
        });
        if (!membership) return;

        const msg = await prisma.message.findUnique({ where: { id: messageId } });
        if (!msg || msg.conversationId !== conversationId || msg.senderId === userId) return;

        if (msg.status === 'sent') {
          await prisma.message.update({
            where: { id: messageId },
            data: { status: 'delivered' },
          });
        }

        if (seq > membership.lastDeliveredSeq) {
          await prisma.membership.update({
            where: { conversationId_userId: { conversationId, userId } },
            data: { lastDeliveredSeq: seq },
          });
        }

        io.to(`conv:${conversationId}`).emit('message:status', {
          conversationId,
          messageId,
          seq,
          status: msg.status === 'read' ? 'read' : 'delivered',
        });
      } catch {
        // Ignore transient receipt errors
      }
    });

    socket.on('message:read', async (rawPayload: unknown) => {
      try {
        const parsed = WsMarkReadPayloadSchema.safeParse(rawPayload);
        if (!parsed.success) return;

        const { conversationId, seq } = parsed.data;
        const membership = await prisma.membership.findUnique({
          where: { conversationId_userId: { conversationId, userId } },
        });
        if (!membership) return;

        if (seq > membership.lastReadSeq) {
          await prisma.membership.update({
            where: { conversationId_userId: { conversationId, userId } },
            data: {
              lastReadSeq: seq,
              lastDeliveredSeq: Math.max(membership.lastDeliveredSeq, seq),
            },
          });
        }

        const unreadMessages = await prisma.message.findMany({
          where: {
            conversationId,
            senderId: { not: userId },
            seq: { lte: seq },
          },
          select: { id: true, status: true },
        });

        if (unreadMessages.length > 0) {
          await prisma.message.updateMany({
            where: {
              id: { in: unreadMessages.map((m) => m.id) },
              status: { in: ['sent', 'delivered'] },
            },
            data: { status: 'read' },
          });

          for (const m of unreadMessages) {
            await prisma.readReceipt
              .upsert({
                where: { messageId_userId: { messageId: m.id, userId } },
                update: {},
                create: { messageId: m.id, userId },
              })
              .catch(() => undefined);
          }
        }

        io.to(`conv:${conversationId}`).emit('conversation:read', {
          conversationId,
          readerId: userId,
          upToSeq: seq,
        });
      } catch {
        // Ignore transient receipt errors
      }
    });

    socket.on('sync:resume', async (rawPayload: unknown, ack?: (res: WsSyncResumeAck) => void) => {
      try {
        const parsed = WsSyncResumePayloadSchema.safeParse(rawPayload);
        if (!parsed.success) {
          ack?.({ ok: false, missedMessages: {} });
          return;
        }

        const userMemberships = await prisma.membership.findMany({
          where: { userId },
          select: { conversationId: true },
        });
        const allowedConvIds = new Set(userMemberships.map((m) => m.conversationId));

        const missedMessages: Record<string, MessageDTO[]> = {};

        for (const [convId, lastSeenSeq] of Object.entries(parsed.data.cursors)) {
          if (!allowedConvIds.has(convId)) continue;
          socket.join(`conv:${convId}`);

          const missed = await prisma.message.findMany({
            where: {
              conversationId: convId,
              seq: { gt: lastSeenSeq },
            },
            orderBy: { seq: 'asc' },
            take: 200,
            include: {
              sender: {
                select: { id: true, username: true, displayName: true, avatarUrl: true },
              },
              attachment: true,
              reactions: {
                include: { user: { select: { username: true } } },
              },
              replyTo: {
                include: { sender: { select: { displayName: true } } },
              },
              _count: {
                select: { threadReplies: true },
              },
            },
          });

          if (missed.length > 0) {
            missedMessages[convId] = missed.map((m) => formatMessageDTO(m, userId));
          }
        }

        ack?.({ ok: true, missedMessages });
      } catch {
        ack?.({ ok: false, missedMessages: {} });
      }
    });

    // ========================================================================
    // 2. WebRTC Voice & Video Call Signaling (Phase 5)
    // ========================================================================
    socket.on(
      'call:initiate',
      async (
        rawPayload: unknown,
        ack?: (res: { ok: boolean; status?: CallStatus; error?: string }) => void
      ) => {
        try {
          const parsed = WsCallInitiatePayloadSchema.safeParse(rawPayload);
          if (!parsed.success) {
            ack?.({ ok: false, error: 'Invalid call initiation payload' });
            return;
          }

          const {
            callId,
            conversationId,
            mediaType,
            isGroup,
            e2eeKeyMaterial,
            keyGeneration,
          } = parsed.data;

          const conv = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: { memberships: true },
          });

          if (!conv) {
            ack?.({ ok: false, error: 'Conversation not found' });
            return;
          }

          const isMember = conv.memberships.some((m) => m.userId === userId);
          if (!isMember) {
            ack?.({ ok: false, error: 'Not a member of this conversation' });
            return;
          }

          const targetMemberIds = conv.memberships
            .map((m) => m.userId)
            .filter((id) => id !== userId);

          if (conv.type === 'direct' && targetMemberIds.length === 1) {
            const peerId = targetMemberIds[0]!;
            if (await areUsersBlocked(userId, peerId)) {
              ack?.({ ok: false, error: 'Cannot call a blocked user' });
              return;
            }

            if (isUserInActiveCall(peerId)) {
              await prisma.callLog.create({
                data: {
                  id: callId,
                  conversationId,
                  initiatorId: userId,
                  mediaType,
                  isGroup: false,
                  status: 'busy',
                  endedAt: new Date(),
                },
              });

              const busySession: ActiveCallSession = {
                callId,
                conversationId,
                initiatorId: userId,
                initiatorName: displayName,
                mediaType,
                isGroup: false,
                status: 'busy',
                participants: new Set([userId]),
                invitedIds: new Set([peerId]),
                keyGeneration,
                startedAt: Date.now(),
                answeredAt: null,
              };
              await finalizeCallAndInsertChatLog(busySession, 'busy');
              socket.emit('call:busy', { callId, conversationId, busyUserId: peerId });
              ack?.({ ok: true, status: 'busy' });
              return;
            }
          }

          await prisma.callLog.create({
            data: {
              id: callId,
              conversationId,
              initiatorId: userId,
              mediaType,
              isGroup,
              status: 'ringing',
            },
          });

          const session: ActiveCallSession = {
            callId,
            conversationId,
            initiatorId: userId,
            initiatorName: displayName,
            mediaType,
            isGroup: isGroup || conv.type === 'group',
            status: 'ringing',
            participants: new Set([userId]),
            invitedIds: new Set(targetMemberIds),
            keyGeneration,
            startedAt: Date.now(),
            answeredAt: null,
          };
          activeCalls.set(callId, session);

          for (const targetId of targetMemberIds) {
            emitToUser(targetId, 'call:incoming', {
              callId,
              conversationId,
              initiatorId: userId,
              initiatorName: displayName,
              mediaType,
              isGroup: session.isGroup,
              e2eeKeyMaterial,
              keyGeneration,
            });
          }

          ack?.({ ok: true, status: 'ringing' });
        } catch {
          ack?.({ ok: false, error: 'Failed to initiate call' });
        }
      }
    );

    socket.on(
      'call:accept',
      async (rawPayload: unknown, ack?: (res: { ok: boolean; error?: string; participants?: string[] }) => void) => {
        try {
          const parsed = WsCallResponsePayloadSchema.safeParse(rawPayload);
          if (!parsed.success) {
            ack?.({ ok: false, error: 'Invalid accept payload' });
            return;
          }

          const { callId, conversationId } = parsed.data;
          const call = activeCalls.get(callId);
          if (!call || call.conversationId !== conversationId) {
            ack?.({ ok: false, error: 'Call is no longer active' });
            return;
          }

          if (!call.invitedIds.has(userId) && !call.participants.has(userId)) {
            ack?.({ ok: false, error: 'Not invited to this call' });
            return;
          }

          if (call.participants.size >= MAX_GROUP_MESH_PARTICIPANTS) {
            ack?.({ ok: false, error: 'Group call mesh is full (max 4 participants)' });
            return;
          }

          call.participants.add(userId);
          if (call.status === 'ringing') {
            call.status = 'ongoing';
            call.answeredAt = Date.now();
            await prisma.callLog
              .update({
                where: { id: callId },
                data: { status: 'ongoing', answeredAt: new Date() },
              })
              .catch(() => undefined);
          }

          for (const participantId of call.participants) {
            if (participantId !== userId) {
              emitToUser(participantId, 'call:participant-joined', {
                callId,
                conversationId,
                userId,
                displayName,
                participants: Array.from(call.participants),
              });
            }
          }

          ack?.({ ok: true, participants: Array.from(call.participants) });
        } catch {
          ack?.({ ok: false, error: 'Failed to accept call' });
        }
      }
    );

    socket.on(
      'call:decline',
      async (rawPayload: unknown, ack?: (res: { ok: boolean }) => void) => {
        try {
          const parsed = WsCallResponsePayloadSchema.safeParse(rawPayload);
          if (!parsed.success) {
            ack?.({ ok: false });
            return;
          }

          const { callId, conversationId } = parsed.data;
          const call = activeCalls.get(callId);
          if (!call || call.conversationId !== conversationId) {
            ack?.({ ok: false });
            return;
          }

          call.invitedIds.delete(userId);

          if (!call.isGroup || call.invitedIds.size === 0) {
            for (const pid of call.participants) {
              emitToUser(pid, 'call:ended', {
                callId,
                conversationId,
                reason: 'declined',
                byUserId: userId,
              });
            }
            await finalizeCallAndInsertChatLog(call, 'declined');
          }

          ack?.({ ok: true });
        } catch {
          ack?.({ ok: false });
        }
      }
    );

    socket.on(
      'call:timeout',
      async (rawPayload: unknown, ack?: (res: { ok: boolean }) => void) => {
        try {
          const parsed = WsCallResponsePayloadSchema.safeParse(rawPayload);
          if (!parsed.success) {
            ack?.({ ok: false });
            return;
          }

          const { callId, conversationId } = parsed.data;
          const call = activeCalls.get(callId);
          if (!call || call.conversationId !== conversationId || call.status !== 'ringing') {
            ack?.({ ok: false });
            return;
          }

          const allTargetIds = new Set([...call.participants, ...call.invitedIds]);
          for (const uid of allTargetIds) {
            emitToUser(uid, 'call:ended', {
              callId,
              conversationId,
              reason: 'missed',
              byUserId: userId,
            });
          }

          await finalizeCallAndInsertChatLog(call, 'missed');
          ack?.({ ok: true });
        } catch {
          ack?.({ ok: false });
        }
      }
    );

    socket.on(
      'call:hangup',
      async (rawPayload: unknown, ack?: (res: { ok: boolean }) => void) => {
        try {
          const parsed = WsCallResponsePayloadSchema.safeParse(rawPayload);
          if (!parsed.success) {
            ack?.({ ok: false });
            return;
          }

          const { callId, conversationId } = parsed.data;
          const call = activeCalls.get(callId);
          if (!call || call.conversationId !== conversationId) {
            ack?.({ ok: false });
            return;
          }

          call.participants.delete(userId);

          if (!call.isGroup || call.participants.size <= 1) {
            const finalStatus: CallStatus =
              call.answeredAt !== null ? 'completed' : 'missed';
            const notifyTargets = new Set([...call.participants, ...call.invitedIds]);
            for (const uid of notifyTargets) {
              emitToUser(uid, 'call:ended', {
                callId,
                conversationId,
                reason: finalStatus,
                byUserId: userId,
              });
            }
            await finalizeCallAndInsertChatLog(call, finalStatus);
          } else {
            call.keyGeneration += 1;
            const rotatedKeyMaterial = crypto.randomBytes(32).toString('base64');

            for (const remainingId of call.participants) {
              emitToUser(remainingId, 'call:participant-left', {
                callId,
                conversationId,
                leftUserId: userId,
                participants: Array.from(call.participants),
                rotatedKeyGeneration: call.keyGeneration,
                rotatedKeyMaterial,
              });
            }
          }

          ack?.({ ok: true });
        } catch {
          ack?.({ ok: false });
        }
      }
    );

    socket.on('call:signal', async (rawPayload: unknown) => {
      try {
        const parsed = WsCallSignalPayloadSchema.safeParse(rawPayload);
        if (!parsed.success) return;

        const {
          callId,
          conversationId,
          targetUserId,
          signalType,
          sdp,
          candidate,
          mediaState,
          e2eeKeyMaterial,
          keyGeneration,
        } = parsed.data;

        const call = activeCalls.get(callId);
        if (!call || call.conversationId !== conversationId) return;

        emitToUser(targetUserId, 'call:signal', {
          callId,
          conversationId,
          fromUserId: userId,
          fromDisplayName: displayName,
          signalType,
          sdp,
          candidate,
          mediaState,
          e2eeKeyMaterial,
          keyGeneration,
        });
      } catch {
        // Ignore transient signaling relay errors
      }
    });

    socket.on('disconnect', async () => {
      const currentSet = onlineUsers.get(userId);
      if (currentSet) {
        currentSet.delete(socket.id);
        if (currentSet.size === 0) {
          onlineUsers.delete(userId);
          const now = new Date();
          await prisma.user
            .update({ where: { id: userId }, data: { lastSeenAt: now } })
            .catch(() => undefined);
          io.emit('presence:update', {
            userId,
            isOnline: false,
            lastSeenAt: now.toISOString(),
          });
        }
      }
    });
  });

  return io;
}

export async function closeSocketServer(): Promise<void> {
  if (ioInstance) {
    await new Promise<void>((resolve) => {
      ioInstance!.close(() => resolve());
    });
    ioInstance = null;
  }
  onlineUsers.clear();
  activeCalls.clear();
}
