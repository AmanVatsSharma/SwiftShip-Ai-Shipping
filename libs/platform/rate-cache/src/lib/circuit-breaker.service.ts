import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './rate-cache.tokens';
import type { BreakerState } from './rate-cache.types';

/**
 * Sliding-window, per-carrier circuit breaker.
 *
 * State machine (per carrier, system-wide — *not* per tenant, because
 * a carrier API outage is a system event):
 *
 *   CLOSED  --(3 fails in 30s)-->  OPEN
 *   OPEN    --(60s elapses)----->  HALF_OPEN  (let one request through)
 *   HALF_OPEN --(success)------->  CLOSED
 *   HALF_OPEN --(failure)------->  OPEN  (reset the 60s window)
 *
 * Implementation: two Redis keys per carrier.
 *   breaker:<code>:fail_count  -- INCR; EXPIRE 30s on first increment.
 *   breaker:<code>:state       -- string 'OPEN' or 'HALF_OPEN'; absent == CLOSED.
 *   breaker:<code>:half_open   -- single-slot lock so only one probe gets through.
 *
 * The 30s expiry on `fail_count` is the sliding window — failures older
 * than that just expire away.
 */
@Injectable()
export class CircuitBreakerService {
  static readonly FAIL_THRESHOLD = 3;
  static readonly FAIL_WINDOW_SECONDS = 30;
  static readonly OPEN_DURATION_SECONDS = 60;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Returns true when the caller may issue a request to the carrier.
   * For an OPEN breaker this returns false. For a HALF_OPEN breaker
   * the *first* caller gets a true (acquires the half-open lock); all
   * other concurrent callers get false until the probe completes.
   */
  async canRequest(carrierCode: string): Promise<boolean> {
    const state = await this.getState(carrierCode);
    if (state === 'CLOSED') return true;
    if (state === 'OPEN') return false;
    // HALF_OPEN — try to grab the single probe slot.
    const acquired = await this.redis.set(
      this.halfOpenKey(carrierCode),
      '1',
      'EX',
      CircuitBreakerService.OPEN_DURATION_SECONDS,
      'NX',
    );
    return acquired === 'OK';
  }

  /**
   * Record a successful call. Clears the failure counter so subsequent
   * failures start counting from zero, and closes the half-open probe
   * (deletes the half-open lock + the OPEN state).
   */
  async recordSuccess(carrierCode: string): Promise<void> {
    await this.redis.del(
      this.failCountKey(carrierCode),
      this.stateKey(carrierCode),
      this.halfOpenKey(carrierCode),
    );
  }

  /**
   * Record a failed call. Increments the fail count and, if it
   * crosses the threshold, marks the carrier OPEN for the next 60s.
   * When called from HALF_OPEN (i.e. the probe failed) we *reset* the
   * 60s window rather than layering ON TOP of the previous one.
   */
  async recordFailure(carrierCode: string): Promise<void> {
    const failKey = this.failCountKey(carrierCode);
    const count = await this.redis.incr(failKey);
    if (count === 1) {
      // First failure in this window — set the sliding expiry.
      await this.redis.expire(failKey, CircuitBreakerService.FAIL_WINDOW_SECONDS);
    }
    if (count >= CircuitBreakerService.FAIL_THRESHOLD) {
      await this.redis.setex(
        this.stateKey(carrierCode),
        CircuitBreakerService.OPEN_DURATION_SECONDS,
        'OPEN',
      );
      // Half-open probe failed — clear the lock so the next 60s window
      // is a clean OPEN.
      await this.redis.del(this.halfOpenKey(carrierCode));
    }
  }

  /**
   * Look up the current state. Treats an expired OPEN entry as
   * HALF_OPEN (Redis evicts it; the next canRequest() will grab the
   * probe slot). Returns CLOSED when no state key exists.
   */
  async getState(carrierCode: string): Promise<BreakerState> {
    const state = await this.redis.get(this.stateKey(carrierCode));
    if (state === 'OPEN') return 'OPEN';
    if (state === 'HALF_OPEN') return 'HALF_OPEN';
    return 'CLOSED';
  }

  // -- key helpers --

  private failCountKey(code: string): string {
    return `breaker:${code}:fail_count`;
  }

  private stateKey(code: string): string {
    return `breaker:${code}:state`;
  }

  private halfOpenKey(code: string): string {
    return `breaker:${code}:half_open`;
  }
}
