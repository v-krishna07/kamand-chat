import type { Request, Response, NextFunction } from 'express';

interface Bucket {
  timestamps: number[];
}

export class SlidingWindowRateLimiter {
  private buckets = new Map<string, Bucket>();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  public consume(key: string, now = Date.now()): { allowed: boolean; retryAfterSec: number } {
    const cutoff = now - this.windowMs;
    const existing = this.buckets.get(key) ?? { timestamps: [] };
    existing.timestamps = existing.timestamps.filter((t) => t > cutoff);

    if (existing.timestamps.length >= this.maxRequests) {
      const oldest = existing.timestamps[0] ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
      this.buckets.set(key, existing);
      return { allowed: false, retryAfterSec };
    }

    existing.timestamps.push(now);
    this.buckets.set(key, existing);
    return { allowed: true, retryAfterSec: 0 };
  }

  public reset(): void {
    this.buckets.clear();
  }
}

export const authRateLimiter = new SlidingWindowRateLimiter(60_000, 20);
export const apiRateLimiter = new SlidingWindowRateLimiter(60_000, 180);
export const wsMessageRateLimiter = new SlidingWindowRateLimiter(10_000, 35);

export function createRateLimitMiddleware(limiter: SlidingWindowRateLimiter) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (process.env.NODE_ENV === 'test' && req.header('x-test-enforce-ratelimit') !== '1') {
      next();
      return;
    }
    const key = req.authUser?.id || req.ip || 'anonymous';
    const result = limiter.consume(key);
    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSec));
      res.status(429).json({
        error: `Too many requests. Please wait ${result.retryAfterSec}s before trying again.`,
      });
      return;
    }
    next();
  };
}
