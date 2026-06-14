import { CircuitBreakerService } from '../lib/circuit-breaker.service';

/**
 * Tiny in-memory Redis double covering INCR / EXPIRE / SET / SETEX /
 * GET / DEL. We don't need Lua scripts or anything fancy — the breaker
 * uses a single-key-at-a-time protocol.
 */
class FakeRedis {
  store = new Map<string, { value: string; expiresAt: number | null }>();
  expirations: Array<{ key: string; seconds: number }> = [];

  private touch(key: string): { value: string; expiresAt: number | null } | null {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.expiresAt !== null && e.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return e;
  }

  async get(key: string): Promise<string | null> {
    return this.touch(key)?.value ?? null;
  }

  async incr(key: string): Promise<number> {
    const cur = this.touch(key);
    const n = (cur ? parseInt(cur.value, 10) : 0) + 1;
    this.store.set(key, { value: String(n), expiresAt: cur?.expiresAt ?? null });
    return n;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const e = this.touch(key);
    if (!e) return 0;
    e.expiresAt = Date.now() + seconds * 1000;
    this.expirations.push({ key, seconds });
    return 1;
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    this.store.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
    this.expirations.push({ key, seconds });
    return 'OK';
  }

  async set(
    key: string,
    value: string,
    mode1: 'EX',
    seconds: number,
    mode2: 'NX',
  ): Promise<'OK' | null> {
    if (mode1 !== 'EX' || mode2 !== 'NX') throw new Error('unsupported SET mode');
    if (this.touch(key)) return null;
    this.store.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) if (this.store.delete(k)) n++;
    return n;
  }
}

describe('CircuitBreakerService', () => {
  let redis: FakeRedis;
  let breaker: CircuitBreakerService;

  beforeEach(() => {
    redis = new FakeRedis();
    breaker = new CircuitBreakerService(redis as any);
  });

  describe('canRequest', () => {
    it('returns true when state is CLOSED (no state key)', async () => {
      expect(await breaker.canRequest('SANDBOX')).toBe(true);
    });

    it('returns false when state is OPEN', async () => {
      await redis.setex('breaker:SANDBOX:state', 60, 'OPEN');
      expect(await breaker.canRequest('SANDBOX')).toBe(false);
    });

    it('returns true for the first HALF_OPEN caller, false for the second', async () => {
      await redis.setex('breaker:SANDBOX:state', 60, 'HALF_OPEN');
      // simulate that the OPEN state has expired by NOT having the state key;
      // we just set HALF_OPEN directly to exercise the probe path.
      const first = await breaker.canRequest('SANDBOX');
      const second = await breaker.canRequest('SANDBOX');
      expect(first).toBe(true);
      expect(second).toBe(false);
    });
  });

  describe('recordFailure', () => {
    it('opens the breaker on the 3rd failure within the window', async () => {
      await breaker.recordFailure('SANDBOX');
      await breaker.recordFailure('SANDBOX');
      expect(await breaker.getState('SANDBOX')).toBe('CLOSED');

      await breaker.recordFailure('SANDBOX');
      expect(await breaker.getState('SANDBOX')).toBe('OPEN');
    });

    it('uses the configured constants (3 fails / 30s / 60s)', () => {
      expect(CircuitBreakerService.FAIL_THRESHOLD).toBe(3);
      expect(CircuitBreakerService.FAIL_WINDOW_SECONDS).toBe(30);
      expect(CircuitBreakerService.OPEN_DURATION_SECONDS).toBe(60);
    });
  });

  describe('recordSuccess', () => {
    it('clears the failure count and state', async () => {
      await breaker.recordFailure('SANDBOX');
      await breaker.recordFailure('SANDBOX');
      await breaker.recordSuccess('SANDBOX');

      expect(await redis.get('breaker:SANDBOX:fail_count')).toBeNull();
      expect(await breaker.getState('SANDBOX')).toBe('CLOSED');
    });

    it('after a successful call the breaker is fully closed', async () => {
      await redis.setex('breaker:SANDBOX:state', 60, 'OPEN');
      await breaker.recordSuccess('SANDBOX');
      expect(await breaker.canRequest('SANDBOX')).toBe(true);
    });
  });

  describe('TTL behaviour', () => {
    it('uses a 30s sliding window on the fail counter', async () => {
      await breaker.recordFailure('SANDBOX');
      expect(redis.expirations.find((e) => e.key === 'breaker:SANDBOX:fail_count')?.seconds).toBe(
        30,
      );
    });

    it('uses a 60s TTL when transitioning to OPEN', async () => {
      await breaker.recordFailure('SANDBOX');
      await breaker.recordFailure('SANDBOX');
      await breaker.recordFailure('SANDBOX');
      expect(redis.expirations.find((e) => e.key === 'breaker:SANDBOX:state')?.seconds).toBe(60);
    });

    it('treats an expired OPEN key as effectively CLOSED (canRequest returns true)', async () => {
      // Simulate expiry: store a key whose expiresAt is in the past.
      redis.store.set('breaker:SANDBOX:state', {
        value: 'OPEN',
        expiresAt: Date.now() - 1000,
      });
      expect(await breaker.canRequest('SANDBOX')).toBe(true);
    });
  });
});
