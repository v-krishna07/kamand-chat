import { Router } from 'express';
import { UpdateProfileInputSchema } from '@kamand/shared';
import { prisma } from '../db.js';
import { requireAuth, toUserSummary } from '../middleware/auth.js';
import { csrfProtection } from '../security/csrf.js';
import { areUsersAcceptedContacts, areUsersBlocked } from './contacts.js';
import { isUserOnline } from '../ws/socketServer.js';

export const profileRouter = Router();

profileRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.authUser!.id } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.status(200).json({
      user: toUserSummary(user, { isSelf: true, canSeePrivateRoom: true, isOnline: true }),
      qrPayload: `kamand://contact/${user.id}:${user.username}`,
    });
  } catch (err) {
    next(err);
  }
});

profileRouter.patch('/me', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const parsed = UpdateProfileInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid profile data',
      });
      return;
    }

    const userId = req.authUser!.id;
    const { displayName, bio, avatarUrl, roomCode, isRoomPrivate } = parsed.data;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(displayName !== undefined ? { displayName } : {}),
        ...(bio !== undefined ? { bio } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl: avatarUrl || null } : {}),
        ...(roomCode !== undefined ? { roomCode } : {}),
        ...(isRoomPrivate !== undefined ? { isRoomPrivate } : {}),
      },
    });

    res.status(200).json({
      user: toUserSummary(updated, { isSelf: true, canSeePrivateRoom: true, isOnline: true }),
    });
  } catch (err) {
    next(err);
  }
});

profileRouter.get('/:userId', requireAuth, async (req, res, next) => {
  try {
    const viewerId = req.authUser!.id;
    const { userId } = req.params;

    if (await areUsersBlocked(viewerId, userId)) {
      res.status(404).json({ error: 'User profile not available.' });
      return;
    }

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.isSuspended) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const isSelf = viewerId === target.id;
    const isContact = isSelf || (await areUsersAcceptedContacts(viewerId, target.id));

    res.status(200).json({
      user: toUserSummary(target, {
        isSelf,
        canSeePrivateRoom: isContact,
        isOnline: isUserOnline(target.id),
      }),
      isAcceptedContact: isContact,
    });
  } catch (err) {
    next(err);
  }
});
