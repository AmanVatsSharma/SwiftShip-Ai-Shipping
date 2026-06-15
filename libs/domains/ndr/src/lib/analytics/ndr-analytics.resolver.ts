import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { NdrAnalyticsService } from './ndr-analytics.service';
import { NdrAnalyticsFilter } from './ndr-analytics.input';
import {
  NdrCourierBreakdown,
  NdrPincodeBreakdown,
  NdrReasonBreakdown,
  NdrTimeOfDayBucket,
} from './ndr-analytics.model';

/**
 * SS-038 — GraphQL surface for the NDR analytics dashboard.
 *
 * All four queries are tenant-scoped. The dashboard can pass a
 * tenantId override when running as a platform admin; the regular
 * path leaves it null and the service resolves the tenant from the
 * request context.
 */
@Resolver()
export class NdrAnalyticsResolver {
  constructor(private readonly analytics: NdrAnalyticsService) {}

  @Query(() => [NdrReasonBreakdown], {
    description: 'Top N NDR reasons with recovery rate and average attempts.',
  })
  ndrAnalytics(
    @Args('filter') filter: NdrAnalyticsFilter,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 10 })
    limit: number,
  ): Promise<NdrReasonBreakdown[]> {
    return this.analytics.reasons(filter, limit);
  }

  @Query(() => [NdrPincodeBreakdown], {
    description: 'Top pincodes by NDR count, with NDR rate per pincode.',
  })
  ndrByPincode(
    @Args('filter') filter: NdrAnalyticsFilter,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 20 })
    limit: number,
  ): Promise<NdrPincodeBreakdown[]> {
    return this.analytics.byPincode(filter, limit);
  }

  @Query(() => [NdrCourierBreakdown], {
    description: 'NDR rate per carrier (all active carriers, even if zero NDRs).',
  })
  ndrByCourier(
    @Args('filter') filter: NdrAnalyticsFilter,
  ): Promise<NdrCourierBreakdown[]> {
    return this.analytics.byCourier(filter);
  }

  @Query(() => [NdrTimeOfDayBucket], {
    description: 'NDR count per hour of day (0..23, dense).',
  })
  ndrByTimeOfDay(
    @Args('filter') filter: NdrAnalyticsFilter,
  ): Promise<NdrTimeOfDayBucket[]> {
    return this.analytics.byTimeOfDay(filter);
  }
}
