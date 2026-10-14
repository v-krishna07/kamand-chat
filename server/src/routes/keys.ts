import crypto from 'node:crypto';
import { Router } from 'express';
import {
  RegisterDeviceKeyInputSchema,
  DistributeSenderKeyInputSchema,
  type DeviceDTO,
} from '@kamand/shared';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { csrfProtection } from '../security/csrf.js';
import { emitToUser } from '../ws/socketServer.js';

export const keysRouter = Router();

export function computeKeyFingerprint(identityPublicKey: string, signingPublicKey: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${identityPublicKey}::${signingPublicKey}`)
    .digest('hex')
    .toUpperCase();
  // Format as 12 groups of 5 hex characters for human-verifiable Safety Numbers
  return hash
    .slice(0, 60)
    .match(/.{1,5}/g)!
    .join(' ');
}

function toDeviceDTO(d: {
  id: string;
  userId: string;
  deviceName: string;
  identityPublicKey: string;
  signingPublicKey: string;
  keyFingerprint: string;
  createdAt: Date;
}): DeviceDTO {
  return {
    id: d.id,
    userId: d.userId,
    deviceName: d.deviceName,
    identityPublicKey: d.identityPublicKey,
    signingPublicKey: d.signingPublicKey,
    keyFingerprint:
      d.keyFingerprint || computeKeyFingerprint(d.identityPublicKey, d.signingPublicKey),
    createdAt: d.createdAt.toISOString(),
  };
}

// 1. Register or update the current device's public identity keys + optional PIN-wrapped key backup
keysRouter.post('/devices', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const parsed = RegisterDeviceKeyInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid device key payload',
      });
      return;
    }

    const userId = req.authUser!.id;
    const {
      deviceId,
      deviceName,
      identityPublicKey,
      signingPublicKey,
      wrappedPrivateKeyBackup,
      backupSalt,
      backupIv,
    } = parsed.data;

    const keyFingerprint = computeKeyFingerprint(identityPublicKey, signingPublicKey);

    let device;
    if (deviceId) {
      const existing = await prisma.device.findUnique({ where: { id: deviceId } });
      if (existing && existing.userId === userId) {
        const keyChanged = existing.identityPublicKey !== identityPublicKey;
        device = await prisma.device.update({
          where: { id: deviceId },
          data: {
            deviceName,
            identityPublicKey,
            signingPublicKey,
            keyFingerprint,
          },
        });
        if (keyChanged) {
          await prisma.auditLog.create({
            data: {
              actorId: userId,
              action: 'E2EE_IDENTITY_KEY_CHANGED',
              targetId: device.id,
            },
          });
        }
      }
    }

    if (!device) {
      device = await prisma.device.create({
        data: {
          ...(deviceId ? { id: deviceId } : {}),
          userId,
          deviceName,
          identityPublicKey,
          signingPublicKey,
          keyFingerprint,
        },
      });
    }

    if (wrappedPrivateKeyBackup && backupSalt && backupIv) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          wrappedPrivateKeyBackup,
          backupSalt,
          backupIv,
        },
      });
    }

    res.status(201).json({ device: toDeviceDTO(device) });
  } catch (err) {
    next(err);
  }
});

// 2. Fetch another user's public identity keys & Safety Number fingerprint
keysRouter.get('/users/:userId', requireAuth, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const devices = await prisma.device.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });

    res.status(200).json({
      devices: devices.map(toDeviceDTO),
    });
  } catch (err) {
    next(err);
  }
});

// 3. Retrieve own PIN-wrapped key backup
keysRouter.get('/backup/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.authUser!.id },
      select: {
        wrappedPrivateKeyBackup: true,
        backupSalt: true,
        backupIv: true,
      },
    });

    res.status(200).json({
      backup: user?.wrappedPrivateKeyBackup
        ? {
            wrappedPrivateKeyBackup: user.wrappedPrivateKeyBackup,
            backupSalt: user.backupSalt,
            backupIv: user.backupIv,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

// 4. Distribute encrypted Group Sender Keys to conversation members
keysRouter.post('/group-sender-keys', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const parsed = DistributeSenderKeyInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid sender key distribution payload' });
      return;
    }

    const senderId = req.authUser!.id;
    const { conversationId, generation, envelopes } = parsed.data;

    const membership = await prisma.membership.findUnique({
      where: { conversationId_userId: { conversationId, userId: senderId } },
    });
    if (!membership) {
      res.status(403).json({ error: 'You are not a member of this conversation.' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          senderKeyGeneration: Math.max(generation, 1),
        },
      });

      for (const env of envelopes) {
        await tx.groupSenderKey.upsert({
          where: {
            conversationId_senderId_recipientId_generation: {
              conversationId,
              senderId,
              recipientId: env.recipientUserId,
              generation,
            },
          },
          update: {
            wrappedSenderKey: env.wrappedSenderKey,
            nonce: env.nonce,
          },
          create: {
            conversationId,
            senderId,
            recipientId: env.recipientUserId,
            generation,
            wrappedSenderKey: env.wrappedSenderKey,
            nonce: env.nonce,
          },
        });
      }
    });

    for (const env of envelopes) {
      emitToUser(env.recipientUserId, 'e2ee:sender-key', {
        conversationId,
        senderId,
        generation,
      });
    }

    res.status(201).json({ ok: true, generation });
  } catch (err) {
    next(err);
  }
});

// 5. Fetch encrypted Group Sender Keys addressed to current user for a conversation
keysRouter.get('/group-sender-keys/:conversationId', requireAuth, async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const userId = req.authUser!.id;

    const membership = await prisma.membership.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!membership) {
      res.status(403).json({ error: 'You are not a member of this conversation.' });
      return;
    }

    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { senderKeyGeneration: true },
    });

    const keys = await prisma.groupSenderKey.findMany({
      where: {
        conversationId,
        recipientId: userId,
      },
      orderBy: { generation: 'desc' },
    });

    res.status(200).json({
      currentGeneration: conv?.senderKeyGeneration ?? 1,
      senderKeys: keys.map((k) => ({
        id: k.id,
        conversationId: k.conversationId,
        senderId: k.senderId,
        recipientId: k.recipientId,
        generation: k.generation,
        wrappedSenderKey: k.wrappedSenderKey,
        nonce: k.nonce,
      })),
    });
  } catch (err) {
    next(err);
  }
});
