import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Dashboard Service
 * 
 * Provides comprehensive analytics and metrics for the SwiftShip AI dashboard.
 * 
 * Features:
 * - Revenue analytics (total, by period, trends)
 * - Carrier performance metrics
 * - Delivery time analytics
 * - Return rate analytics
 * - Order trends
 * - Shipment trends
 * - Geographic analytics
 * - Customer insights
 * 
 * All metrics are computed efficiently using Prisma aggregations and grouped queries.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get comprehensive revenue analytics
   * 
   * Returns:
   * - Total revenue (all time)
   * - Revenue by period (daily, weekly, monthly)
   * - Revenue trends
   * - Average order value
   * - Revenue by status
   */
  async getRevenueAnalytics(startDate?: Date, endDate?: Date) {
    console.log('[DashboardService] getRevenueAnalytics', { startDate, endDate });

    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.gte = startDate;
      if (endDate) dateFilter.createdAt.lte = endDate;
    }

    // Total revenue from paid orders
    const totalRevenue = await this.prisma.order.aggregate({
      where: {
        ...dateFilter,
        status: 'PAID',
      },
      _sum: {
        total: true,
      },
    });

    // Revenue by status
    const revenueByStatus = await this.prisma.order.groupBy({
      by: ['status'],
      where: dateFilter,
      _sum: {
        total: true,
      },
      _count: {
        id: true,
      },
    });

    // Revenue trends (daily for last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const dailyRevenue = await this.prisma.order.findMany({
      where: {
        ...dateFilter,
        status: 'PAID',
        createdAt: {
          gte: startDate || thirtyDaysAgo,
        },
      },
      select: {
        total: true,
        createdAt: true,
      },
    });

    // Group by day
    const revenueByDay = this.groupByDay(dailyRevenue, 'createdAt', 'total');

    // Average order value
    const avgOrderValue = await this.prisma.order.aggregate({
      where: {
        ...dateFilter,
        status: 'PAID',
      },
      _avg: {
        total: true,
      },
    });

    // Order count
    const orderCount = await this.prisma.order.count({
      where: {
        ...dateFilter,
        status: 'PAID',
      },
    });

    return {
      totalRevenue: totalRevenue._sum.total || 0,
      averageOrderValue: avgOrderValue._avg.total || 0,
      orderCount,
      revenueByStatus: revenueByStatus.map((r) => ({
        status: r.status,
        revenue: r._sum.total || 0,
        orderCount: r._count.id,
      })),
      revenueTrends: revenueByDay,
    };
  }

  /**
   * Get carrier performance metrics
   * 
   * Returns:
   * - Shipments by carrier
   * - Delivery success rate by carrier
   * - Average delivery time by carrier
   * - On-time delivery percentage
   * - Carrier scorecard
   */
  async getCarrierPerformance(startDate?: Date, endDate?: Date) {
    console.log('[DashboardService] getCarrierPerformance', { startDate, endDate });

    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.gte = startDate;
      if (endDate) dateFilter.createdAt.lte = endDate;
    }

    // Get all carriers with shipment counts
    const carriers = await this.prisma.carrier.findMany({
      include: {
        shipments: {
          where: dateFilter,
        },
      },
    });

    // Calculate metrics per carrier
    const performance = await Promise.all(
      carriers.map(async (carrier) => {
        const shipments = carrier.shipments;
        const totalShipments = shipments.length;
        const deliveredShipments = shipments.filter((s) => s.status === 'DELIVERED').length;
        const cancelledShipments = shipments.filter((s) => s.status === 'CANCELLED').length;

        // Calculate average delivery time for delivered shipments
        const deliveredWithTimes = shipments.filter(
          (s) => s.status === 'DELIVERED' && s.shippedAt && s.deliveredAt
        );
        const avgDeliveryTime =
          deliveredWithTimes.length > 0
            ? deliveredWithTimes.reduce((sum, s) => {
                const days = Math.ceil(
                  (s.deliveredAt!.getTime() - s.shippedAt!.getTime()) / (1000 * 60 * 60 * 24)
                );
                return sum + days;
              }, 0) / deliveredWithTimes.length
            : null;

        // Delivery success rate
        const deliverySuccessRate =
          totalShipments > 0 ? (deliveredShipments / totalShipments) * 100 : 0;

        // Status breakdown
        const statusBreakdown = {
          PENDING: shipments.filter((s) => s.status === 'PENDING').length,
          SHIPPED: shipments.filter((s) => s.status === 'SHIPPED').length,
          IN_TRANSIT: shipments.filter((s) => s.status === 'IN_TRANSIT').length,
          DELIVERED: deliveredShipments,
          CANCELLED: cancelledShipments,
        };

        return {
          carrierId: carrier.id,
          carrierName: carrier.name,
          totalShipments,
          deliveredShipments,
          cancelledShipments,
          deliverySuccessRate: Math.round(deliverySuccessRate * 100) / 100,
          averageDeliveryTimeDays: avgDeliveryTime ? Math.round(avgDeliveryTime * 100) / 100 : null,
          statusBreakdown,
        };
      })
    );

    return {
      carriers: performance,
      summary: {
        totalCarriers: carriers.length,
        totalShipments: performance.reduce((sum, p) => sum + p.totalShipments, 0),
        averageDeliverySuccessRate:
          performance.length > 0
            ? performance.reduce((sum, p) => sum + p.deliverySuccessRate, 0) / performance.length
            : 0,
      },
    };
  }

  /**
   * Get delivery time analytics
   * 
   * Returns:
   * - Average delivery time
   * - Delivery time distribution
   * - On-time delivery percentage
   * - Delivery time trends
   */
  async getDeliveryTimeAnalytics(startDate?: Date, endDate?: Date) {
    console.log('[DashboardService] getDeliveryTimeAnalytics', { startDate, endDate });

    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.deliveredAt = {};
      if (startDate) dateFilter.deliveredAt.gte = startDate;
      if (endDate) dateFilter.deliveredAt.lte = endDate;
    }

    // Get delivered shipments with delivery times
    const deliveredShipments = await this.prisma.shipment.findMany({
      where: {
        ...dateFilter,
        status: 'DELIVERED',
        shippedAt: { not: null },
        deliveredAt: { not: null },
      },
      select: {
        shippedAt: true,
        deliveredAt: true,
        carrierId: true,
      },
    });

    // Calculate delivery times in days
    const deliveryTimes = deliveredShipments.map((s) => {
      const days = Math.ceil(
        (s.deliveredAt!.getTime() - s.shippedAt!.getTime()) / (1000 * 60 * 60 * 24)
      );
      return days;
    });

    if (deliveryTimes.length === 0) {
      return {
        averageDeliveryTimeDays: null,
        medianDeliveryTimeDays: null,
        deliveryTimeDistribution: {},
        onTimeDeliveryPercentage: null,
        totalDeliveredShipments: 0,
      };
    }

    // Calculate average
    const averageDeliveryTime =
      deliveryTimes.reduce((sum, days) => sum + days, 0) / deliveryTimes.length;

    // Calculate median
    const sorted = [...deliveryTimes].sort((a, b) => a - b);
    const medianDeliveryTime =
      sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];

    // Distribution by days
    const distribution: Record<number, number> = {};
    deliveryTimes.forEach((days) => {
      distribution[days] = (distribution[days] || 0) + 1;
    });

    // On-time delivery (assuming 5 days is standard)
    const onTimeThreshold = 5;
    const onTimeDeliveries = deliveryTimes.filter((days) => days <= onTimeThreshold).length;
    const onTimePercentage = (onTimeDeliveries / deliveryTimes.length) * 100;

    return {
      averageDeliveryTimeDays: Math.round(averageDeliveryTime * 100) / 100,
      medianDeliveryTimeDays: Math.round(medianDeliveryTime * 100) / 100,
      deliveryTimeDistribution: distribution,
      onTimeDeliveryPercentage: Math.round(onTimePercentage * 100) / 100,
      totalDeliveredShipments: deliveryTimes.length,
    };
  }

  /**
   * Get return rate analytics
   * 
   * Returns:
   * - Total returns
   * - Return rate percentage
   * - Returns by status
   * - Returns by reason
   * - Return trends
   */
  async getReturnAnalytics(startDate?: Date, endDate?: Date) {
    console.log('[DashboardService] getReturnAnalytics', { startDate, endDate });

    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.gte = startDate;
      if (endDate) dateFilter.createdAt.lte = endDate;
    }

    // Total returns
    const totalReturns = await this.prisma.return.count({
      where: dateFilter,
    });

    // Total orders in same period
    const totalOrders = await this.prisma.order.count({
      where: dateFilter,
    });

    // Return rate
    const returnRate = totalOrders > 0 ? (totalReturns / totalOrders) * 100 : 0;

    // Returns by status
    const returnsByStatus = await this.prisma.return.groupBy({
      by: ['status'],
      where: dateFilter,
      _count: {
        id: true,
      },
    });

    // Returns by reason (if we had a reason field with categories)
    // For now, we'll use the reason field as-is
    const returnsWithReasons = await this.prisma.return.findMany({
      where: dateFilter,
      select: {
        reason: true,
        status: true,
      },
    });

    // Group by reason (simple keyword matching)
    const returnsByReason: Record<string, number> = {};
    returnsWithReasons.forEach((r) => {
      const key = r.reason.toLowerCase();
      returnsByReason[key] = (returnsByReason[key] || 0) + 1;
    });

    return {
      totalReturns,
      totalOrders,
      returnRate: Math.round(returnRate * 100) / 100,
      returnsByStatus: returnsByStatus.map((r) => ({
        status: r.status,
        count: r._count.id,
      })),
      returnsByReason: Object.entries(returnsByReason)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10), // Top 10 reasons
    };
  }

  /**
   * Get order trends
   * 
   * Returns:
   * - Orders by day/week/month
   * - Order growth rate
   * - Orders by status over time
   */
  async getOrderTrends(period: 'day' | 'week' | 'month' = 'day', days: number = 30) {
    console.log('[DashboardService] getOrderTrends', { period, days });

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: {
          gte: startDate,
        },
      },
      select: {
        createdAt: true,
        status: true,
        total: true,
      },
    });

    // Group by period
    const grouped = this.groupByPeriod(orders, 'createdAt', period);

    return {
      period,
      trends: grouped,
      totalOrders: orders.length,
      growthRate: this.calculateGrowthRate(grouped),
    };
  }

  /**
   * Get shipment trends
   * 
   * Returns:
   * - Shipments by day/week/month
   * - Shipment growth rate
   * - Shipments by status over time
   */
  async getShipmentTrends(period: 'day' | 'week' | 'month' = 'day', days: number = 30) {
    console.log('[DashboardService] getShipmentTrends', { period, days });

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const shipments = await this.prisma.shipment.findMany({
      where: {
        createdAt: {
          gte: startDate,
        },
      },
      select: {
        createdAt: true,
        status: true,
      },
    });

    // Group by period
    const grouped = this.groupByPeriod(shipments, 'createdAt', period);

    return {
      period,
      trends: grouped,
      totalShipments: shipments.length,
      growthRate: this.calculateGrowthRate(grouped),
    };
  }

  /**
   * Get SLA metrics summary
   * 
   * Returns:
   * - Total shipments
   * - Delivered shipments
   * - In transit shipments
   * - Shipped shipments
   * - Pending shipments
   */
  async getSlaMetrics() {
    console.log('[DashboardService] getSlaMetrics');

    const total = await this.prisma.shipment.count();
    const delivered = await this.prisma.shipment.count({
      where: { status: 'DELIVERED' },
    });
    const inTransit = await this.prisma.shipment.count({
      where: { status: 'IN_TRANSIT' },
    });
    const shipped = await this.prisma.shipment.count({
      where: { status: 'SHIPPED' },
    });
    const pending = await this.prisma.shipment.count({
      where: { status: 'PENDING' },
    });
    const cancelled = await this.prisma.shipment.count({
      where: { status: 'CANCELLED' },
    });

    return {
      total,
      delivered,
      inTransit,
      shipped,
      pending,
      cancelled,
      deliveryRate: total > 0 ? Math.round((delivered / total) * 10000) / 100 : 0,
    };
  }

  /**
   * Get courier scorecards
   * 
   * Returns:
   * - Performance metrics grouped by carrier
   */
  async getCourierScorecards() {
    console.log('[DashboardService] getCourierScorecards');

    const groups = await this.prisma.shipment.groupBy({
      by: ['carrierId', 'status'],
      _count: {
        status: true,
      },
    });

    // Get carrier names
    const carriers = await this.prisma.carrier.findMany({
      select: {
        id: true,
        name: true,
      },
    });

    const carrierMap = new Map(carriers.map((c) => [c.id, c.name]));

    // Transform to carrier scorecards
    const scorecards: Record<number, any> = {};
    groups.forEach((group) => {
      if (!scorecards[group.carrierId]) {
        scorecards[group.carrierId] = {
          carrierId: group.carrierId,
          carrierName: carrierMap.get(group.carrierId) || 'Unknown',
          statusBreakdown: {},
        };
      }
      scorecards[group.carrierId].statusBreakdown[group.status] = group._count.status;
    });

    return Object.values(scorecards);
  }

  /**
   * Helper: Group data by day
   */
  private groupByDay<T>(data: T[], dateField: keyof T, valueField: keyof T): Array<{ date: string; value: number }> {
    const grouped: Record<string, number> = {};
    data.forEach((item) => {
      const date = item[dateField] as any;
      if (date instanceof Date) {
        const dateStr = date.toISOString().split('T')[0];
        const value = (item[valueField] as any) || 0;
        grouped[dateStr] = (grouped[dateStr] || 0) + value;
      }
    });
    return Object.entries(grouped)
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Helper: Group data by period (day/week/month)
   */
  private groupByPeriod<T>(
    data: T[],
    dateField: keyof T,
    period: 'day' | 'week' | 'month'
  ): Array<{ period: string; count: number }> {
    const grouped: Record<string, number> = {};
    data.forEach((item) => {
      const date = item[dateField] as any;
      if (date instanceof Date) {
        let periodKey: string;
        if (period === 'day') {
          periodKey = date.toISOString().split('T')[0];
        } else if (period === 'week') {
          const week = this.getWeek(date);
          periodKey = `${date.getFullYear()}-W${week}`;
        } else {
          periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }
        grouped[periodKey] = (grouped[periodKey] || 0) + 1;
      }
    });
    return Object.entries(grouped)
      .map(([period, count]) => ({ period, count }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  /**
   * Helper: Get week number
   */
  private getWeek(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

  /**
   * Helper: Calculate growth rate
   */
  private calculateGrowthRate(trends: Array<{ period: string; count: number }>): number {
    if (trends.length < 2) return 0;
    const firstHalf = trends.slice(0, Math.floor(trends.length / 2));
    const secondHalf = trends.slice(Math.floor(trends.length / 2));
    const firstAvg = firstHalf.reduce((sum, t) => sum + t.count, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, t) => sum + t.count, 0) / secondHalf.length;
    if (firstAvg === 0) return secondAvg > 0 ? 100 : 0;
    return Math.round(((secondAvg - firstAvg) / firstAvg) * 10000) / 100;
  }
}
