import { Args, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { TenantGuard } from '@swiftship/domains-tenants';
import { RateRankingService } from './rate-ranking.service';
import { RateSimulatorService } from './rate-simulator.service';
import { RankedRateShopResult, projectRankedQuoteForGql } from './rate-ranking.model';
import { RankedRateShopInput, RateSimulationOverrides } from './rate-shop.input';
import type { RateRankingStrategyName } from './rate-ranking.service';
import type { RateQuoteRequest } from '@swiftship/platform-carriers';

/**
 * GraphQL entry point for the rate-ranking engine.
 *
 * Query shapes (client-facing):
 *   query rankedRateShop($input: RankedRateShopInput!) { ... }
 *   query simulateRateShop($baseInput: RankedRateShopInput!, $overrides: RateSimulationOverrides!) { ... }
 *   query simulateRateShopBatch($baseInput: RankedRateShopInput!, $scenarios: [RateSimulationOverrides!]!) { ... }
 *
 * SS-010 — NOT wired into `apps/api/src/app.module.ts` yet (SS-014 does the
 * final wiring). The module is self-contained and can be imported from
 * `@swiftship/domains-rate-shop`.
 */
@Resolver(() => RankedRateShopResult)
@UseGuards(TenantGuard)
export class RateRankingResolver {
  constructor(
    private readonly ranker: RateRankingService,
    private readonly simulator: RateSimulatorService,
  ) {}

  // -------------------------------------------------------------------------
  // existing: rankedRateShop
  // -------------------------------------------------------------------------

  /**
   * Ranked rate-shop query. Accepts an `RankedRateShopInput` (a slimmed-
   * down version of `RateQuoteRequest` plus ranking preferences) and
   * returns the same `RateQuote[]` blob as `RateShopService.shopRates`,
   * sorted, filtered, and annotated with per-quote ranking meta.
   */
  @Query(() => RankedRateShopResult, {
    description:
      'Rate-shop from all non-OPEN carriers, apply surcharges, then rank the ' +
      'quotes per the merchant\'s strategy (cheapest, fastest, best_value, ' +
      'balanced, reliability_first).',
  })
  async rankedRateShop(
    @Args('input') input: RankedRateShopInput,
  ): Promise<RankedRateShopResult> {
    const req: RateQuoteRequest = {
      originPincode: input.originPincode,
      destinationPincode: input.destinationPincode,
      weightGrams: input.weightGrams,
      paymentMethod: input.paymentMethod,
      declaredValue: input.declaredValuePaise,
    };

    const quotes = await this.ranker.rank(req, {
      strategy: input.strategy.toLowerCase() as RateRankingStrategyName,
      maxDeliveryDays: input.maxDeliveryDays,
      minCourierScore: input.minCourierScore,
      codAmountPaise: input.declaredValuePaise,
    });

    return {
      quotes: quotes.map(projectRankedQuoteForGql),
      totalCandidates: quotes.length,
      appliedStrategy: input.strategy,
    };
  }

  // -------------------------------------------------------------------------
  // SS-013: rate simulator queries
  // -------------------------------------------------------------------------

  /**
   * Run a single "what if" rate-simulation. The `overrides` are merged
   * on top of `baseInput` and the ranker is called with the merged
   * request. The result is a fully-projected `RankedRateShopResult`
   * identical to `rankedRateShop`, so the frontend can compare side by
   * side without any translation.
   *
   * Example: "What if I bump the weight from 500g to 800g?"
   *   → overrides = { weightGrams: 800 }
   */
  @Query(() => RankedRateShopResult, {
    description: 'Run a single rate simulation with overrides applied on top of the base input',
  })
  async simulateRateShop(
    @Args('baseInput') baseInput: RankedRateShopInput,
    @Args('overrides') overrides: RateSimulationOverrides,
  ): Promise<RankedRateShopResult> {
    return this.simulator.simulateOne(baseInput, overrides);
  }

  /**
   * Run multiple "what if" rate-simulations in parallel. Each
   * `RateSimulationOverrides` is a scenario; the base input is shared.
   *
   * Returns the results in the same order as the `scenarios` array so
   * the frontend can label them "Scenario A / B / C" unambiguously.
   *
   * Example: "Compare what if I bump weight to 800g vs switch to COD
   * vs deliver to a remote PIN" — all three scenarios are evaluated
   * concurrently and the dashboard renders a 3-column comparison table.
   */
  @Query(() => [RankedRateShopResult], {
    description: 'Run multiple rate simulations in parallel and return results in scenario order',
  })
  async simulateRateShopBatch(
    @Args('baseInput') baseInput: RankedRateShopInput,
    @Args('scenarios', { type: () => [RateSimulationOverrides] })
    scenarios: RateSimulationOverrides[],
  ): Promise<RankedRateShopResult[]> {
    return this.simulator.simulateScenarios(baseInput, scenarios);
  }
}
