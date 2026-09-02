import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './rate-cache.tokens';
import { getCurrentTenantId } from '@swiftship/platform-typeorm';
import type { CachedRateQuote, RateCacheKey } from './rate-cache.types';

/**
 * Default cache TTL: 10 minutes. Rate cards from Indian carriers are
 * stable on the order of hours; 10 minutes is a good safety margin
 * against pricing drift while still cutting repeated-shop latency to
 * a single Redis round-trip.
 */
export const RATE_CACHE_TTL_SECONDS = 600;

/**
 * Redis-backed cache for `RateQuote[]` blobs returned by carrier
 * adapters. The cache key is per-(tenant, carrier, request-shape) so
 * tenant A and tenant B never see each other's quotes.
 *
 * The key intentionally excludes `serviceType` — the carrier picks the
 * service tier, and we cache the full `RateQuote[]` blob so a single
 * entry covers every service option the carrier offered.
 *
 * Lives at `libs/platform/rate-cache/` as its own lib so it can be
 * imported by both the `RateShopService` orchestrator (in this lib)
 * and future callers (e.g. a webhook that warms the cache when rates
 * change). It is *not* part of `libs/platform/carriers/` because that
 * lib is reserved for adapter code — keep that boundary clean.
 */
@Injectable()
export class RateCacheService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Look up a cached quote blob for the given key. Returns `null` on
   * miss (or on Redis errors — fail-open so a Redis blip doesn't take
   * down rate shopping).
   */
  async getCachedQuotes(key: RateCacheKey): Promise<CachedRateQuote[] | null> {
    const fullKey = this.buildKey(key);
    try {
      const cached = await this.redis.get(fullKey);
      if (!cached) return null;
      return JSON.parse(cached) as CachedRateQuote[];
    } catch (err) {
      console.warn(
        `[RateCacheService] getCachedQuotes failed for ${fullKey}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Store a quote blob with the 10-minute TTL. Failures are logged and
   * swallowed — caching is best-effort, never load-bearing.
   */
  async setCachedQuotes(key: RateCacheKey, quotes: CachedRateQuote[]): Promise<void> {
    const fullKey = this.buildKey(key);
    try {
      await this.redis.setex(fullKey, RATE_CACHE_TTL_SECONDS, JSON.stringify(quotes));
    } catch (err) {
      console.warn(
        `[RateCacheService] setCachedQuotes failed for ${fullKey}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Build the Redis key. Tenant id is namespaced so multi-tenant noise
   * (one tenant's pricing being sensitive to another) can't leak.
   *
   * Falls back to `1` (the legacy default-tenant id used in unit tests
   * and the pre-TypeORM default) when there is no request-scoped
   * tenant — that mirrors the historical behaviour the rest of the
   * code base relies on.
   */
  buildKey(k: RateCacheKey): string {
    const tenantId = getCurrentTenantId() ?? 1;
    const carrier = k.carrierCode ?? 'all';
    return `rate:${tenantId}:${k.originPincode}:${k.destinationPincode}:${k.weightGrams}:${k.paymentMethod}:${carrier}`;
  }
}
