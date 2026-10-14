import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { hashSessionToken } from '../security/csrf.js';
import type { UserSummary } from '@kamand/shared';

export interface AuthSessionContext {
  id: string;
  csrfToken: string;
  expiresAt: Date;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: UserSummary;
      authSession?: AuthSessionContext;
    }
  }
}

export interface RawUserRecord {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  roomCode: string | null;
  isRoomPrivate?: boolean;
  role: string;
  lastSeenAt: Date;
  createdAt: Date;
}

/**
 * Serializes a user record while enforcing room-code privacy:
 * - If viewer is the user themselves, roomCode is always included.
 * - If isRoomPrivate is false, roomCode is included.
 * - If isRoomPrivate is true (default), roomCode is ONLY included when `canSeePrivateRoom` is true (i.e., accepted contact).
 */
export function toUserSummary(
  user: RawUserRecord,
  options: { isSelf?: boolean; canSeePrivateRoom?: boolean; isOnline?: boolean } = {
    isSelf: true,
    canSeePrivateRoom: true,
  }
): UserSummary {
  const isRoomPrivate = user.isRoomPrivate ?? true;
  const allowRoom = Boolean(options.isSelf || !isRoomPrivate || options.canSeePrivateRoom);

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    roomCode: allowRoom ? user.roomCode : null,
    isRoomPrivate,
    role: (user.role as UserSummary['role']) || 'member',
    isOnline: options.isOnline,
    lastSeenAt: user.lastSeenAt.toISOString(),
    createdAt: user.createdAt.toISOString(),
  };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawToken = req.cookies?.[config.sessionCookieName];
    if (!rawToken || typeof rawToken !== 'string') {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const tokenHash = hashSessionToken(rawToken);
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session || session.expiresAt.getTime() <= Date.now()) {
      if (session) {
        await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      }
      res.clearCookie(config.sessionCookieName, { path: '/' });
      res.status(401).json({ error: 'Session expired. Please sign in again.' });
      return;
    }

    if (session.user.isSuspended) {
      res.status(403).json({ error: 'Your account has been suspended.' });
      return;
    }

    req.authUser = toUserSummary(session.user, { isSelf: true, canSeePrivateRoom: true });
    req.authSession = {
      id: session.id,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt,
    };

    next();
  } catch (err) {
    next(err);
  }
}
