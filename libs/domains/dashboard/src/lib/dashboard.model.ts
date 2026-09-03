import { ObjectType, Field, Float, Int } from '@nestjs/graphql';

/**
 * GraphQL models for the dashboard analytics queries (SS-103).
 *
 * Ported from the legacy `src/dashboard/dashboard.model.ts` (Prisma era)
 * to the TypeORM-native dashboard lib. Only the models backing the
 * documented surface (READY_FEATURES.md) are kept:
 * `dashboardStats`, `revenueAnalytics`, `carrierPerformance`,
 * `slaMetrics`, `totalSales`.
 *
 * NOTE: every `@Field` on a non-trivial / nullable / union position uses
 * an explicit type function — `emitDecoratorMetadata` cannot reflect
 * `T | null` unions (this exact pattern crashed the app before).
 */

@ObjectType()
export class RevenueByStatus {
  @Field(() => String)
  status!: string;

  @Field(() => Float)
  revenue!: number;

  @Field(() => Int)
  orderCount!: number;
}

@ObjectType()
export class RevenueTrend {
  @Field(() => String)
  date!: string;

  @Field(() => Float)
  value!: number;
}

@ObjectType()
export class RevenueAnalytics {
  @Field(() => Float)
  totalRevenue!: number;

  @Field(() => Float)
  averageOrderValue!: number;

  /** Orders in the filter window with status PAID. */
  @Field(() => Int)
  orderCount!: number;

  /**
   * Alias kept for the admin-portal dashboard card (`paidOrderCount`);
   * identical to `orderCount` — both count PAID orders.
   */
  @Field(() => Int)
  paidOrderCount!: number;

  @Field(() => [RevenueByStatus])
  revenueByStatus!: RevenueByStatus[];

  @Field(() => [RevenueTrend])
  revenueTrends!: RevenueTrend[];
}

@ObjectType()
export class StatusBreakdown {
  @Field(() => Int)
  PENDING!: number;

  @Field(() => Int)
  SHIPPED!: number;

  @Field(() => Int)
  IN_TRANSIT!: number;

  @Field(() => Int)
  DELIVERED!: number;

  @Field(() => Int)
  CANCELLED!: number;
}

@ObjectType()
export class CarrierPerformance {
  @Field(() => Int)
  carrierId!: number;

  @Field(() => String)
  carrierName!: string;

  @Field(() => Int)
  totalShipments!: number;

  @Field(() => Int)
  deliveredShipments!: number;

  @Field(() => Int)
  cancelledShipments!: number;

  @Field(() => Float)
  deliverySuccessRate!: number;

  @Field(() => Float, { nullable: true })
  averageDeliveryTimeDays!: number | null;

  @Field(() => StatusBreakdown)
  statusBreakdown!: StatusBreakdown;
}

@ObjectType()
export class CarrierPerformanceSummary {
  @Field(() => Int)
  totalCarriers!: number;

  @Field(() => Int)
  totalShipments!: number;

  @Field(() => Float)
  averageDeliverySuccessRate!: number;
}

@ObjectType()
export class CarrierPerformanceAnalytics {
  @Field(() => [CarrierPerformance])
  carriers!: CarrierPerformance[];

  @Field(() => CarrierPerformanceSummary)
  summary!: CarrierPerformanceSummary;
}

@ObjectType()
export class SlaMetrics {
  @Field(() => Int)
  total!: number;

  @Field(() => Int)
  delivered!: number;

  @Field(() => Int)
  inTransit!: number;

  @Field(() => Int)
  shipped!: number;

  @Field(() => Int)
  pending!: number;

  @Field(() => Int)
  cancelled!: number;

  @Field(() => Float)
  deliveryRate!: number;
}

/**
 * Composite snapshot for the `dashboardStats` query.
 *
 * This query was documented in READY_FEATURES.md but never had a resolver
 * in the legacy tree; it is implemented here as an honest composite of
 * the ported analytics primitives (order/shipment counts + sales total +
 * SLA-style delivery rate) rather than inventing new metrics.
 */
@ObjectType()
export class DashboardStats {
  @Field(() => Int, { description: 'Total orders for the tenant' })
  totalOrders!: number;

  @Field(() => Int, { description: 'Total shipments for the tenant' })
  totalShipments!: number;

  @Field(() => Float, { description: 'Sum of order totals with status PAID (INR)' })
  totalSales!: number;

  @Field(() => Int, { description: 'Shipments currently in DELIVERED state' })
  deliveredShipments!: number;

  @Field(() => Int, { description: 'Shipments currently in PENDING state' })
  pendingShipments!: number;

  @Field(() => Float, { description: 'Delivered / total shipments, percent' })
  deliveryRate!: number;
}
