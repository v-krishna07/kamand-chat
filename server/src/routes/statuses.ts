import { Router } from 'express';
import { CreateStatusInputSchema, type StatusDTO } from '@kamand/shared';
import { prisma } from '../db.js';
import { requireAuth, toUserSummary } from '../middleware/auth.js';
import { csrfProtection } from '../security/csrf.js';
import { getAcceptedContactIds, areUsersAcceptedContacts } from './contacts.js';
import { isUserOnline, emitToUser } from '../ws/socketServer.js';

export const statusesRouter = Router();

const STATUS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function parseAllowedIds(jsonStr: string): string[] {
  try {
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

statusesRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const viewerId = req.authUser!.id;
    const acceptedContactIds = await getAcceptedContactIds(viewerId);
    const authorIds = [viewerId, ...Array.from(acceptedContactIds)];
    const now = new Date();

    const rawStatuses = await prisma.status.findMany({
      where: {
        authorId: { in: authorIds },
        expiresAt: { gt: now },
      },
      include: {
        author: true,
        views: {
          include: {
            viewer: {
              select: { id: true, username: true, displayName: true, avatarUrl: true },
            },
          },
          orderBy: { viewedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const visibleStatuses: StatusDTO[] = [];

    for (const s of rawStatuses) {
      const isAuthor = s.authorId === viewerId;
      if (!isAuthor && s.visibility === 'custom') {
        const allowed = parseAllowedIds(s.allowedUserIds);
        if (!allowed.includes(viewerId)) {
          continue;
        }
      }

      const hasViewed = isAuthor || s.views.some((v) => v.viewerId === viewerId);

      visibleStatuses.push({
        id: s.id,
        author: toUserSummary(s.author, {
          isSelf: isAuthor,
          canSeePrivateRoom: true,
          isOnline: isUserOnline(s.author.id),
        }),
        caption: s.caption,
        mediaDataUrl: s.mediaDataUrl,
        bgColor: s.bgColor,
        visibility: (s.visibility as 'contacts' | 'custom') || 'contacts',
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        hasViewed,
        viewCount: s.views.length,
        views: isAuthor
          ? s.views.map((v) => ({
              viewer: v.viewer,
              viewedAt: v.viewedAt.toISOString(),
            }))
          : undefined,
      });
    }

    res.status(200).json({ statuses: visibleStatuses });
  } catch (err) {
    next(err);
  }
});

statusesRouter.post('/', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const parsed = CreateStatusInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid status payload',
      });
      return;
    }

    const authorId = req.authUser!.id;
    const { caption, mediaDataUrl, bgColor, visibility, allowedUserIds } = parsed.data;
    const expiresAt = new Date(Date.now() + STATUS_TTL_MS);

    const created = await prisma.status.create({
      data: {
        authorId,
        caption,
        mediaDataUrl: mediaDataUrl ?? null,
        bgColor,
        visibility,
        allowedUserIds: JSON.stringify(allowedUserIds),
        expiresAt,
      },
      include: { author: true },
    });

    const dto: StatusDTO = {
      id: created.id,
      author: toUserSummary(created.author, {
        isSelf: true,
        canSeePrivateRoom: true,
        isOnline: true,
      }),
      caption: created.caption,
      mediaDataUrl: created.mediaDataUrl,
      bgColor: created.bgColor,
      visibility: (created.visibility as 'contacts' | 'custom') || 'contacts',
      createdAt: created.createdAt.toISOString(),
      expiresAt: created.expiresAt.toISOString(),
      hasViewed: true,
      viewCount: 0,
      views: [],
    };

    // Notify permitted contacts in real time
    const contactIds = await getAcceptedContactIds(authorId);
    for (const cid of contactIds) {
      if (visibility === 'custom' && !allowedUserIds.includes(cid)) continue;
      emitToUser(cid, 'status:new', {
        ...dto,
        hasViewed: false,
        views: undefined,
      });
    }

    res.status(201).json({ status: dto });
  } catch (err) {
    next(err);
  }
});

statusesRouter.post('/:id/view', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const statusId = req.params.id;
    const viewerId = req.authUser!.id;

    const status = await prisma.status.findUnique({
      where: { id: statusId },
    });

    if (!status || status.expiresAt.getTime() <= Date.now()) {
      res.status(404).json({ error: 'Status not found or expired.' });
      return;
    }

    if (status.authorId === viewerId) {
      res.status(200).json({ ok: true });
      return;
    }

    const isContact = await areUsersAcceptedContacts(viewerId, status.authorId);
    if (!isContact) {
      res.status(403).json({ error: 'Only accepted contacts can view this status.' });
      return;
    }

    if (status.visibility === 'custom') {
      const allowed = parseAllowedIds(status.allowedUserIds);
      if (!allowed.includes(viewerId)) {
        res.status(403).json({ error: 'You do not have permission to view this status.' });
        return;
      }
    }

    const view = await prisma.statusView.upsert({
      where: {
        statusId_viewerId: { statusId, viewerId },
      },
      update: {},
      create: {
        statusId,
        viewerId,
      },
      include: {
        viewer: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
    });

    emitToUser(status.authorId, 'status:viewed', {
      statusId,
      view: {
        viewer: view.viewer,
        viewedAt: view.viewedAt.toISOString(),
      },
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

statusesRouter.delete('/:id', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const statusId = req.params.id;
    const userId = req.authUser!.id;

    const status = await prisma.status.findUnique({ where: { id: statusId } });
    if (!status) {
      res.status(404).json({ error: 'Status not found.' });
      return;
    }
    if (status.authorId !== userId) {
      res.status(403).json({ error: 'You can only delete your own status.' });
      return;
    }

    await prisma.status.delete({ where: { id: statusId } });
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});
