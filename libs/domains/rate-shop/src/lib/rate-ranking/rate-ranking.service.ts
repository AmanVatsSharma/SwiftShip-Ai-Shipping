import { Injectable, Logger } from '@nestjs/common';
import { RateShopService } from '@swiftship/platform-rate-cache';
import { RateMathService } from '@swiftship/platform-rate-math';
import { type RateQuote, type RateQuoteRequest } from '@swiftship/platform-carriers';
import { CourierScoreService } from '@swiftship/domains-dashboard';

/**
 * The strategy names we understand. `balanced` is currently a synonym for
 * `best_value`; the split is kept here so a future per-tenant weights
 * override can land without an API break.
 */
export type RateRankingStrategyName =
  | 'cheapest'
  | 'fastest'
  | 'best_value'
  | 'balanced'
  | 'reliability_first';

/**
 * Merchant-controlled knobs for the ranking engine. All fields are optional
 * except `strategy`, which defaults to `best_value` in the resolver.
 */
export interface RateRankingPreferences {
  strategy: RateRankingStrategyName;

  /** SLA cap — carriers with `etaDays.max` greater than this are dropped. */
  maxDeliveryDays?: number;

  /** Min courier score [0..100]. Carriers below this are dropped. */
  minCourierScore?: number;

  /**
   * Declared value (paise) for the RTO penalty calculation. When 0 or
   * undefined the penalty is zero and `effectiveCostPaise` collapses to
   * the raw quoted rate.
   */
  codAmountPaise?: number;

  /**
   * Override the default `best_value` weights. The three components are
   * normalized to a 0..1 score internally — they don't need to sum to 1.
   * Only consulted when `strategy === 'best_value' || 'balanced'`.
   */
  weights?: { cost: number; sla: number; reliability: number };
}

/**
 * Result type — a `RateQuote` from the carrier adapter, plus a `ranking`
 * block. The `ranking.position` is 1-indexed.
 */
export interface RankedRateQuote extends RateQuote {
  ranking: {
    position: number;
    score: number;
    costRank: number;
    slaRank: number;
    reliabilityRank: number;
    effectiveCostPaise: number;
    expectedRtoLossPaise: number;
    courierScore?: number;
    reasonWhyNotFirst?: string;
  };
}

/**
 * Internal working record. Built in `applyStrategy` from the post-surcharge
 * quote + the courier score + the RTO-loss math.
 */
interface EnrichedQuote {
  quote: RateQuote;
  expectedRtoLossPaise: number;
  courierScore: number;
  effectiveCostPaise: number;
  /** For `best_value` / `balanced` strategies. 0 for pure single-axis sorts. */
  weightedScore: number;
}

/** Default score when a carrier has no row in `courier_score_daily`. */
const DEFAULT_COURIER_SCORE = 75;

/**
 * RateRankingService
 *
 * Public entry point: `rank(req, prefs)`.
 *
 *   1. Shop rates from all non-OPEN carriers (`RateShopService`).
 *   2. Apply fuel / COD / ODA / GST surcharges (`RateMathService`).
 *   3. Filter by SLA cap and minimum courier score.
 *   4. Compute per-quote `expectedRtoLossPaise = codAmountPaise × rtoPct`.
 *   5. Sort per the merchant's `strategy` and assign per-axis ranks.
 *
 * RTO math (per the spec):
 *   rtoPct = 1 − (courierScore / 100)
 *   expectedRtoLoss = round(codAmountPaise × rtoPct)
 *
 * This is a deliberately simple heuristic. The full `CourierScoreService`
 * formula is a 5-component weighted blend; we're using the composite
 * score as a proxy for RTO rate. Future SS-beads can swap in the
 * raw `rto / delivered` ratio from the entity directly.
 */
@Injectable()
export class RateRankingService {
  private readonly logger = new Logger(RateRankingService.name);

  constructor(
    private readonly rateShop: RateShopService,
    private readonly rateMath: RateMathService,
    /**
     * Made optional via `!` + null-check at call site so that the
     * service can be instantiated in unit tests without standing up
     * the dashboard lib (and its TypeORM repos).
     */
    private readonly courierScore?: CourierScoreService,
  ) {}

  /**
   * Main entry point. Fetches raw quotes from `RateShopService`, applies
   * surcharges via `RateMathService`, then ranks them per the merchant's
   * preferences.
   */
  async rank(
    req: RateQuoteRequest,
    prefs: RateRankingPreferences = { strategy: 'best_value' },
  ): Promise<RankedRateQuote[]> {
    // 1. Shop rates from all non-OPEN carriers.
    const rawQuotes = await this.rateShop.shopRates(req);
    if (rawQuotes.length === 0) return [];

    // 2. Apply surcharges to each quote (preserves the `RateQuote` shape,
    //    just updates `rate` and attaches a `metadata.breakdown`).
    const withSurcharges = await Promise.all(
      rawQuotes.map((q) => this.rateMath.applySurcharges(q, req)),
    );

    // 3. Filter by SLA cap.
    const afterSla = prefs.maxDeliveryDays
      ? withSurcharges.filter(
          (q) => q.estimatedDays.max <= prefs.maxDeliveryDays!,
        )
      : withSurcharges;

    // 4. Look up courier scores (default 75 for carriers with no row).
    const codes = Array.from(new Set(afterSla.map((q) => q.carrierCode)));
    const scores = await this.fetchScores(codes);
    const minScore = prefs.minCourierScore ?? 0;
    const afterScore = afterSla.filter(
      (q) => (scores[q.carrierCode] ?? DEFAULT_COURIER_SCORE) >= minScore,
    );

    if (afterScore.length === 0) return [];

    // 5. Rank per strategy.
    return this.applyStrategy(afterScore, scores, prefs);
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  /**
   * Look up the courier score for each carrier. Returns an empty record
   * when the service isn't wired (e.g. unit tests, or before SS-016 wires
   * the module).
   */
  private async fetchScores(
    codes: string[],
  ): Promise<Record<string, number>> {
    if (!this.courierScore) {
      this.logger.debug?.(
        'RateRanking: CourierScoreService not wired, falling back to defaults',
      );
      return {};
    }
    try {
      // The dashboard lib exposes scorecards, not single-carrier scores by
      // code. We use a 30-day window and index by carrierCode. Tenant id
      // isn't a context the ranker has, so we pass 1 (the platform default
      // single-tenant) — this is a known limitation; SS-014 will plumb
      // the tenant id from `req`.
      const cards = await this.courierScore.getScorecards(1, 30);
      const out: Record<string, number> = {};
      for (const code of codes) {
        const card = cards.find((c) => c.carrierCode === code);
        if (card) out[code] = card.score;
      }
      return out;
    } catch (err) {
      this.logger.warn(
        `RateRanking: getScorecards failed, falling back to defaults: ${(err as Error).message}`,
      );
      return {};
    }
  }

  private applyStrategy(
    quotes: RateQuote[],
    scores: Record<string, number>,
    prefs: RateRankingPreferences,
  ): RankedRateQuote[] {
    const codAmount = prefs.codAmountPaise ?? 0;
    const minScore = prefs.minCourierScore ?? 0;

    // Enrich each quote with its courier score + RTO math.
    const enriched: EnrichedQuote[] = quotes.map((q) => {
      const score = scores[q.carrierCode] ?? DEFAULT_COURIER_SCORE;
      // Apply the minScore filter as a final safety net (the early
      // filter already ran, but a missing score defaults to 75 which
      // could be below a high `minCourierScore` threshold).
      const effectiveScore = Math.max(score, minScore);
      const rtoPct = 1 - effectiveScore / 100;
      const expectedRtoLossPaise = Math.round(codAmount * rtoPct);
      const effectiveCostPaise = q.rate + expectedRtoLossPaise;
      return {
        quote: q,
        expectedRtoLossPaise,
        courierScore: effectiveScore,
        effectiveCostPaise,
        weightedScore: 0,
      };
    });

    // Per-axis ranks (1 = best on that axis).
    const costRanks = this.rankBy(enriched, (e) => e.quote.rate, 'asc');
    const slaRanks = this.rankBy(
      enriched,
      (e) => e.quote.estimatedDays.max,
      'asc',
    );
    const reliabilityRanks = this.rankBy(
      enriched,
      (e) => e.courierScore,
      'desc',
    );

    // Pick the strategy.
    let sorted: EnrichedQuote[];
    switch (prefs.strategy) {
      case 'cheapest':
        sorted = [...enriched].sort(
          (a, b) =>
            costRanks.get(a.quote.carrierCode)! -
            costRanks.get(b.quote.carrierCode)!,
        );
        break;
      case 'fastest':
        sorted = [...enriched].sort(
          (a, b) =>
            slaRanks.get(a.quote.carrierCode)! -
            slaRanks.get(b.quote.carrierCode)!,
        );
        break;
      case 'reliability_first':
        sorted = [...enriched].sort(
          (a, b) =>
            reliabilityRanks.get(a.quote.carrierCode)! -
            reliabilityRanks.get(b.quote.carrierCode)!,
        );
        break;
      case 'best_value':
      case 'balanced': {
        // Weighted composite: lower cost + lower sla is better, higher
        // score is better. We min/max-normalize each axis to [0, 1] and
        // combine with the merchant's weights.
        const maxCost = Math.max(...enriched.map((e) => e.quote.rate), 1);
        const maxSla = Math.max(
          ...enriched.map((e) => e.quote.estimatedDays.max),
          1,
        );
        const w = prefs.weights ?? { cost: 0.4, sla: 0.4, reliability: 0.2 };

        for (const e of enriched) {
          // 0..1 — 0 is best (cheapest, fastest); we subtract from 1 so
          // 1 is best and it's directly comparable to the score axis.
          const costNorm = e.quote.rate / maxCost;
          const slaNorm = e.quote.estimatedDays.max / maxSla;
          const scoreNorm = e.courierScore / 100;
          e.weightedScore =
            w.cost * (1 - costNorm) +
            w.sla * (1 - slaNorm) +
            w.reliability * scoreNorm;
        }
        sorted = [...enriched].sort((a, b) => b.weightedScore - a.weightedScore);
        break;
      }
      default: {
        // Defensive default — should be unreachable thanks to the
        // `RateRankingStrategy` enum on the GraphQL side.
        this.logger.warn(
          `RateRanking: unknown strategy "${prefs.strategy}", falling back to best_value`,
        );
        sorted = [...enriched];
        break;
      }
    }

    // Build the output.
    return sorted.map((entry, i) => this.toRanked(entry, i, sorted, costRanks, slaRanks, reliabilityRanks));
  }

  /**
   * Assigns a 1-indexed rank to each entry on the given axis. Ties share
   * the same rank; the next non-tied entry jumps.
   */
  private rankBy(
    entries: EnrichedQuote[],
    pick: (e: EnrichedQuote) => number,
    direction: 'asc' | 'desc',
  ): Map<string, number> {
    const sorted = [...entries].sort((a, b) =>
      direction === 'asc' ? pick(a) - pick(b) : pick(b) - pick(a),
    );
    const ranks = new Map<string, number>();
    let lastValue: number | null = null;
    let lastRank = 0;
    sorted.forEach((e, idx) => {
      const v = pick(e);
      if (lastValue === null || v !== lastValue) {
        lastRank = idx + 1;
        lastValue = v;
      }
      ranks.set(e.quote.carrierCode, lastRank);
    });
    return ranks;
  }

  private toRanked(
    entry: EnrichedQuote,
    position: number,
    sorted: EnrichedQuote[],
    costRanks: Map<string, number>,
    slaRanks: Map<string, number>,
    reliabilityRanks: Map<string, number>,
  ): RankedRateQuote {
    const q = entry.quote;
    const cheapest = sorted[0]?.quote;
    const reasonWhyNotFirst = this.buildReason(
      q,
      position,
      cheapest,
      entry.courierScore,
    );
    return {
      ...q,
      ranking: {
        position: position + 1,
        // Position-weighted score: 1.0 for first, ~0 for last. The
        // weighted composite lives on the `RankedRateQuote` only when
        // the merchant cares; for now we surface a simple rank-based
        // score so the dashboard can render a progress bar.
        score: Number((1 - position / Math.max(sorted.length, 1)).toFixed(4)),
        costRank: costRanks.get(q.carrierCode) ?? 0,
        slaRank: slaRanks.get(q.carrierCode) ?? 0,
        reliabilityRank: reliabilityRanks.get(q.carrierCode) ?? 0,
        effectiveCostPaise: entry.effectiveCostPaise,
        expectedRtoLossPaise: entry.expectedRtoLossPaise,
        courierScore: entry.courierScore,
        reasonWhyNotFirst,
      },
    };
  }

  /**
   * Human-readable reason. Renders as:
   *   position 1:    "Best match for your strategy"
   *   position > 1:  "₹15 more than the cheapest; 1 day(s) slower"
   *
   * Always paise-aware — converts to rupees at the render boundary.
   */
  private buildReason(
    q: RateQuote,
    position: number,
    cheapest: RateQuote | undefined,
    courierScore: number,
  ): string {
    if (position === 0) return 'Best match for your strategy';
    if (!cheapest) return 'Best match for your strategy';

    const costDiffPaise = q.rate - cheapest.rate;
    const slaDiff = q.estimatedDays.max - cheapest.estimatedDays.max;
    const parts: string[] = [];
    if (costDiffPaise > 0) {
      const rupees = (costDiffPaise / 100).toFixed(2);
      parts.push(`₹${rupees} more than the cheapest`);
    } else if (costDiffPaise < 0) {
      const rupees = Math.abs(costDiffPaise / 100).toFixed(2);
      parts.push(`₹${rupees} cheaper than the fastest`);
    }
    if (slaDiff > 0) {
      parts.push(`${slaDiff} day(s) slower`);
    } else if (slaDiff < 0) {
      parts.push(`${Math.abs(slaDiff)} day(s) faster`);
    }
    if (courierScore < DEFAULT_COURIER_SCORE) {
      parts.push(`score ${courierScore}/100`);
    }
    return parts.length > 0 ? parts.join('; ') : 'Best match for your strategy';
  }
}
