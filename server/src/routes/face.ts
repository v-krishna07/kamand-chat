import crypto from 'node:crypto';
import { Router } from 'express';
import {
  FaceEnrollInputSchema,
  FaceChallengeRequestSchema,
  FaceVerifyLoginInputSchema,
} from '@kamand/shared';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { requireAuth, toUserSummary } from '../middleware/auth.js';
import { csrfProtection, generateRandomToken, hashSessionToken } from '../security/csrf.js';
import { setSessionCookie } from './auth.js';
import { createRateLimitMiddleware, authRateLimiter } from '../security/rateLimit.js';

export const faceRouter = Router();

const CHALLENGE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const MAX_EMBEDDING_DISTANCE = 0.48;    // Strict cosine/Euclidean normalized threshold

/**
 * Verifies an ECDSA P-256 SHA-256 signature over `message` using a JWK or SPKI public key.
 * The server NEVER trusts a bare `{ faceMatched: true }` boolean from the client (§9).
 */
function verifyDeviceChallengeSignature(
  publicKeySerialized: string,
  message: string,
  signatureBase64: string
): boolean {
  try {
    let keyObject: crypto.KeyObject;
    const trimmed = publicKeySerialized.trim();
    if (trimmed.startsWith('{')) {
      const jwk = JSON.parse(trimmed) as crypto.JsonWebKey;
      keyObject = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    } else {
      keyObject = crypto.createPublicKey({
        key: Buffer.from(trimmed, 'base64'),
        format: 'der',
        type: 'spki',
      });
    }

    const sigBuffer = Buffer.from(signatureBase64, 'base64');
    // WebCrypto ECDSA P-256 produces raw r||s (64 bytes) or DER; Node crypto supports both via ieee-p1363
    const isIeeeP1363 = sigBuffer.length === 64;
    return crypto.verify(
      'sha256',
      Buffer.from(message, 'utf8'),
      {
        key: keyObject,
        dsaEncoding: isIeeeP1363 ? 'ieee-p1363' : 'der',
      },
      sigBuffer
    );
  } catch {
    return false;
  }
}

// 1. Enroll an on-device Face Template + Device ECDSA Public Key (Never accepts raw images)
faceRouter.post('/enroll', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const parsed = FaceEnrollInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid face enrollment payload',
      });
      return;
    }

    const userId = req.authUser!.id;
    const {
      deviceId,
      deviceName,
      encryptedEmbedding,
      embeddingIv,
      faceSigningPublicKey,
    } = parsed.data;

    // Reject if payload looks like a raw image data URL
    if (encryptedEmbedding.startsWith('data:image/')) {
      res.status(400).json({
        error: 'Raw images must never be uploaded. Submit only an encrypted face embedding.',
      });
      return;
    }

    const template = await prisma.faceTemplate.upsert({
      where: {
        userId_deviceId: { userId, deviceId },
      },
      update: {
        deviceName,
        encryptedEmbedding,
        embeddingIv,
        faceSigningPublicKey,
      },
      create: {
        userId,
        deviceId,
        deviceName,
        encryptedEmbedding,
        embeddingIv,
        faceSigningPublicKey,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'FACE_TEMPLATE_ENROLLED',
        targetId: template.id,
        ipAddress: req.ip ?? null,
      },
    });

    res.status(201).json({
      ok: true,
      template: {
        id: template.id,
        deviceId: template.deviceId,
        deviceName: template.deviceName,
        createdAt: template.createdAt.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 2. Check enrolled face templates for current user
faceRouter.get('/status', requireAuth, async (req, res, next) => {
  try {
    const templates = await prisma.faceTemplate.findMany({
      where: { userId: req.authUser!.id },
      select: {
        id: true,
        deviceId: true,
        deviceName: true,
        createdAt: true,
      },
    });

    res.status(200).json({ templates });
  } catch (err) {
    next(err);
  }
});

// 3. Delete all enrolled face data (One-tap privacy deletion in Settings)
faceRouter.delete('/', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const userId = req.authUser!.id;
    await prisma.$transaction([
      prisma.faceTemplate.deleteMany({ where: { userId } }),
      prisma.faceChallenge.deleteMany({ where: { userId } }),
      prisma.auditLog.create({
        data: {
          actorId: userId,
          action: 'FACE_DATA_DELETED',
          ipAddress: req.ip ?? null,
        },
      }),
    ]);

    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// 4. Issue a single-use, 2-minute cryptographic challenge for Face Login
faceRouter.post(
  '/challenge',
  createRateLimitMiddleware(authRateLimiter),
  async (req, res, next) => {
    try {
      const parsed = FaceChallengeRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Username/email and deviceId are required.' });
        return;
      }

      const identifier = parsed.data.identifier.toLowerCase();
      const { deviceId } = parsed.data;

      const user = await prisma.user.findFirst({
        where: {
          OR: [{ username: identifier }, { email: identifier }],
        },
      });

      if (!user || user.isSuspended) {
        res.status(404).json({ error: 'No face enrollment found for this user and device.' });
        return;
      }

      const template = await prisma.faceTemplate.findUnique({
        where: {
          userId_deviceId: { userId: user.id, deviceId },
        },
      });

      if (!template) {
        res.status(404).json({ error: 'No face enrollment found on this device.' });
        return;
      }

      const challengeNonce = generateRandomToken(32);
      const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);

      const challengeRecord = await prisma.faceChallenge.create({
        data: {
          userId: user.id,
          deviceId,
          challenge: challengeNonce,
          expiresAt,
        },
      });

      res.status(200).json({
        challengeId: challengeRecord.id,
        challenge: challengeRecord.challenge,
        encryptedEmbedding: template.encryptedEmbedding,
        embeddingIv: template.embeddingIv,
        expiresAt: challengeRecord.expiresAt.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// 5. Verify signed Face Challenge & Liveness -> Establish Session
faceRouter.post(
  '/verify',
  createRateLimitMiddleware(authRateLimiter),
  async (req, res, next) => {
    try {
      const parsed = FaceVerifyLoginInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: parsed.error.issues[0]?.message || 'Invalid face verification payload',
        });
        return;
      }

      const {
        challengeId,
        deviceId,
        livenessGesture,
        embeddingDistance,
        signatureBase64,
      } = parsed.data;

      const challengeRecord = await prisma.faceChallenge.findUnique({
        where: { id: challengeId },
        include: { user: true },
      });

      if (!challengeRecord || challengeRecord.deviceId !== deviceId) {
        res.status(401).json({ error: 'Invalid face login challenge.' });
        return;
      }

      // Reject replayed challenges
      if (challengeRecord.usedAt !== null) {
        res.status(401).json({ error: 'Face login challenge has already been used (replay rejected).' });
        return;
      }

      // Reject expired challenges
      if (challengeRecord.expiresAt.getTime() <= Date.now()) {
        res.status(401).json({ error: 'Face login challenge has expired.' });
        return;
      }

      // Check embedding distance threshold
      if (embeddingDistance > MAX_EMBEDDING_DISTANCE) {
        res.status(401).json({ error: 'Face verification did not match enrolled template.' });
        return;
      }

      const template = await prisma.faceTemplate.findUnique({
        where: {
          userId_deviceId: { userId: challengeRecord.userId, deviceId },
        },
      });

      if (!template) {
        res.status(401).json({ error: 'Enrolled face template not found.' });
        return;
      }

      // Verify ECDSA signature over `${challengeRecord.challenge}:${deviceId}:${livenessGesture}`
      const signedPayload = `${challengeRecord.challenge}:${deviceId}:${livenessGesture}`;
      const isSignatureValid = verifyDeviceChallengeSignature(
        template.faceSigningPublicKey,
        signedPayload,
        signatureBase64
      );

      if (!isSignatureValid) {
        res.status(401).json({
          error: 'Cryptographic signature verification failed for face challenge.',
        });
        return;
      }

      const rawToken = generateRandomToken(32);
      const tokenHash = hashSessionToken(rawToken);
      const csrfToken = generateRandomToken(24);
      const expiresAt = new Date(Date.now() + config.sessionTtlMs);

      await prisma.$transaction([
        prisma.faceChallenge.update({
          where: { id: challengeRecord.id },
          data: { usedAt: new Date() },
        }),
        prisma.session.create({
          data: {
            tokenHash,
            csrfToken,
            userId: challengeRecord.user.id,
            userAgent: req.header('user-agent') ?? null,
            ipAddress: req.ip ?? null,
            expiresAt,
          },
        }),
        prisma.auditLog.create({
          data: {
            actorId: challengeRecord.user.id,
            action: 'USER_FACE_LOGGED_IN',
            metadata: JSON.stringify({ deviceId, livenessGesture }),
            ipAddress: req.ip ?? null,
          },
        }),
      ]);

      setSessionCookie(res, rawToken);
      res.status(200).json({
        user: toUserSummary(challengeRecord.user),
        csrfToken,
      });
    } catch (err) {
      next(err);
    }
  }
);
