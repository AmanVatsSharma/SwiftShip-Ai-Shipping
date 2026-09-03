import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import type { RateQuote } from '@swiftship/platform-carriers';

/**
 * GraphQL models for the plain (un-ranked) rate-shop + serviceability
 * queries (SS-103). Ported from the legacy `src/rate-shop` tree onto
 * `RateShopService` from `@swiftship/platform-rate-cache`.
 *
 * All money fields are paise — see CLAUDE.md "paise for money".
 * Every `@Field` on a nullable / union position uses an explicit type
 * function (emitDecoratorMetadata cannot reflect unions).
 */

/**
 * A single carrier quote — the `RateQuote` interface from
 * `@swiftship/platform-carriers` flattened for GraphQL (same projection
 * style as `RankedRateQuoteGql`, minus the ranking block: the plain
 * `rateShop` query does NOT rank, sort or filter).
 */
@ObjectType()
export class RateShopQuote {
  @Field(() => String, { description: 'Human-readable carrier name' })
  carrier!: string;

  @Field(() => String, { description: 'Carrier code (e.g. DELHIVERY)' })
  carrierCode!: string;

  @Field(() => String, { description: 'STANDARD | EXPRESS | SAME_DAY | OVERNIGHT' })
  serviceType!: string;

  /** Quoted rate in paise. */
  @Field(() => Int)
  rate!: number;

  @Field(() => String)
  currency!: string;

  @Field(() => Int)
  etaDaysMin!: number;

  @Field(() => Int)
  etaDaysMax!: number;

  @Field(() => Boolean, { description: 'COD accepted for this quote' })
  codAvailable!: boolean;

  @Field(() => Boolean, { description: 'Pickup available for this quote' })
  pickupAvailable!: boolean;

  @Field(() => Date, { description: 'Quote expiry timestamp' })
  expiresAt!: Date;

  /** Free-form adapter metadata, JSON-stringified for the GraphQL surface. */
  @Field(() => String, { nullable: true })
  metadata?: Record<string, unknown>;
}

/**
 * Project a service-level `RateQuote` into the GraphQL-shaped
 * `RateShopQuote`. Pure — no side effects (mirrors
 * `projectRankedQuoteForGql` in the rate-ranking model).
 */
export function projectQuoteForGql(q: RateQuote): RateShopQuote {
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
    metadata: (q.metadata ?? undefined) as Record<string, unknown> | undefined,
  };
}

/** Zone info for one end of a pincode pair (from `pincode_zones`). */
@ObjectType()
export class ZoneInfo {
  @Field(() => String)
  pincode!: string;

  /** Zone letter (A–E) — null when the pincode is not mapped. */
  @Field(() => String, { nullable: true })
  zone?: string | null;

  @Field(() => Boolean, { description: 'Out-of-Delivery-Area (ODA) flag' })
  oda!: boolean;
}

/** Warehouse coverage row for the destination pincode, when asked for. */
@ObjectType()
export class WarehouseCoverageInfo {
  @Field(() => Int)
  warehouseId!: number;

  @Field(() => String)
  pincode!: string;

  /** Turnaround time in days, when configured. */
  @Field(() => Int, { nullable: true })
  tatDays?: number | null;

  @Field(() => Boolean)
  isOda!: boolean;

  /** ODA surcharge (INR), when configured. */
  @Field(() => Float, { nullable: true })
  odaFee?: number | null;
}

/**
 * Result of the `checkServiceability` query.
 *
 * Honest answer contract: a pincode missing from `pincode_zones` is
 * reported as a null zone and `serviceable=false` — "unknown" is never
 * reported as serviceable. See `ServiceabilityService` for details.
 */
@ObjectType()
export class ServiceabilityCheckResult {
  @Field(() => Boolean, {
    description: 'True only when both pincodes are mapped in pincode_zones',
  })
  serviceable!: boolean;

  @Field(() => ZoneInfo, { nullable: true })
  originZone?: ZoneInfo | null;

  @Field(() => ZoneInfo, { nullable: true })
  destinationZone?: ZoneInfo | null;

  @Field(() => WarehouseCoverageInfo, { nullable: true })
  warehouseCoverage?: WarehouseCoverageInfo | null;
}
