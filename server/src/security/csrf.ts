import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export function generateRandomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Validates the session-bound CSRF token on state-changing HTTP methods.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
  if (safeMethods.has(req.method)) {
    next();
    return;
  }

  const session = req.authSession;
  if (!session) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const headerToken = req.header('x-csrf-token');
  if (!headerToken || headerToken.length !== session.csrfToken.length) {
    res.status(403).json({ error: 'Invalid or missing CSRF token' });
    return;
  }

  const a = Buffer.from(headerToken, 'utf8');
  const b = Buffer.from(session.csrfToken, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(403).json({ error: 'Invalid or missing CSRF token' });
    return;
  }

  next();
}
