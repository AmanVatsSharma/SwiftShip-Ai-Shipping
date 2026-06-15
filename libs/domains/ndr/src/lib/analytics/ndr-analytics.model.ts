import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

/**
 * SS-038 — NDR analytics ObjectType models.
 *
 * These drive the GraphQL schema (see `apps/api/src/schema.graphql`).
 * They are intentionally flat — the dashboard pulls four parallel
 * lists rather than a single nested object, which keeps the resolver
 * independent and the queries cacheable.
 */

/** Top N NDR reasons with recovery rate + average attempts. */
@ObjectType('NdrReasonBreakdown', {
  description: 'A single NDR reason with its count, recovery rate, and average attempts.',
})
export class NdrReasonBreakdown {
  @Field({ description: 'Free-text reason from the carrier / state machine.' })
  reason!: string;

  @Field(() => Int, { description: 'Number of NDR cases with this reason in the range.' })
  count!: number;

  /** 0..1 share of cases that reached DELIVERED (recovered). */
  @Field(() => Float, {
    description: 'Share (0..1) of cases that resolved to DELIVERED.',
  })
  recoveryRate!: number;

  @Field(() => Float, {
    description: 'Mean attemptCount across all cases for this reason.',
  })
  avgAttempts!: number;
}

/** Top N pincodes by NDR count with the rate over total shipments. */
@ObjectType('NdrPincodeBreakdown', {
  description: 'A destination pincode with its NDR count and rate.',
})
export class NdrPincodeBreakdown {
  @Field({ description: 'Destination pincode (6-digit Indian postal code).' })
  pincode!: string;

  @Field(() => Int, { description: 'Number of NDR cases shipped to this pincode.' })
  count!: number;

  /** 0..1 share of shipments to this pincode that ended up as NDR. */
  @Field(() => Float, {
    description: 'Share (0..1) of shipments to this pincode that became NDR.',
  })
  ndrRate!: number;
}

/** Per-courier NDR rate. */
@ObjectType('NdrCourierBreakdown', {
  description: 'NDR rate for a single carrier / courier.',
})
export class NdrCourierBreakdown {
  @Field({ description: 'Carrier code (e.g. "delhivery", "xpressbees").' })
  courier!: string;

  @Field(() => Int, { description: 'Number of NDR cases for this carrier in the range.' })
  count!: number;

  @Field(() => Int, {
    description: 'Total number of shipments for this carrier in the range.',
  })
  totalShipments!: number;

  @Field(() => Float, {
    description: 'Share (0..1) of shipments that became NDR for this carrier.',
  })
  ndrRate!: number;
}

/** 24-hour bucket count of NDR cases (by createdAt hour, local UTC). */
@ObjectType('NdrTimeOfDayBucket', {
  description: 'Count of NDR cases for a single hour of the day (0..23).',
})
export class NdrTimeOfDayBucket {
  @Field(() => Int, { description: 'Hour of the day, 0..23 (UTC).' })
  hour!: number;

  @Field(() => Int, { description: 'NDR cases opened during this hour.' })
  count!: number;
}
