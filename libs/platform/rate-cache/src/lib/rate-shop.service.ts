import { Injectable, Logger } from '@nestjs/common';
import {
  CarrierAdapterService,
  type RateQuote,
  type RateQuoteRequest,
} from '@swiftship/platform-carriers';
import { CircuitBreakerService } from './circuit-breaker.service';
import { RateCacheService } from './rate-cache.service';

interface CarrierResult {
  code: string;
  quotes: RateQuote[];
  source: 'cache' | 'live' | 'no_adapter' | 'error';
}

/**
 * Public entry point for rate shopping. Fans out to every registered
 * carrier in parallel, short-circuits any whose circuit breaker is
 * OPEN, serves cache hits without touching the carrier API, and
 * records success / failure against the per-carrier breaker.
 *
 * This is what the GraphQL `rate.shopRates` resolver (and the future
 * `RateRankingService` — SS-010) call. It deliberately returns a flat
 * `RateQuote[]` blob; ranking / cheapest-first / fastest is the
 * ranking service's job, not this one.
 */
@Injectable()
export class RateShopService {
  private readonly logger = new Logger(RateShopService.name);

  constructor(
    private readonly carrierAdapter: CarrierAdapterService,
    private readonly cache: RateCacheService,
    private readonly breaker: CircuitBreakerService,
  ) {}

  /**
   * Shop rates from every available carrier. Per-carrier failures
   * don't abort the whole call — they're isolated so a single flaky
   * carrier can't sink the request.
   */
  async shopRates(req: RateQuoteRequest): Promise<RateQuote[]> {
    const allCodes = this.carrierAdapter.getAvailableCarriers();

    // 1. Filter by circuit breaker — skip OPEN carriers up front.
    const enabledCodes = (
      await Promise.all(
        allCodes.map(async (code) =>
          (await this.breaker.canRequest(code)) ? code : null,
        ),
      )
    ).filter((c): c is string => c !== null);

    this.logger.debug?.(
      `RateShop: shopping ${enabledCodes.length}/${allCodes.length} carriers ` +
        `(skipped ${allCodes.length - enabledCodes.length} as OPEN)`,
    );

    // 2. Fan out per carrier. Promise.allSettled isolates failures
    //    so a single throwing adapter doesn't poison the rest.
    const settled = await Promise.allSettled(
      enabledCodes.map((code) => this.shopOne(req, code)),
    );

    const out: RateQuote[] = [];
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      const code = enabledCodes[i];
      if (r.status === 'fulfilled') {
        out.push(...r.value.quotes);
      } else {
        this.logger.warn(
          `RateShop: carrier ${code} shopOne rejected: ${(r.reason as Error)?.message ?? r.reason}`,
        );
      }
    }
    return out;
  }

  /**
   * Shop one carrier: cache check, then live call, then record
   * success/failure against the breaker. Public so tests (and the
   * future ranking service) can target a single carrier when needed.
   */
  async shopOne(req: RateQuoteRequest, code: string): Promise<CarrierResult> {
    // Cache lookup.
    const cached = await this.cache.getCachedQuotes({ ...req, carrierCode: code });
    if (cached) {
      this.logger.debug?.(`RateShop: ${code} cache HIT (${cached.length} quotes)`);
      return { code, quotes: cached, source: 'cache' };
    }

    // Live call.
    const adapter = this.carrierAdapter.getAdapter(code);
    if (!adapter) {
      this.logger.warn(`RateShop: no adapter registered for ${code}`);
      return { code, quotes: [], source: 'no_adapter' };
    }

    try {
      const quotes = await adapter.getRates(req);
      await this.cache.setCachedQuotes({ ...req, carrierCode: code }, quotes);
      await this.breaker.recordSuccess(code);
      this.logger.debug?.(`RateShop: ${code} live OK (${quotes.length} quotes)`);
      return { code, quotes, source: 'live' };
    } catch (err) {
      await this.breaker.recordFailure(code);
      this.logger.warn(
        `RateShop: ${code} getRates failed: ${(err as Error).message}`,
      );
      return { code, quotes: [], source: 'error' };
    }
  }
}