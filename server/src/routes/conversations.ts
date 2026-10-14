import { Router } from 'express';
import {
  CreateDirectConversationSchema,
  CursorPaginationQuerySchema,
  type ConversationSummary,
  type MessageDTO,
} from '@kamand/shared';
import { prisma } from '../db.js';
import { requireAuth, toUserSummary } from '../middleware/auth.js';
import { csrfProtection } from '../security/csrf.js';
import { isUserOnline, notifyConversationCreated } from '../ws/socketServer.js';

export const conversationsRouter = Router();

export function formatMessageDTO(msg: {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  ciphertext: string | null;
  nonce: string | null;
  type: string;
  replyToId: string | null;
  seq: number;
  status: string;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  sender: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  replyTo?: {
    id: string;
    body: string;
    sender: { displayName: string };
  } | null;
}): MessageDTO {
  return {
    id: msg.id,
    conversationId: msg.conversationId,
    senderId: msg.senderId,
    sender: {
      id: msg.sender.id,
      username: msg.sender.username,
      displayName: msg.sender.displayName,
      avatarUrl: msg.sender.avatarUrl,
    },
    body: msg.deletedAt ? 'This message was deleted' : msg.body,
    ciphertext: msg.ciphertext,
    nonce: msg.nonce,
    type: (msg.type as MessageDTO['type']) || 'text',
    replyToId: msg.replyToId,
    replyToPreview: msg.replyTo
      ? {
          id: msg.replyTo.id,
          senderName: msg.replyTo.sender.displayName,
          body: msg.replyTo.body.slice(0, 120),
        }
      : null,
    seq: msg.seq,
    status: (msg.status as MessageDTO['status']) || 'sent',
    editedAt: msg.editedAt ? msg.editedAt.toISOString() : null,
    deletedAt: msg.deletedAt ? msg.deletedAt.toISOString() : null,
    createdAt: msg.createdAt.toISOString(),
  };
}

export async function buildConversationSummary(
  conversationId: string,
  viewerUserId: string
): Promise<ConversationSummary | null> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      memberships: {
        include: { user: true },
      },
      messages: {
        orderBy: { seq: 'desc' },
        take: 1,
        include: {
          sender: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
          replyTo: {
            include: {
              sender: { select: { displayName: true } },
            },
          },
        },
      },
    },
  });

  if (!conv) return null;

  const viewerMembership = conv.memberships.find((m) => m.userId === viewerUserId);
  if (!viewerMembership) return null;

  const unreadCount = Math.max(0, conv.lastSeq - viewerMembership.lastReadSeq);
  const lastMsg = conv.messages[0] ? formatMessageDTO(conv.messages[0]) : null;

  return {
    id: conv.id,
    type: (conv.type as 'direct' | 'group') || 'direct',
    title: conv.title,
    lastSeq: conv.lastSeq,
    unreadCount,
    lastReadSeq: viewerMembership.lastReadSeq,
    updatedAt: conv.updatedAt.toISOString(),
    participants: conv.memberships.map((m) => ({
      ...toUserSummary(m.user),
      isOnline: isUserOnline(m.user.id),
    })),
    lastMessage: lastMsg,
  };
}

conversationsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser!.id;

    const memberships = await prisma.membership.findMany({
      where: { userId },
      select: { conversationId: true },
    });

    const summaries = await Promise.all(
      memberships.map((m) => buildConversationSummary(m.conversationId, userId))
    );

    const validSummaries = summaries
      .filter((s): s is ConversationSummary => s !== null)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    res.status(200).json({ conversations: validSummaries });
  } catch (err) {
    next(err);
  }
});

conversationsRouter.post('/direct', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const parsed = CreateDirectConversationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid target user',
      });
      return;
    }

    const currentUserId = req.authUser!.id;
    const { targetUserId } = parsed.data;

    if (currentUserId === targetUserId) {
      res.status(400).json({ error: 'Cannot start a direct conversation with yourself.' });
      return;
    }

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser || targetUser.isSuspended) {
      res.status(404).json({ error: 'Target user not found.' });
      return;
    }

    const [firstId, secondId] = [currentUserId, targetUserId].sort();
    const directPairKey = `${firstId}:${secondId}`;

    let conv = await prisma.conversation.findUnique({
      where: { directPairKey },
    });

    let wasCreated = false;
    if (!conv) {
      conv = await prisma.conversation.create({
        data: {
          type: 'direct',
          directPairKey,
          memberships: {
            create: [
              { userId: currentUserId, role: 'member' },
              { userId: targetUserId, role: 'member' },
            ],
          },
        },
      });
      wasCreated = true;
    }

    const summary = await buildConversationSummary(conv.id, currentUserId);
    if (wasCreated) {
      await notifyConversationCreated(conv.id, [currentUserId, targetUserId]);
    }

    res.status(wasCreated ? 201 : 200).json({ conversation: summary });
  } catch (err) {
    next(err);
  }
});

conversationsRouter.get('/:id/messages', requireAuth, async (req, res, next) => {
  try {
    const conversationId = req.params.id;
    const userId = req.authUser!.id;

    const membership = await prisma.membership.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    if (!membership) {
      res.status(403).json({ error: 'You are not a member of this conversation.' });
      return;
    }

    const parsedQuery = CursorPaginationQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json({ error: 'Invalid pagination parameters' });
      return;
    }

    const { beforeSeq, limit } = parsedQuery.data;

    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        ...(beforeSeq !== undefined ? { seq: { lt: beforeSeq } } : {}),
      },
      orderBy: { seq: 'desc' },
      take: limit + 1,
      include: {
        sender: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
        replyTo: {
          include: {
            sender: { select: { displayName: true } },
          },
        },
      },
    });

    const hasMore = messages.length > limit;
    const pageItems = hasMore ? messages.slice(0, limit) : messages;
    const orderedAsc = pageItems.reverse().map(formatMessageDTO);
    const nextCursor = hasMore && orderedAsc.length > 0 ? orderedAsc[0]!.seq : null;

    res.status(200).json({
      messages: orderedAsc,
      nextCursor,
      hasMore,
    });
  } catch (err) {
    next(err);
  }
});
