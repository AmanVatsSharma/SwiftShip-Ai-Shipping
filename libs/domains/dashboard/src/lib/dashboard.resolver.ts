import { UseGuards } from '@nestjs/common';
import { Args, Float, Query, Resolver } from '@nestjs/graphql';
import { TenantGuard } from '@swiftship/domains-tenants';
import { DashboardService } from './dashboard.service';
import {
  CarrierPerformanceAnalytics,
  DashboardStats,
  RevenueAnalytics,
  SlaMetrics,
} from './dashboard.model';

/**
 * Dashboard Resolver (SS-103 — TypeORM-native port)
 *
 * Restores the documented dashboard GraphQL surface (READY_FEATURES.md):
 *
 *   dashboardStats                     — composite snapshot
 *   revenueAnalytics(startDate,endDate)
 *   carrierPerformance(startDate,endDate)
 *   slaMetrics
 *   totalSales                         — from the legacy orders resolver
 *
 * Ported from `src/dashboard/dashboard.resolver.ts` +
 * `src/orders/orders.resolver.ts#getTotalSales`. The legacy resolvers had
 * no auth guards, but every query here is read-only and tenant-scoped,
 * so they are guarded with `TenantGuard` (same convention as
 * `RateRankingResolver` in the rate-shop lib) — the guard guarantees a
 * tenant is bound before the service reads anything.
 */
@Resolver()
@UseGuards(TenantGuard)
export class DashboardResolver {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * Composite dashboard snapshot: order/shipment counts, total sales
   * (PAID orders) and delivery rate.
   */
  @Query(() => DashboardStats, {
    description: 'Composite dashboard snapshot (orders, shipments, sales, delivery rate)',
  })
  async dashboardStats(): Promise<DashboardStats> {
    return this.dashboardService.getDashboardStats();
  }

  /**
   * Comprehensive revenue analytics: total revenue, average order value,
   * revenue by status and daily revenue trends. Optional date filtering.
   */
  @Query(() => RevenueAnalytics, {
    description: 'Get comprehensive revenue analytics',
  })
  async revenueAnalytics(
    @Args('startDate', { type: () => String, nullable: true })
    startDate?: string,
    @Args('endDate', { type: () => String, nullable: true })
    endDate?: string,
  ): Promise<RevenueAnalytics> {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.dashboardService.getRevenueAnalytics(start, end);
  }

  /**
   * Carrier performance metrics: delivery success rate, average delivery
   * time and status breakdown per carrier. Optional date filtering.
   */
  @Query(() => CarrierPerformanceAnalytics, {
    description: 'Get carrier performance metrics',
  })
  async carrierPerformance(
    @Args('startDate', { type: () => String, nullable: true })
    startDate?: string,
    @Args('endDate', { type: () => String, nullable: true })
    endDate?: string,
  ): Promise<CarrierPerformanceAnalytics> {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.dashboardService.getCarrierPerformance(start, end);
  }

  /**
   * SLA metrics summary: shipment counts by status and delivery rate.
   */
  @Query(() => SlaMetrics, { description: 'Get SLA metrics summary' })
  async slaMetrics(): Promise<SlaMetrics> {
    return this.dashboardService.getSlaMetrics();
  }

  /**
   * Total sales amount from paid orders (INR). Port of the legacy
   * `totalSales` query that lived on the orders resolver.
   */
  @Query(() => Float, {
    description: 'Get total sales amount from paid orders',
  })
  async totalSales(): Promise<number> {
    return this.dashboardService.getTotalSales();
  }
}
