import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import cookie from 'cookie';
import {
  WsSendMessagePayloadSchema,
  WsMarkDeliveredPayloadSchema,
  WsMarkReadPayloadSchema,
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

interface AuthenticatedSocket extends Socket {
  userId: string;
  username: string;
}

const onlineUsers = new Map<string, Set<string>>();
let ioInstance: SocketIOServer | null = null;

export function isUserOnline(userId: string): boolean {
  const sockets = onlineUsers.get(userId);
  return Boolean(sockets && sockets.size > 0);
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
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (rawSocket) => {
    const socket = rawSocket as AuthenticatedSocket;
    const { userId } = socket;

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

    // 1. Send Message (Idempotent via client UUID + Atomic Per-Conversation Sequence Number)
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

        const membership = await prisma.membership.findUnique({
          where: {
            conversationId_userId: { conversationId, userId },
          },
        });

        if (!membership) {
          ack?.({
            ok: false,
            code: 'FORBIDDEN',
            error: 'You are not a member of this conversation.',
          });
          return;
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

        //Ensure socket is joined to conversation room and broadcast in real time
        socket.join(`conv:${conversationId}`);
        io.to(`conv:${conversationId}`).emit('message:new', dto);

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

    // 2. Delivery Receipt Acknowledgement
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

    // 3. Read Receipt Acknowledgement
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

        await prisma.message.updateMany({
          where: {
            conversationId,
            senderId: { not: userId },
            seq: { lte: seq },
            status: { in: ['sent', 'delivered'] },
          },
          data: { status: 'read' },
        });

        io.to(`conv:${conversationId}`).emit('conversation:read', {
          conversationId,
          readerId: userId,
          upToSeq: seq,
        });
      } catch {
        // Ignore transient receipt errors
      }
    });

    // 4. Reconnect Catch-Up (`sync:resume` from last-seen sequence number per conversation)
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
