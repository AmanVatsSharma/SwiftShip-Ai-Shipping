import { Field, InputType, Int } from '@nestjs/graphql';

/**
 * SS-038 — Date range input for NDR analytics queries.
 *
 * Both fields are ISO-8601 strings (e.g. "2026-06-01T00:00:00.000Z")
 * so the GraphQL transport doesn't have to round-trip Date objects.
 *
 * `from` and `to` are inclusive at day boundaries; the service clamps
 * `to` to the end of the day so callers can pass a calendar date
 * (e.g. "2026-06-15") and get results for the whole day.
 */
@InputType({ description: 'Inclusive date range for NDR analytics queries.' })
export class DateRangeInput {
  @Field({ description: 'ISO-8601 start date (inclusive).' })
  from!: string;

  @Field({ description: 'ISO-8601 end date (inclusive; clamped to end-of-day).' })
  to!: string;
}

/**
 * Optional tenant override. When omitted the analytics service falls
 * back to the TenantContext value, which is the normal request path.
 * Cross-tenant queries are intended for platform admins only and are
 * gated at the resolver layer (TODO: role check).
 */
@InputType({ description: 'Optional tenant override for NDR analytics queries.' })
export class NdrAnalyticsFilter {
  @Field(() => Int, { nullable: true, description: 'Tenant id; defaults to TenantContext.' })
  tenantId?: number;

  @Field(() => DateRangeInput, { description: 'Inclusive date range to aggregate over.' })
  range!: DateRangeInput;
}
