/**
 * SS-027 — Express middleware that mirrors the per-tenant
 * `TenantThrottlerGuard` from SS-003 for the public REST surface.
 *
 * We can't use the NestJS `@APP_GUARD` registration here because we
 * need throttling to short-circuit BEFORE the tsoa handler runs (so
 * 429s don't trigger DTO validation or controller logic). Plain
 * Express middleware is the natural fit.
 *
 * Buckets (same as SS-003):
 *   STARTER     =   60 req / 60_000 ms
 *   GROWTH      =  300 req / 60_000 ms
 *   PRO         = 1000 req / 60_000 ms
 *   ENTERPRISE  =10000 req / 60_000 ms
 *
 * Storage is an in-memory map of `tenant:<id>` -> sliding window
 * counter. For multi-instance deployments this would be backed by
 * `PostgresThrottlerStorage` (already in `libs/platform/throttler`);
 * for SS-027 we keep it simple and document the swap-in point.
 */
import type { Request, Response, NextFunction } from 'express';
import { Logger } from '@nestjs/common';

type Tier = 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE';

const TIER_BUCKETS: Record<Tier, { limit: number; ttlMs: number }> = {
  STARTER: { limit: 60, ttlMs: 60_000 },
  GROWTH: { limit: 300, ttlMs: 60_000 },
  PRO: { limit: 1000, ttlMs: 60_000 },
  ENTERPRISE: { limit: 10_000, ttlMs: 60_000 },
};
const DEFAULT_TIER: Tier = 'STARTER';

interface BucketState {
  hits: number;
  windowStart: number;
}

const buckets = new Map<string, BucketState>();
const log = new Logger('TenantThrottler');

function getTracker(req: Request): string {
  const tenantId =
    (req as any).tenantId ??
    (req as any).user?.tenantId ??
    (req as any).user?.userId;
  if (tenantId === undefined || tenantId === null) return 'tenant:anonymous';
  return `tenant:${tenantId}`;
}

function getTier(req: Request): Tier {
  const explicit: unknown = (req as any).tenantTier ?? (req as any).user?.tenantTier;
  if (
    explicit === 'STARTER' ||
    explicit === 'GROWTH' ||
    explicit === 'PRO' ||
    explicit === 'ENTERPRISE'
  ) {
    return explicit;
  }
  return DEFAULT_TIER;
}

function setHeaders(
  res: Response,
  bucket: { limit: number; ttlMs: number },
  hits: number,
): void {
  res.setHeader('X-RateLimit-Limit', String(bucket.limit));
  res.setHeader(
    'X-RateLimit-Remaining',
    String(Math.max(0, bucket.limit - hits)),
  );
  res.setHeader(
    'X-RateLimit-Reset',
    String(Math.ceil((Date.now() + bucket.ttlMs) / 1000)),
  );
}

export const TenantThrottlerMiddleware = {
  handle(req: Request, res: Response, next: NextFunction): void {
    const tracker = getTracker(req);
    const tier = getTier(req);
    const bucket = TIER_BUCKETS[tier] ?? TIER_BUCKETS[DEFAULT_TIER];

    const now = Date.now();
    const state = buckets.get(tracker) ?? { hits: 0, windowStart: now };

    // Reset window if expired.
    if (now - state.windowStart >= bucket.ttlMs) {
      state.hits = 0;
      state.windowStart = now;
    }

    state.hits += 1;
    buckets.set(tracker, state);

    if (state.hits > bucket.limit) {
      log.warn(`Throttled ${tracker} (${state.hits}/${bucket.limit})`);
      setHeaders(res, bucket, state.hits);
      res.status(429).json({
        error: 'TooManyRequests',
        message: `Tenant ${tracker} exceeded ${bucket.limit} req / ${bucket.ttlMs / 1000}s`,
      });
      return;
    }

    setHeaders(res, bucket, state.hits);
    next();
  },
};
