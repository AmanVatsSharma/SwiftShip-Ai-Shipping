import { Query, Resolver, Args, Float, Int } from '@nestjs/graphql';
import { DashboardService } from './dashboard.service';
import {
  RevenueAnalytics,
  CarrierPerformanceAnalytics,
  DeliveryTimeAnalytics,
  ReturnAnalytics,
  OrderTrends,
  ShipmentTrends,
  SlaMetrics,
  CourierScorecard,
} from './dashboard.model';

/**
 * Dashboard Resolver
 * 
 * Provides comprehensive analytics and metrics queries for the SwiftShip AI dashboard.
 * 
 * Features:
 * - Revenue analytics with trends
 * - Carrier performance metrics
 * - Delivery time analytics
 * - Return rate analytics
 * - Order and shipment trends
 * - SLA metrics
 * - Courier scorecards
 * 
 * All queries support optional date filtering for time-based analysis.
 */
@Resolver()
export class DashboardResolver {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * Get comprehensive revenue analytics
   * 
   * Returns total revenue, average order value, revenue by status, and revenue trends.
   * Supports optional date filtering.
   */
  @Query(() => RevenueAnalytics, { description: 'Get comprehensive revenue analytics' })
  async revenueAnalytics(
    @Args('startDate', { type: () => String, nullable: true }) startDate?: string,
    @Args('endDate', { type: () => String, nullable: true }) endDate?: string,
  ): Promise<RevenueAnalytics> {
    console.log('[DashboardResolver] revenueAnalytics', { startDate, endDate });
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.dashboardService.getRevenueAnalytics(start, end);
  }

  /**
   * Get carrier performance metrics
   * 
   * Returns performance metrics for each carrier including delivery success rate,
   * average delivery time, and status breakdown.
   */
  @Query(() => CarrierPerformanceAnalytics, { description: 'Get carrier performance metrics' })
  async carrierPerformance(
    @Args('startDate', { type: () => String, nullable: true }) startDate?: string,
    @Args('endDate', { type: () => String, nullable: true }) endDate?: string,
  ): Promise<CarrierPerformanceAnalytics> {
    console.log('[DashboardResolver] carrierPerformance', { startDate, endDate });
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.dashboardService.getCarrierPerformance(start, end);
  }

  /**
   * Get delivery time analytics
   * 
   * Returns average delivery time, median delivery time, distribution, and on-time delivery percentage.
   */
  @Query(() => DeliveryTimeAnalytics, { description: 'Get delivery time analytics' })
  async deliveryTimeAnalytics(
    @Args('startDate', { type: () => String, nullable: true }) startDate?: string,
    @Args('endDate', { type: () => String, nullable: true }) endDate?: string,
  ): Promise<DeliveryTimeAnalytics> {
    console.log('[DashboardResolver] deliveryTimeAnalytics', { startDate, endDate });
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    const analytics = await this.dashboardService.getDeliveryTimeAnalytics(start, end);
    return {
      ...analytics,
      deliveryTimeDistribution: JSON.stringify(analytics.deliveryTimeDistribution),
    };
  }

  /**
   * Get return rate analytics
   * 
   * Returns total returns, return rate, returns by status, and top return reasons.
   */
  @Query(() => ReturnAnalytics, { description: 'Get return rate analytics' })
  async returnAnalytics(
    @Args('startDate', { type: () => String, nullable: true }) startDate?: string,
    @Args('endDate', { type: () => String, nullable: true }) endDate?: string,
  ): Promise<ReturnAnalytics> {
    console.log('[DashboardResolver] returnAnalytics', { startDate, endDate });
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.dashboardService.getReturnAnalytics(start, end);
  }

  /**
   * Get order trends
   * 
   * Returns order trends by day/week/month with growth rate.
   */
  @Query(() => OrderTrends, { description: 'Get order trends' })
  async orderTrends(
    @Args('period', { type: () => String, nullable: true, defaultValue: 'day' }) period?: 'day' | 'week' | 'month',
    @Args('days', { type: () => Int, nullable: true, defaultValue: 30 }) days?: number,
  ): Promise<OrderTrends> {
    console.log('[DashboardResolver] orderTrends', { period, days });
    return this.dashboardService.getOrderTrends(period || 'day', days || 30);
  }

  /**
   * Get shipment trends
   * 
   * Returns shipment trends by day/week/month with growth rate.
   */
  @Query(() => ShipmentTrends, { description: 'Get shipment trends' })
  async shipmentTrends(
    @Args('period', { type: () => String, nullable: true, defaultValue: 'day' }) period?: 'day' | 'week' | 'month',
    @Args('days', { type: () => Int, nullable: true, defaultValue: 30 }) days?: number,
  ): Promise<ShipmentTrends> {
    console.log('[DashboardResolver] shipmentTrends', { period, days });
    return this.dashboardService.getShipmentTrends(period || 'day', days || 30);
  }

  /**
   * Get SLA metrics summary
   * 
   * Returns shipment counts by status and delivery rate.
   */
  @Query(() => SlaMetrics, { description: 'Get SLA metrics summary' })
  async slaMetrics(): Promise<SlaMetrics> {
    console.log('[DashboardResolver] slaMetrics');
    return this.dashboardService.getSlaMetrics();
  }

  /**
   * Get courier scorecards
   * 
   * Returns performance metrics grouped by carrier.
   */
  @Query(() => [CourierScorecard], { description: 'Get courier scorecards' })
  async courierScorecards(): Promise<CourierScorecard[]> {
    console.log('[DashboardResolver] courierScorecards');
    const scorecards = await this.dashboardService.getCourierScorecards();
    return scorecards.map((sc) => ({
      carrierId: sc.carrierId,
      carrierName: sc.carrierName,
      statusBreakdown: JSON.stringify(sc.statusBreakdown),
    }));
  }
}
