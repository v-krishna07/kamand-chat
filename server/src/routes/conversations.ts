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
import { areUsersBlocked, getAcceptedContactIds } from './contacts.js';

export const conversationsRouter = Router();

function parseStringArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function parseNumberArray(json: string | null | undefined): number[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((x): x is number => typeof x === 'number') : [];
  } catch {
    return [];
  }
}

export function formatMessageDTO(
  msg: {
    id: string;
    conversationId: string;
    senderId: string;
    body: string;
    ciphertext: string | null;
    nonce: string | null;
    senderKeyGeneration?: number | null;
    type: string;
    replyToId: string | null;
    threadRootId?: string | null;
    forwardedFromName?: string | null;
    isPinned?: boolean;
    starredByJson?: string;
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
    attachment?: {
      id: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      isEncrypted: boolean;
      encryptionIv: string | null;
      durationSec: number | null;
      waveformJson: string;
    } | null;
    reactions?: Array<{
      emoji: string;
      userId: string;
      user: { username: string };
    }>;
    _count?: {
      threadReplies?: number;
    };
  },
  viewerUserId?: string
): MessageDTO {
  const starredBy = parseStringArray(msg.starredByJson);

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
    ciphertext: msg.deletedAt ? null : msg.ciphertext,
    nonce: msg.deletedAt ? null : msg.nonce,
    senderKeyGeneration: msg.senderKeyGeneration ?? null,
    type: (msg.type as MessageDTO['type']) || 'text',
    replyToId: msg.replyToId,
    replyToPreview: msg.replyTo
      ? {
          id: msg.replyTo.id,
          senderName: msg.replyTo.sender.displayName,
          body: msg.replyTo.body.slice(0, 120),
        }
      : null,
    threadRootId: msg.threadRootId ?? null,
    threadReplyCount: msg._count?.threadReplies ?? 0,
    isPinned: Boolean(msg.isPinned),
    isStarred: viewerUserId ? starredBy.includes(viewerUserId) : false,
    forwardedFromName: msg.forwardedFromName ?? null,
    reactions: (msg.reactions ?? []).map((r) => ({
      emoji: r.emoji,
      userId: r.userId,
      username: r.user.username,
    })),
    attachment:
      msg.attachment && !msg.deletedAt
        ? {
            id: msg.attachment.id,
            fileName: msg.attachment.fileName,
            mimeType: msg.attachment.mimeType,
            sizeBytes: msg.attachment.sizeBytes,
            url: `/api/media/${msg.attachment.id}`,
            isEncrypted: msg.attachment.isEncrypted,
            encryptionIv: msg.attachment.encryptionIv,
            durationSec: msg.attachment.durationSec,
            waveform: parseNumberArray(msg.attachment.waveformJson),
          }
        : null,
    linkPreview: null,
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
      channel: { select: { id: true } },
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
          attachment: true,
          reactions: {
            include: { user: { select: { username: true } } },
          },
          replyTo: {
            include: {
              sender: { select: { displayName: true } },
            },
          },
          _count: {
            select: { threadReplies: true },
          },
        },
      },
    },
  });

  if (!conv || conv.channel) return null;

  const viewerMembership = conv.memberships.find((m) => m.userId === viewerUserId);
  if (!viewerMembership) return null;

  const acceptedContactIds = await getAcceptedContactIds(viewerUserId);
  let isBlocked = false;

  if (conv.type === 'direct') {
    const peer = conv.memberships.find((m) => m.userId !== viewerUserId);
    if (peer) {
      isBlocked = await areUsersBlocked(viewerUserId, peer.userId);
    }
  }

  const unreadCount = Math.max(0, conv.lastSeq - viewerMembership.lastReadSeq);
  const lastMsg = conv.messages[0] ? formatMessageDTO(conv.messages[0], viewerUserId) : null;

  return {
    id: conv.id,
    type: (conv.type as 'direct' | 'group') || 'direct',
    title: conv.title,
    lastSeq: conv.lastSeq,
    unreadCount,
    lastReadSeq: viewerMembership.lastReadSeq,
    updatedAt: conv.updatedAt.toISOString(),
    participants: conv.memberships.map((m) => {
      const isSelf = m.user.id === viewerUserId;
      const isContact = isSelf || acceptedContactIds.has(m.user.id);
      return toUserSummary(m.user, {
        isSelf,
        canSeePrivateRoom: isContact,
        isOnline: !isBlocked && isUserOnline(m.user.id),
      });
    }),
    lastMessage: lastMsg,
    isBlocked,
    isMuted: viewerMembership.isMuted,
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

// Toggle Per-Chat Mute (§5 Notifications)
conversationsRouter.patch('/:id/mute', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const conversationId = req.params.id;
    const userId = req.authUser!.id;
    const isMuted = Boolean(req.body?.isMuted);

    await prisma.membership.update({
      where: {
        conversationId_userId: { conversationId, userId },
      },
      data: { isMuted },
    });

    res.status(200).json({ ok: true, isMuted });
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

    if (await areUsersBlocked(currentUserId, targetUserId)) {
      res.status(403).json({ error: 'Cannot start a conversation with a blocked user.' });
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
        attachment: true,
        reactions: {
          include: { user: { select: { username: true } } },
        },
        replyTo: {
          include: {
            sender: { select: { displayName: true } },
          },
        },
        _count: {
          select: { threadReplies: true },
        },
      },
    });

    const hasMore = messages.length > limit;
    const pageItems = hasMore ? messages.slice(0, limit) : messages;

    // Filter out messages deleted "for_me" by this user
    const visibleItems = pageItems.filter(
      (m) => !parseStringArray(m.deletedForJson).includes(userId)
    );

    const orderedAsc = visibleItems
      .reverse()
      .map((m) => formatMessageDTO(m, userId));
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
