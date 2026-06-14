import { TenantContext } from '@swiftship/domains-tenants';
import {
  RateCacheService,
  RATE_CACHE_TTL_SECONDS,
} from '../lib/rate-cache.service';
import type { CachedRateQuote } from '../lib/rate-cache.types';

/**
 * In-memory Redis stub. Tracks every key the service touches so we
 * can assert on what was set / read / expired without standing up a
 * real Redis. Mirrors the small slice of ioredis the service uses.
 */
class FakeRedis {
  store = new Map<string, { value: string; expiresAt: number | null }>();
  expirations: Array<{ key: string; seconds: number }> = [];

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + seconds * 1000,
    });
    this.expirations.push({ key, seconds });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
}

const sampleQuote = (overrides: Partial<CachedRateQuote> = {}): CachedRateQuote => ({
  carrier: 'SANDBOX',
  carrierCode: 'SANDBOX',
  serviceType: 'STANDARD',
  rate: 99,
  currency: 'INR',
  estimatedDays: { min: 2, max: 4 },
  codAvailable: false,
  pickupAvailable: true,
  expiresAt: new Date('2030-01-01T00:00:00Z'),
  ...overrides,
});

describe('RateCacheService', () => {
  let redis: FakeRedis;
  let tenant: TenantContext;
  let service: RateCacheService;

  beforeEach(() => {
    redis = new FakeRedis();
    tenant = new TenantContext();
    service = new RateCacheService(redis as any, tenant);
  });

  describe('getCachedQuotes', () => {
    it('returns null when no entry exists', async () => {
      const result = await service.getCachedQuotes({
        originPincode: '110001',
        destinationPincode: '560001',
        weightGrams: 500,
        paymentMethod: 'PREPAID',
        carrierCode: 'SANDBOX',
      });
      expect(result).toBeNull();
    });

    it('round-trips setCachedQuotes → getCachedQuotes', async () => {
      const key = {
        originPincode: '110001',
        destinationPincode: '560001',
        weightGrams: 500,
        paymentMethod: 'PREPAID' as const,
        carrierCode: 'SANDBOX',
      };
      const quotes: CachedRateQuote[] = [
        sampleQuote({ rate: 120 }),
        sampleQuote({ serviceType: 'EXPRESS', rate: 180 }),
      ];

      await service.setCachedQuotes(key, quotes);
      const result = await service.getCachedQuotes(key);

      expect(result).toEqual(quotes);
    });

    it('uses the configured 10-minute TTL (600s) on write', async () => {
      await service.setCachedQuotes(
        {
          originPincode: '110001',
          destinationPincode: '560001',
          weightGrams: 500,
          paymentMethod: 'PREPAID',
          carrierCode: 'SANDBOX',
        },
        [sampleQuote()],
      );

      expect(redis.expirations).toHaveLength(1);
      expect(redis.expirations[0].seconds).toBe(RATE_CACHE_TTL_SECONDS);
      expect(RATE_CACHE_TTL_SECONDS).toBe(600);
    });
  });

  describe('buildKey', () => {
    it('uses tenantId from TenantContext', () => {
      tenant.setTenant(42);
      const key = service.buildKey({
        originPincode: '110001',
        destinationPincode: '560001',
        weightGrams: 500,
        paymentMethod: 'PREPAID',
        carrierCode: 'SANDBOX',
      });
      expect(key.startsWith('rate:42:')).toBe(true);
    });

    it("uses 'all' for carrierCode when undefined", () => {
      tenant.setTenant(7);
      const key = service.buildKey({
        originPincode: '110001',
        destinationPincode: '560001',
        weightGrams: 500,
        paymentMethod: 'PREPAID',
        // carrierCode intentionally omitted
      });
      expect(key.endsWith(':all')).toBe(true);
      expect(key).toBe('rate:7:110001:560001:500:PREPAID:all');
    });

    it('falls back to tenant 1 when TenantContext is empty', () => {
      const key = service.buildKey({
        originPincode: '110001',
        destinationPincode: '560001',
        weightGrams: 500,
        paymentMethod: 'COD',
        carrierCode: 'SANDBOX',
      });
      expect(key.startsWith('rate:1:')).toBe(true);
      expect(key).toBe('rate:1:110001:560001:500:COD:SANDBOX');
    });
  });
});
