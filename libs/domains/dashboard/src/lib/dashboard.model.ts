import { ObjectType, Field, Float, Int } from '@nestjs/graphql';

@ObjectType()
export class RevenueByStatus {
  @Field()
  status: string;

  @Field(() => Float)
  revenue: number;

  @Field(() => Int)
  orderCount: number;
}

@ObjectType()
export class RevenueTrend {
  @Field()
  date: string;

  @Field(() => Float)
  value: number;
}

@ObjectType()
export class RevenueAnalytics {
  @Field(() => Float)
  totalRevenue: number;

  @Field(() => Float)
  averageOrderValue: number;

  @Field(() => Int)
  orderCount: number;

  @Field(() => [RevenueByStatus])
  revenueByStatus: RevenueByStatus[];

  @Field(() => [RevenueTrend])
  revenueTrends: RevenueTrend[];
}

@ObjectType()
export class StatusBreakdown {
  @Field(() => Int)
  PENDING: number;

  @Field(() => Int)
  SHIPPED: number;

  @Field(() => Int)
  IN_TRANSIT: number;

  @Field(() => Int)
  DELIVERED: number;

  @Field(() => Int)
  CANCELLED: number;
}

@ObjectType()
export class CarrierPerformance {
  @Field(() => Int)
  carrierId: number;

  @Field()
  carrierName: string;

  @Field(() => Int)
  totalShipments: number;

  @Field(() => Int)
  deliveredShipments: number;

  @Field(() => Int)
  cancelledShipments: number;

  @Field(() => Float)
  deliverySuccessRate: number;

  @Field(() => Float, { nullable: true })
  averageDeliveryTimeDays: number | null;

  @Field(() => StatusBreakdown)
  statusBreakdown: StatusBreakdown;
}

@ObjectType()
export class CarrierPerformanceSummary {
  @Field(() => Int)
  totalCarriers: number;

  @Field(() => Int)
  totalShipments: number;

  @Field(() => Float)
  averageDeliverySuccessRate: number;
}

@ObjectType()
export class CarrierPerformanceAnalytics {
  @Field(() => [CarrierPerformance])
  carriers: CarrierPerformance[];

  @Field(() => CarrierPerformanceSummary)
  summary: CarrierPerformanceSummary;
}

@ObjectType()
export class DeliveryTimeAnalytics {
  @Field(() => Float, { nullable: true })
  averageDeliveryTimeDays: number | null;

  @Field(() => Float, { nullable: true })
  medianDeliveryTimeDays: number | null;

  @Field(() => String, { nullable: true })
  deliveryTimeDistribution: string; // JSON string

  @Field(() => Float, { nullable: true })
  onTimeDeliveryPercentage: number | null;

  @Field(() => Int)
  totalDeliveredShipments: number;
}

@ObjectType()
export class ReturnsByStatus {
  @Field()
  status: string;

  @Field(() => Int)
  count: number;
}

@ObjectType()
export class ReturnsByReason {
  @Field()
  reason: string;

  @Field(() => Int)
  count: number;
}

@ObjectType()
export class ReturnAnalytics {
  @Field(() => Int)
  totalReturns: number;

  @Field(() => Int)
  totalOrders: number;

  @Field(() => Float)
  returnRate: number;

  @Field(() => [ReturnsByStatus])
  returnsByStatus: ReturnsByStatus[];

  @Field(() => [ReturnsByReason])
  returnsByReason: ReturnsByReason[];
}

@ObjectType()
export class TrendData {
  @Field()
  period: string;

  @Field(() => Int)
  count: number;
}

@ObjectType()
export class OrderTrends {
  @Field()
  period: string;

  @Field(() => [TrendData])
  trends: TrendData[];

  @Field(() => Int)
  totalOrders: number;

  @Field(() => Float)
  growthRate: number;
}

@ObjectType()
export class ShipmentTrends {
  @Field()
  period: string;

  @Field(() => [TrendData])
  trends: TrendData[];

  @Field(() => Int)
  totalShipments: number;

  @Field(() => Float)
  growthRate: number;
}

@ObjectType()
export class SlaMetrics {
  @Field(() => Int)
  total: number;

  @Field(() => Int)
  delivered: number;

  @Field(() => Int)
  inTransit: number;

  @Field(() => Int)
  shipped: number;

  @Field(() => Int)
  pending: number;

  @Field(() => Int)
  cancelled: number;

  @Field(() => Float)
  deliveryRate: number;
}

@ObjectType()
export class CourierScorecard {
  @Field(() => Int)
  carrierId: number;

  @Field()
  carrierName: string;

  @Field(() => String)
  statusBreakdown: string; // JSON string
}
