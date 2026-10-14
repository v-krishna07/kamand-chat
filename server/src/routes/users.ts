import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth, toUserSummary } from '../middleware/auth.js';
import { isUserOnline } from '../ws/socketServer.js';

export const usersRouter = Router();

usersRouter.get('/search', requireAuth, async (req, res, next) => {
  try {
    const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const currentUserId = req.authUser!.id;

    const users = await prisma.user.findMany({
      where: {
        id: { not: currentUserId },
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
      users: users.map((u) => ({
        ...toUserSummary(u),
        isOnline: isUserOnline(u.id),
      })),
    });
  } catch (err) {
    next(err);
  }
});
