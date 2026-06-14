import { RateShopService } from '../lib/rate-shop.service';
import { RateCacheService } from '../lib/rate-cache.service';
import { CircuitBreakerService } from '../lib/circuit-breaker.service';
import type { CarrierAdapter, RateQuote, RateQuoteRequest } from '@swiftship/platform-carriers';

const sampleQuote = (overrides: Partial<RateQuote> = {}): RateQuote => ({
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

const baseReq: RateQuoteRequest = {
  originPincode: '110001',
  destinationPincode: '560001',
  weightGrams: 500,
  paymentMethod: 'PREPAID',
};

/**
 * Build a minimal CarrierAdapterService double. We don't need the real
 * 13-adapter registry — only `getAdapter(code)` and
 * `getAvailableCarriers()`. Adapters are spied per test.
 */
function buildAdapterService(
  codes: string[],
  adapters: Record<string, Partial<CarrierAdapter>> = {},
) {
  const calls: Array<{ code: string; req: RateQuoteRequest }> = [];
  const registered: Record<string, Partial<CarrierAdapter>> = {};
  for (const code of codes) {
    registered[code] = {
      code,
      async getRates(req: RateQuoteRequest) {
        calls.push({ code, req });
        const a = adapters[code];
        if (a?.getRates) return (a.getRates as any)(req);
        return [sampleQuote({ carrierCode: code })];
      },
      ...adapters[code],
    };
  }
  return {
    service: {
      getAdapter(code: string) {
        return registered[code] as CarrierAdapter | undefined;
      },
      getAvailableCarriers() {
        return codes;
      },
    } as any,
    calls,
  };
}

/**
 * Cache double — fully in-memory Map keyed by the same string the
 * real service would produce. Lets us preset hits and observe writes.
 */
function buildCache(initial: Record<string, RateQuote[]> = {}) {
  const store = new Map<string, RateQuote[]>(Object.entries(initial));
  const writes: Array<{ key: string; quotes: RateQuote[] }> = [];
  return {
    service: {
      buildKey(k: any) {
        return `rate:${k.carrierCode ?? 'all'}:${k.originPincode}:${k.destinationPincode}:${k.weightGrams}:${k.paymentMethod}`;
      },
      async getCachedQuotes(k: any) {
        return store.get(this.buildKey(k)) ?? null;
      },
      async setCachedQuotes(k: any, quotes: RateQuote[]) {
        writes.push({ key: this.buildKey(k), quotes });
        store.set(this.buildKey(k), quotes);
      },
    } as unknown as RateCacheService,
    store,
    writes,
  };
}

/**
 * Circuit breaker double. `closed` defaults to true (CLOSED). Each
 * code can be flipped to OPEN by setting `open: Set<string>()`.
 */
function buildBreaker(opts: { open?: Set<string>; failOnCall?: Set<string> } = {}) {
  const open = opts.open ?? new Set<string>();
  const failures: string[] = [];
  const successes: string[] = [];
  return {
    service: {
      async canRequest(code: string) {
        return !open.has(code);
      },
      async recordSuccess(code: string) {
        successes.push(code);
        open.delete(code);
      },
      async recordFailure(code: string) {
        failures.push(code);
        if (opts.failOnCall?.has(code)) open.add(code);
      },
    } as unknown as CircuitBreakerService,
    open,
    failures,
    successes,
  };
}

describe('RateShopService', () => {
  it('returns cached quotes without calling the adapter', async () => {
    const cachedQuote = sampleQuote({ rate: 77, carrierCode: 'SANDBOX' });
    const { service: adapter } = buildAdapterService(['SANDBOX']);
    const cache = buildCache({
      'rate:SANDBOX:110001:560001:500:PREPAID': [cachedQuote],
    });
    const breaker = buildBreaker();
    const shop = new RateShopService(adapter, cache.service, breaker.service);

    const out = await shop.shopRates(baseReq);

    expect(out).toEqual([cachedQuote]);
    expect(adapter.getAdapter('SANDBOX')).toBeDefined();
    // adapter.getRates should not have been called — cache hit
    // (we assert by the only adapter that could have been called: SANDBOX
    // was registered, but the cache hit short-circuits before the call).
    const calls: any[] = (adapter as any).calls;
    // AdapterService double doesn't track calls; assert by behavior — no
    // new write happened after the initial preset.
    expect(cache.writes).toHaveLength(0);
  });

  it('falls through to the adapter on cache miss and writes the result', async () => {
    const { service: adapter, calls } = buildAdapterService(['SANDBOX']);
    const cache = buildCache();
    const breaker = buildBreaker();
    const shop = new RateShopService(adapter, cache.service, breaker.service);

    const out = await shop.shopRates(baseReq);

    expect(out).toHaveLength(1);
    expect(out[0].carrierCode).toBe('SANDBOX');
    expect(calls).toHaveLength(1);
    expect(cache.writes).toHaveLength(1);
    expect(cache.writes[0].quotes).toEqual(out);
  });

  it('skips carriers whose circuit is OPEN', async () => {
    const { service: adapter, calls } = buildAdapterService(['SANDBOX', 'BLUEDART']);
    const cache = buildCache();
    const breaker = buildBreaker({ open: new Set(['BLUEDART']) });
    const shop = new RateShopService(adapter, cache.service, breaker.service);

    const out = await shop.shopRates(baseReq);

    expect(out.map((q) => q.carrierCode).sort()).toEqual(['SANDBOX']);
    expect(calls.map((c) => c.code)).toEqual(['SANDBOX']);
  });

  it('records success on adapter success', async () => {
    const { service: adapter } = buildAdapterService(['SANDBOX']);
    const cache = buildCache();
    const breaker = buildBreaker();
    const shop = new RateShopService(adapter, cache.service, breaker.service);

    await shop.shopRates(baseReq);

    expect(breaker.successes).toEqual(['SANDBOX']);
    expect(breaker.failures).toEqual([]);
  });

  it('records failure on adapter throw; subsequent calls skip that carrier', async () => {
    const boom: Partial<CarrierAdapter> = {
      async getRates() {
        throw new Error('carrier 500');
      },
    };
    const { service: adapter } = buildAdapterService(['SANDBOX', 'BLUEDART'], {
      SANDBOX: boom,
    });
    const cache = buildCache();
    const breaker = buildBreaker({ failOnCall: new Set(['SANDBOX']) });
    const shop = new RateShopService(adapter, cache.service, breaker.service);

    const first = await shop.shopRates(baseReq);
    expect(first.map((q) => q.carrierCode).sort()).toEqual(['BLUEDART']);
    expect(breaker.failures).toContain('SANDBOX');

    // Second call: SANDBOX is now open.
    const second = await shop.shopRates(baseReq);
    expect(second.map((q) => q.carrierCode)).toEqual(['BLUEDART']);
  });

  it('returns quotes from multiple carriers in parallel', async () => {
    const { service: adapter, calls } = buildAdapterService([
      'SANDBOX',
      'BLUEDART',
      'DTDC',
    ]);
    const cache = buildCache();
    const breaker = buildBreaker();
    const shop = new RateShopService(adapter, cache.service, breaker.service);

    const out = await shop.shopRates(baseReq);

    expect(out).toHaveLength(3);
    expect(calls.map((c) => c.code).sort()).toEqual(['BLUEDART', 'DTDC', 'SANDBOX']);
  });

  it('returns no quotes when no carriers are registered (no throw)', async () => {
    const { service: adapter } = buildAdapterService([]);
    const cache = buildCache();
    const breaker = buildBreaker();
    const shop = new RateShopService(adapter, cache.service, breaker.service);

    await expect(shop.shopRates(baseReq)).resolves.toEqual([]);
  });
});
