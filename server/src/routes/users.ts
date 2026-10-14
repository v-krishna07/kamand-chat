import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth, toUserSummary } from '../middleware/auth.js';
import { isUserOnline } from '../ws/socketServer.js';
import { getAcceptedContactIds } from './contacts.js';

export const usersRouter = Router();

usersRouter.get('/search', requireAuth, async (req, res, next) => {
  try {
    const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const currentUserId = req.authUser!.id;

    // Exclude users who blocked currentUser or whom currentUser blocked
    const blocks = await prisma.contact.findMany({
      where: {
        status: 'blocked',
        OR: [{ requesterId: currentUserId }, { targetId: currentUserId }],
      },
      select: { requesterId: true, targetId: true },
    });

    const excludedIds = new Set<string>([currentUserId]);
    for (const b of blocks) {
      excludedIds.add(b.requesterId);
      excludedIds.add(b.targetId);
    }

    const acceptedContactIds = await getAcceptedContactIds(currentUserId);

    const users = await prisma.user.findMany({
      where: {
        id: { notIn: Array.from(excludedIds) },
        isSuspended: false,
        ...(rawQuery.length > 0
          ? {
              OR: [
                { username: { contains: rawQuery.toLowerCase() } },
                { displayName: { contains: rawQuery } },
                { email: { contains: rawQuery.toLowerCase() } },
              ],
            }
          : {}),
      },
      orderBy: { displayName: 'asc' },
      take: 25,
    });

    res.status(200).json({
      users: users.map((u) => {
        const isContact = acceptedContactIds.has(u.id);
        return toUserSummary(u, {
          isSelf: false,
          canSeePrivateRoom: isContact,
          isOnline: isUserOnline(u.id),
        });
      }),
    });
  } catch (err) {
    next(err);
  }
});
