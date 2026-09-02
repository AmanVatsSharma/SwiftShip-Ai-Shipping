import { Injectable, Logger } from '@nestjs/common';
import { type RateQuoteRequest } from '@swiftship/platform-carriers';
import { RateRankingService } from './rate-ranking.service';
import {
  RankedRateShopInput,
  RateSimulationOverrides,
} from './rate-shop.input';
import {
  RankedRateShopResult,
  projectRankedQuoteForGql,
} from './rate-ranking.model';

/**
 * RateSimulatorService
 *
 * "What if?" engine for the rate-shop pipeline. Given a base
 * `RankedRateShopInput` and one or more `RateSimulationOverrides` blobs,
 * it clones the input, applies the overrides, and re-runs the ranker —
 * producing a fresh `RankedRateShopResult` for each scenario.
 *
 * The simulator NEVER persists results. It is a pure-compute endpoint
 * intended for the merchant dashboard's "compare scenarios" panel:
 *
 *   - "What if I bump the weight from 500g to 800g?"
 *   - "What if I switch from PREPAID to COD?"
 *   - "What if I add a ₹100 declared value?"
 *   - "What if I tighten my SLA cap from 3 days to 2 days?"
 *
 * SS-013 — see the bead log for the original spec.
 */
@Injectable()
export class RateSimulatorService {
  private readonly logger = new Logger(RateSimulatorService.name);

  constructor(private readonly ranker: RateRankingService) {}

  /**
   * Run multiple "what if" scenarios in parallel and return the result
   * for each, in the same order as the input array. Uses `Promise.all`
   * so carriers' adapters and the surcharges pipeline are exercised
   * concurrently — each scenario is an independent rate-shop call.
   */
  async simulateScenarios(
    baseInput: RankedRateShopInput,
    scenarios: RateSimulationOverrides[],
  ): Promise<RankedRateShopResult[]> {
    return Promise.all(
      scenarios.map((overrides) => this.simulateOne(baseInput, overrides)),
    );
  }

  /**
   * Run a single "what if" scenario. Returns the same
   * `RankedRateShopResult` shape as `rankedRateShop` so the frontend
   * can render the result next to the original ranking without any
   * extra translation layer.
   */
  async simulateOne(
    baseInput: RankedRateShopInput,
    overrides: RateSimulationOverrides,
  ): Promise<RankedRateShopResult> {
    // 1. Merge. Spread `overrides` last so each set field shadows the
    //    base — this is the documented "what if" semantics: an
    //    override is a "use THIS instead of the base value". We
    //    explicitly drop any `simulate` field on the base input —
    //    simulation is one-level deep, never nested.
    const merged: RankedRateShopInput = {
      ...baseInput,
      ...overrides,
      simulate: undefined,
    };

    // 2. Build the `RateQuoteRequest` the ranker consumes. Declared
    //    value is paise throughout.
    const req: RateQuoteRequest = {
      originPincode: merged.originPincode,
      destinationPincode: merged.destinationPincode,
      weightGrams: merged.weightGrams,
      paymentMethod: merged.paymentMethod,
      declaredValue: merged.declaredValuePaise,
    };

    // 3. Build the ranker preferences. The strategy enum is upper-case
    //    on the GraphQL side; the ranker consumes lowercase.
    const prefs = {
      strategy: merged.strategy.toLowerCase() as NonNullable<
        Parameters<RateRankingService['rank']>[1]
      >['strategy'],
      maxDeliveryDays: merged.maxDeliveryDays,
      minCourierScore: merged.minCourierScore,
      codAmountPaise: merged.declaredValuePaise,
    };

    const quotes = await this.ranker.rank(req, prefs);

    if (this.logger.debug) {
      this.logger.debug(
        `simulateOne: overrides=${JSON.stringify(overrides)} → ` +
          `${quotes.length} ranked quote(s)`,
      );
    }

    return {
      quotes: quotes.map(projectRankedQuoteForGql),
      totalCandidates: quotes.length,
      appliedStrategy: merged.strategy,
    };
  }
}
