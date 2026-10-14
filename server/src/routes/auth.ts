import { Router, type Response } from 'express';
import { RegisterInputSchema, LoginInputSchema } from '@kamand/shared';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { hashPassword, verifyPassword } from '../security/password.js';
import { generateRandomToken, hashSessionToken, csrfProtection } from '../security/csrf.js';
import { requireAuth, toUserSummary } from '../middleware/auth.js';
import { createRateLimitMiddleware, authRateLimiter } from '../security/rateLimit.js';

export const authRouter = Router();

function setSessionCookie(res: Response, rawToken: string): void {
  res.cookie(config.sessionCookieName, rawToken, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: config.sessionTtlMs,
  });
}

authRouter.post(
  '/register',
  createRateLimitMiddleware(authRateLimiter),
  async (req, res, next) => {
    try {
      const parsed = RegisterInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: parsed.error.issues[0]?.message || 'Invalid registration data',
          issues: parsed.error.issues,
        });
        return;
      }

      const { username, email, displayName, password, roomCode } = parsed.data;

      const existing = await prisma.user.findFirst({
        where: {
          OR: [{ username }, { email }],
        },
      });

      if (existing) {
        const conflictField = existing.username === username ? 'Username' : 'Email';
        res.status(409).json({ error: `${conflictField} is already taken.` });
        return;
      }

      const passwordHash = await hashPassword(password);
      const rawToken = generateRandomToken(32);
      const tokenHash = hashSessionToken(rawToken);
      const csrfToken = generateRandomToken(24);
      const expiresAt = new Date(Date.now() + config.sessionTtlMs);

      const user = await prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            username,
            email,
            displayName,
            passwordHash,
            roomCode: roomCode ?? null,
          },
        });

        await tx.session.create({
          data: {
            tokenHash,
            csrfToken,
            userId: createdUser.id,
            userAgent: req.header('user-agent') ?? null,
            ipAddress: req.ip ?? null,
            expiresAt,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: createdUser.id,
            action: 'USER_REGISTERED',
            ipAddress: req.ip ?? null,
          },
        });

        return createdUser;
      });

      setSessionCookie(res, rawToken);
      res.status(201).json({
        user: toUserSummary(user),
        csrfToken,
      });
    } catch (err) {
      next(err);
    }
  }
);

authRouter.post(
  '/login',
  createRateLimitMiddleware(authRateLimiter),
  async (req, res, next) => {
    try {
      const parsed = LoginInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: parsed.error.issues[0]?.message || 'Invalid login credentials',
        });
        return;
      }

      const identifier = parsed.data.identifier.toLowerCase();
      const { password } = parsed.data;

      const user = await prisma.user.findFirst({
        where: {
          OR: [{ username: identifier }, { email: identifier }],
        },
      });

      if (!user) {
        res.status(401).json({ error: 'Invalid username/email or password.' });
        return;
      }

      if (user.isSuspended) {
        res.status(403).json({ error: 'This account has been suspended.' });
        return;
      }

      if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
        const remainingMin = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
        res.status(423).json({
          error: `Account temporarily locked due to failed login attempts. Try again in ${remainingMin} minute(s).`,
        });
        return;
      }

      const validPassword = await verifyPassword(user.passwordHash, password);
      if (!validPassword) {
        const attempts = user.failedLoginAttempts + 1;
        const shouldLock = attempts >= config.maxLoginAttempts;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: attempts,
            lockedUntil: shouldLock ? new Date(Date.now() + config.lockoutDurationMs) : null,
          },
        });
        res.status(401).json({ error: 'Invalid username/email or password.' });
        return;
      }

      const rawToken = generateRandomToken(32);
      const tokenHash = hashSessionToken(rawToken);
      const csrfToken = generateRandomToken(24);
      const expiresAt = new Date(Date.now() + config.sessionTtlMs);

      const updatedUser = await prisma.$transaction(async (tx) => {
        const resetUser = await tx.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastSeenAt: new Date(),
          },
        });

        await tx.session.create({
          data: {
            tokenHash,
            csrfToken,
            userId: user.id,
            userAgent: req.header('user-agent') ?? null,
            ipAddress: req.ip ?? null,
            expiresAt,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: 'USER_LOGGED_IN',
            ipAddress: req.ip ?? null,
          },
        });

        return resetUser;
      });

      setSessionCookie(res, rawToken);
      res.status(200).json({
        user: toUserSummary(updatedUser),
        csrfToken,
      });
    } catch (err) {
      next(err);
    }
  }
);

authRouter.post('/logout', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    if (req.authSession) {
      await prisma.session.delete({ where: { id: req.authSession.id } }).catch(() => undefined);
    }
    res.clearCookie(config.sessionCookieName, { path: '/' });
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.status(200).json({
    user: req.authUser,
    csrfToken: req.authSession?.csrfToken,
  });
});
