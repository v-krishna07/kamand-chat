import { Router } from 'express';
import {
  ContactRequestInputSchema,
  RespondContactInputSchema,
  BlockUserInputSchema,
  type ContactDTO,
} from '@kamand/shared';
import { prisma } from '../db.js';
import { requireAuth, toUserSummary } from '../middleware/auth.js';
import { csrfProtection } from '../security/csrf.js';
import { isUserOnline, emitToUser } from '../ws/socketServer.js';

export const contactsRouter = Router();

/**
 * Returns true if either userA has blocked userB OR userB has blocked userA.
 */
export async function areUsersBlocked(userA: string, userB: string): Promise<boolean> {
  if (userA === userB) return false;
  const blockRecord = await prisma.contact.findFirst({
    where: {
      status: 'blocked',
      OR: [
        { requesterId: userA, targetId: userB },
        { requesterId: userB, targetId: userA },
      ],
    },
    select: { id: true },
  });
  return Boolean(blockRecord);
}

/**
 * Returns a Set of user IDs that have a mutually accepted contact relationship with `userId`.
 */
export async function getAcceptedContactIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.contact.findMany({
    where: {
      status: 'accepted',
      OR: [{ requesterId: userId }, { targetId: userId }],
    },
    select: { requesterId: true, targetId: true },
  });

  const ids = new Set<string>();
  for (const r of rows) {
    ids.add(r.requesterId === userId ? r.targetId : r.requesterId);
  }
  return ids;
}

export async function areUsersAcceptedContacts(userA: string, userB: string): Promise<boolean> {
  if (userA === userB) return true;
  const row = await prisma.contact.findFirst({
    where: {
      status: 'accepted',
      OR: [
        { requesterId: userA, targetId: userB },
        { requesterId: userB, targetId: userA },
      ],
    },
    select: { id: true },
  });
  return Boolean(row);
}

/**
 * Parses a QR string (`kamand://contact/<uuid>:<username>` or `kamand://contact/<username>`)
 * or plain username/email.
 */
function parseIdentifier(raw: string): { qrUserId?: string; lookup: string } {
  const trimmed = raw.trim();
  if (trimmed.toLowerCase().startsWith('kamand://contact/')) {
    const payload = trimmed.slice('kamand://contact/'.length).trim();
    const parts = payload.split(':');
    if (parts.length >= 2 && parts[0]!.length === 36) {
      return { qrUserId: parts[0]!, lookup: parts[1]!.toLowerCase() };
    }
    return { lookup: payload.toLowerCase() };
  }
  const withoutAt = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  return { lookup: withoutAt.toLowerCase() };
}

contactsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser!.id;

    const records = await prisma.contact.findMany({
      where: {
        OR: [{ requesterId: userId }, { targetId: userId }],
      },
      include: {
        requester: true,
        target: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const contacts: ContactDTO[] = [];

    for (const row of records) {
      // If the other user blocked currentUser, do not leak the block record to currentUser
      if (row.status === 'blocked' && row.requesterId !== userId) {
        continue;
      }

      const isOutgoing = row.requesterId === userId;
      const peerRecord = isOutgoing ? row.target : row.requester;
      const isAccepted = row.status === 'accepted';

      contacts.push({
        id: row.id,
        status: row.status as ContactDTO['status'],
        direction: isOutgoing ? 'outgoing' : 'incoming',
        peer: toUserSummary(peerRecord, {
          isSelf: false,
          canSeePrivateRoom: isAccepted,
          isOnline: isAccepted ? isUserOnline(peerRecord.id) : false,
        }),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
    }

    res.status(200).json({ contacts });
  } catch (err) {
    next(err);
  }
});

contactsRouter.post('/request', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const parsed = ContactRequestInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid contact identifier',
      });
      return;
    }

    const currentUserId = req.authUser!.id;
    const { qrUserId, lookup } = parseIdentifier(parsed.data.identifier);

    const targetUser = await prisma.user.findFirst({
      where: qrUserId
        ? { id: qrUserId, isSuspended: false }
        : {
            isSuspended: false,
            OR: [{ username: lookup }, { email: lookup }, { id: lookup }],
          },
    });

    if (!targetUser) {
      res.status(404).json({ error: 'No user found with that username, email, or QR code.' });
      return;
    }

    if (targetUser.id === currentUserId) {
      res.status(400).json({ error: 'You cannot add yourself as a contact.' });
      return;
    }

    if (await areUsersBlocked(currentUserId, targetUser.id)) {
      res.status(403).json({ error: 'Cannot send a contact request to this user.' });
      return;
    }

    const existing = await prisma.contact.findFirst({
      where: {
        OR: [
          { requesterId: currentUserId, targetId: targetUser.id },
          { requesterId: targetUser.id, targetId: currentUserId },
        ],
      },
      include: { requester: true, target: true },
    });

    if (existing) {
      if (existing.status === 'accepted') {
        res.status(409).json({ error: `${targetUser.displayName} is already in your contacts.` });
        return;
      }

      // If targetUser already sent a pending request to currentUser, auto-accept it!
      if (existing.status === 'pending' && existing.requesterId === targetUser.id) {
        const accepted = await prisma.contact.update({
          where: { id: existing.id },
          data: { status: 'accepted' },
          include: { requester: true, target: true },
        });

        const dtoForCurrent: ContactDTO = {
          id: accepted.id,
          status: 'accepted',
          direction: 'incoming',
          peer: toUserSummary(targetUser, {
            isSelf: false,
            canSeePrivateRoom: true,
            isOnline: isUserOnline(targetUser.id),
          }),
          createdAt: accepted.createdAt.toISOString(),
          updatedAt: accepted.updatedAt.toISOString(),
        };

        emitToUser(targetUser.id, 'contact:updated', {
          id: accepted.id,
          status: 'accepted',
          byUserId: currentUserId,
        });

        res.status(200).json({ contact: dtoForCurrent, autoAccepted: true });
        return;
      }

      res.status(409).json({ error: 'A contact request is already pending.' });
      return;
    }

    const created = await prisma.contact.create({
      data: {
        requesterId: currentUserId,
        targetId: targetUser.id,
        status: 'pending',
      },
      include: { requester: true, target: true },
    });

    const dtoForRequester: ContactDTO = {
      id: created.id,
      status: 'pending',
      direction: 'outgoing',
      peer: toUserSummary(targetUser, {
        isSelf: false,
        canSeePrivateRoom: false,
        isOnline: false,
      }),
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };

    const dtoForTarget: ContactDTO = {
      id: created.id,
      status: 'pending',
      direction: 'incoming',
      peer: toUserSummary(created.requester, {
        isSelf: false,
        canSeePrivateRoom: false,
        isOnline: false,
      }),
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };

    emitToUser(targetUser.id, 'contact:request', dtoForTarget);

    res.status(201).json({ contact: dtoForRequester });
  } catch (err) {
    next(err);
  }
});

contactsRouter.post('/:id/respond', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const parsed = RespondContactInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid response action' });
      return;
    }

    const contactId = req.params.id;
    const currentUserId = req.authUser!.id;
    const { action } = parsed.data;

    const record = await prisma.contact.findUnique({
      where: { id: contactId },
      include: { requester: true, target: true },
    });

    if (!record || record.status !== 'pending') {
      res.status(404).json({ error: 'Pending contact request not found.' });
      return;
    }

    if (record.targetId !== currentUserId) {
      res.status(403).json({ error: 'Only the recipient can accept or decline this request.' });
      return;
    }

    if (action === 'decline') {
      await prisma.contact.delete({ where: { id: contactId } });
      emitToUser(record.requesterId, 'contact:declined', { id: contactId });
      res.status(200).json({ ok: true, status: 'declined' });
      return;
    }

    const updated = await prisma.contact.update({
      where: { id: contactId },
      data: { status: 'accepted' },
      include: { requester: true, target: true },
    });

    const dto: ContactDTO = {
      id: updated.id,
      status: 'accepted',
      direction: 'incoming',
      peer: toUserSummary(updated.requester, {
        isSelf: false,
        canSeePrivateRoom: true,
        isOnline: isUserOnline(updated.requester.id),
      }),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };

    emitToUser(updated.requesterId, 'contact:accepted', {
      id: updated.id,
      peer: toUserSummary(updated.target, {
        isSelf: false,
        canSeePrivateRoom: true,
        isOnline: isUserOnline(updated.target.id),
      }),
    });

    res.status(200).json({ ok: true, contact: dto });
  } catch (err) {
    next(err);
  }
});

contactsRouter.post('/block', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const parsed = BlockUserInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid target user ID' });
      return;
    }

    const currentUserId = req.authUser!.id;
    const { targetUserId } = parsed.data;

    if (currentUserId === targetUserId) {
      res.status(400).json({ error: 'You cannot block yourself.' });
      return;
    }

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    // Remove any reverse contact entry and upsert an explicit block owned by currentUserId
    const blocked = await prisma.$transaction(async (tx) => {
      await tx.contact.deleteMany({
        where: {
          OR: [
            { requesterId: currentUserId, targetId: targetUserId },
            { requesterId: targetUserId, targetId: currentUserId },
          ],
        },
      });

      return tx.contact.create({
        data: {
          requesterId: currentUserId,
          targetId: targetUserId,
          status: 'blocked',
        },
        include: { target: true },
      });
    });

    const dto: ContactDTO = {
      id: blocked.id,
      status: 'blocked',
      direction: 'outgoing',
      peer: toUserSummary(blocked.target, {
        isSelf: false,
        canSeePrivateRoom: false,
        isOnline: false,
      }),
      createdAt: blocked.createdAt.toISOString(),
      updatedAt: blocked.updatedAt.toISOString(),
    };

    res.status(200).json({ ok: true, contact: dto });
  } catch (err) {
    next(err);
  }
});

contactsRouter.delete('/block/:targetUserId', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const currentUserId = req.authUser!.id;
    const { targetUserId } = req.params;

    await prisma.contact.deleteMany({
      where: {
        requesterId: currentUserId,
        targetId: targetUserId,
        status: 'blocked',
      },
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});
