import { Router } from 'express';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';

export const callsRouter = Router();

// 1. Return STUN + optional TURN ICE servers configured via environment variables (§2, §10)
callsRouter.get('/ice-config', requireAuth, (_req, res) => {
  const iceServers: Array<{
    urls: string | string[];
    username?: string;
    credential?: string;
  }> = [
    {
      urls: config.stunUrls,
    },
  ];

  if (config.turnUrl) {
    iceServers.push({
      urls: config.turnUrl,
      ...(config.turnUsername ? { username: config.turnUsername } : {}),
      ...(config.turnCredential ? { credential: config.turnCredential } : {}),
    });
  }

  res.status(200).json({ iceServers });
});

// 2. Fetch call history logs for a conversation
callsRouter.get('/history/:conversationId', requireAuth, async (req, res, next) => {
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

    const logs = await prisma.callLog.findMany({
      where: { conversationId },
      orderBy: { startedAt: 'desc' },
      take: 30,
    });

    res.status(200).json({
      callLogs: logs.map((l) => ({
        id: l.id,
        conversationId: l.conversationId,
        initiatorId: l.initiatorId,
        mediaType: l.mediaType,
        isGroup: l.isGroup,
        status: l.status,
        durationSec: l.durationSec,
        startedAt: l.startedAt.toISOString(),
        endedAt: l.endedAt ? l.endedAt.toISOString() : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});
