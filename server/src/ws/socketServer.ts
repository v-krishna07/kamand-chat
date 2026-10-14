import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import cookie from 'cookie';
import {
  WsSendMessagePayloadSchema,
  WsMarkDeliveredPayloadSchema,
  WsMarkReadPayloadSchema,
  WsTypingPayloadSchema,
  WsSyncResumePayloadSchema,
  type WsSendMessageAck,
  type WsSyncResumeAck,
  type MessageDTO,
} from '@kamand/shared';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { hashSessionToken } from '../security/csrf.js';
import { wsMessageRateLimiter } from '../security/rateLimit.js';
import { formatMessageDTO, buildConversationSummary } from '../routes/conversations.js';
import { areUsersBlocked } from '../routes/contacts.js';

interface AuthenticatedSocket extends Socket {
  userId: string;
  username: string;
  displayName: string;
}

const onlineUsers = new Map<string, Set<string>>();
let ioInstance: SocketIOServer | null = null;

export function isUserOnline(userId: string): boolean {
  const sockets = onlineUsers.get(userId);
  return Boolean(sockets && sockets.size > 0);
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  if (!ioInstance) return;
  ioInstance.to(`user:${userId}`).emit(event, payload);
}

export async function notifyConversationCreated(
  conversationId: string,
  participantIds: string[]
): Promise<void> {
  if (!ioInstance) return;
  for (const userId of participantIds) {
    const sockets = onlineUsers.get(userId);
    if (sockets) {
      for (const socketId of sockets) {
        const targetSocket = ioInstance.sockets.sockets.get(socketId);
        if (targetSocket) {
          targetSocket.join(`conv:${conversationId}`);
        }
      }
    }
    const summary = await buildConversationSummary(conversationId, userId);
    if (summary) {
      ioInstance.to(`user:${userId}`).emit('conversation:upsert', summary);
    }
  }
}

export function closeSocketServer(): Promise<void> {
  return new Promise((resolve) => {
    if (ioInstance) {
      ioInstance.close(() => {
        ioInstance = null;
        onlineUsers.clear();
        resolve();
      });
    } else {
      resolve();
    }
  });
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

  // Authenticate every WebSocket connection on handshake via HTTP-only session cookie
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

    // Track online presence
    const userSockets = onlineUsers.get(userId) ?? new Set<string>();
    const wasOffline = userSockets.size === 0;
    userSockets.add(socket.id);
    onlineUsers.set(userId, userSockets);

    socket.join(`user:${userId}`);

    // Join all conversation rooms this user belongs to & update presence in background
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
      } catch (err) {
        console.error('Error during socket background initialization:', err);
      }
    })();

    // 1. Send Message (Idempotent via client UUID + Atomic Per-Conversation Sequence Number + Block Enforcement)
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

        const { id, conversationId, body, ciphertext, nonce, type, replyToId } = parsed.data;

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

        // Enforce block check on direct conversations
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

        // Idempotency check: if client message UUID already exists, return it without duplicating
        const existingMessage = await prisma.message.findUnique({
          where: { id },
          include: {
            sender: {
              select: { id: true, username: true, displayName: true, avatarUrl: true },
            },
            replyTo: {
              include: { sender: { select: { displayName: true } } },
            },
          },
        });

        if (existingMessage) {
          if (existingMessage.senderId !== userId || existingMessage.conversationId !== conversationId) {
            ack?.({
              ok: false,
              code: 'FORBIDDEN',
              error: 'Message ID collision with another sender or conversation.',
            });
            return;
          }
          ack?.({
            ok: true,
            message: formatMessageDTO(existingMessage),
            deduplicated: true,
          });
          return;
        }

        // Validate replyToId belongs to the same conversation if provided
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

        // Atomic transaction: increment conversation lastSeq, insert message, mark sender read
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
              body,
              ciphertext: ciphertext ?? null,
              nonce: nonce ?? null,
              type,
              replyToId: replyToId ?? null,
              seq: nextSeq,
              status: 'sent',
            },
            include: {
              sender: {
                select: { id: true, username: true, displayName: true, avatarUrl: true },
              },
              replyTo: {
                include: { sender: { select: { displayName: true } } },
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

        const dto = formatMessageDTO(createdMessage);

        socket.join(`conv:${conversationId}`);
        io.to(`conv:${conversationId}`).emit('message:new', dto);
        // Clear typing indicator on send
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

    // 2. Typing Indicator Events (`typing:start` / `typing:stop` / `typing:set`)
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

    // 3. Delivery Receipt Acknowledgement
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

    // 4. Read Receipt Acknowledgement + ReadReceipt Persistence
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

          // Upsert individual ReadReceipt records
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

    // 5. Reconnect Catch-Up (`sync:resume` from last-seen sequence number per conversation)
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
              replyTo: {
                include: { sender: { select: { displayName: true } } },
              },
            },
          });

          if (missed.length > 0) {
            missedMessages[convId] = missed.map(formatMessageDTO);
          }
        }

        ack?.({ ok: true, missedMessages });
      } catch {
        ack?.({ ok: false, missedMessages: {} });
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
