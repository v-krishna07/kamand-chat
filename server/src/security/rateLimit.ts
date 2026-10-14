import type { Request, Response, NextFunction } from 'express';

interface Bucket {
  timestamps: number[];
}

export class SlidingWindowRateLimiter {
  private buckets = new Map<string, Bucket>();
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly maxTrackedKeys = 5_000;

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  private pruneExpiredKeys(now: number): void {
    const cutoff = now - this.windowMs;
    for (const [key, bucket] of this.buckets.entries()) {
      bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
      if (bucket.timestamps.length === 0) {
        this.buckets.delete(key);
      }
    }
  }

  public consume(key: string, now = Date.now()): { allowed: boolean; retryAfterSec: number } {
    if (this.buckets.size > this.maxTrackedKeys) {
      this.pruneExpiredKeys(now);
    }

    const cutoff = now - this.windowMs;
    const existing = this.buckets.get(key);
    const activeTimestamps = existing
      ? existing.timestamps.filter((t) => t > cutoff)
      : [];

    if (activeTimestamps.length === 0 && existing) {
      this.buckets.delete(key);
    }

    if (activeTimestamps.length >= this.maxRequests) {
      const oldest = activeTimestamps[0] ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
      this.buckets.set(key, { timestamps: activeTimestamps });
      return { allowed: false, retryAfterSec };
    }

    activeTimestamps.push(now);
    this.buckets.set(key, { timestamps: activeTimestamps });
    return { allowed: true, retryAfterSec: 0 };
  }

  public size(): number {
    return this.buckets.size;
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
