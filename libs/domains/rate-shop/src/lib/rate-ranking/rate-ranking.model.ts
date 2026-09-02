import { Field, Int, Float, ObjectType } from '@nestjs/graphql';

/**
 * GraphQL model — the per-quote ranking meta block that explains *why* a
 * carrier quote is at this position in the result. Surfaced alongside the
 * `RankedRateQuote` so the merchant dashboard can render a tooltip like
 * "₹15 more than the cheapest; 1 day slower".
 *
 * All money fields are paise (BIGINT) — see CLAUDE.md "paise for money".
 */
@ObjectType()
export class RateRanking {
  /** 1-indexed position in the sorted result (1 = best). */
  @Field(() => Int)
  position!: number;

  /** 0..1 — higher is better. Position-weighted, not strategy-weighted. */
  @Field(() => Float)
  score!: number;

  /** 1 = cheapest of the candidate set. */
  @Field(() => Int)
  costRank!: number;

  /** 1 = fastest (smallest `etaDays.max`). */
  @Field(() => Int)
  slaRank!: number;

  /** 1 = highest courier score. */
  @Field(() => Int)
  reliabilityRank!: number;

  /** Quoted rate + expected RTO loss (paise). */
  @Field(() => Int)
  effectiveCostPaise!: number;

  /** `codAmountPaise × rto%`, rounded to paise. */
  @Field(() => Int)
  expectedRtoLossPaise!: number;

  /** 0..100, or `null` if the carrier has no score row. */
  @Field(() => Float, { nullable: true })
  courierScore?: number;

  /** Human-readable: "₹15 more than the cheapest; 1 day(s) slower". */
  @Field({ nullable: true })
  reasonWhyNotFirst?: string;
}

/**
 * A `RateQuote` from the carrier adapter, plus the per-quote ranking block.
 * GraphQL-level only — the service-level type is `RankedRateQuote` in
 * `rate-ranking.service.ts` and carries the same shape with `metadata`
 * typed as `Record<string, any>` (the runtime carrier adapter populates it).
 *
 * The two types live in separate files because:
 *  - the service needs the full `RateQuote` interface (with `estimatedDays`,
 *    `expiresAt`, `pickupAvailable`) for filtering and effective-cost math;
 *  - the GraphQL surface mirrors the public contract the merchant hits.
 */
@ObjectType()
export class RankedRateQuoteGql {
  @Field()
  carrier!: string;

  @Field()
  carrierCode!: string;

  @Field()
  serviceType!: string;

  /** Post-surcharge total rate, in paise. */
  @Field(() => Int)
  rate!: number;

  @Field()
  currency!: string;

  @Field(() => Int)
  etaDaysMin!: number;

  @Field(() => Int)
  etaDaysMax!: number;

  @Field()
  codAvailable!: boolean;

  @Field()
  pickupAvailable!: boolean;

  @Field()
  expiresAt!: Date;

  @Field(() => String, { nullable: true })
  metadata?: Record<string, unknown>;

  @Field(() => RateRanking)
  ranking!: RateRanking;
}

/**
 * Top-level GraphQL response for the `rankedRateShop` query.
 * `totalCandidates` is the post-filter count (not the raw count from
 * `RateShopService.shopRates`) so the dashboard can show "12 of 18 carriers
 * excluded by your SLA cap".
 */
@ObjectType()
export class RankedRateShopResult {
  @Field(() => [RankedRateQuoteGql])
  quotes!: RankedRateQuoteGql[];

  @Field(() => Int)
  totalCandidates!: number;

  @Field()
  appliedStrategy!: string;
}

// ---------------------------------------------------------------------------
// Projection helper
// ---------------------------------------------------------------------------

import type { RankedRateQuote } from './rate-ranking.service';

/**
 * Project a service-level `RankedRateQuote` (which uses
 * `estimatedDays: { min, max }`) into the GraphQL-shaped
 * `RankedRateQuoteGql` (which uses `etaDaysMin` / `etaDaysMax`).
 *
 * Lives here (and not in the resolver) so the simulator and the
 * `rankedRateShop` resolver can both use it without a circular
 * import. The function is pure — no side effects, no I/O.
 */
export function projectRankedQuoteForGql(
  q: RankedRateQuote,
): RankedRateQuoteGql {
  return {
    carrier: q.carrier,
    carrierCode: q.carrierCode,
    serviceType: q.serviceType,
    rate: q.rate,
    currency: q.currency,
    etaDaysMin: q.estimatedDays.min,
    etaDaysMax: q.estimatedDays.max,
    codAvailable: q.codAvailable,
    pickupAvailable: q.pickupAvailable,
    expiresAt: q.expiresAt,
    metadata: q.metadata as Record<string, unknown> | undefined,
    ranking: {
      position: q.ranking.position,
      score: q.ranking.score,
      costRank: q.ranking.costRank,
      slaRank: q.ranking.slaRank,
      reliabilityRank: q.ranking.reliabilityRank,
      effectiveCostPaise: q.ranking.effectiveCostPaise,
      expectedRtoLossPaise: q.ranking.expectedRtoLossPaise,
      courierScore: q.ranking.courierScore,
      reasonWhyNotFirst: q.ranking.reasonWhyNotFirst,
    },
  };
}
