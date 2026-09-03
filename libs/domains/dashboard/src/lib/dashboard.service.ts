import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CarrierEntity,
  OrderEntity,
  OrderStatus,
  ShipmentEntity,
  ShipmentStatus,
  SYSTEM_TENANT_ID,
  getCurrentTenantId,
} from '@swiftship/platform-typeorm';
import {
  CarrierPerformance,
  CarrierPerformanceAnalytics,
  DashboardStats,
  RevenueAnalytics,
  RevenueByStatus,
  RevenueTrend,
  SlaMetrics,
  StatusBreakdown,
} from './dashboard.model';

/**
 * Dashboard Service (TypeORM-native port, SS-103)
 *
 * Ported from the legacy `src/dashboard/dashboard.service.ts` + the
 * `totalSales` query of `src/orders/orders.service.ts` (both Prisma-based).
 * Prisma aggregations were mapped to TypeORM query builders per
 * MIGRATION.md §7:
 *
 *   prisma.order.aggregate({_sum})   → orders QP SUM(...) getRawOne()
 *   prisma.order.groupBy             → orders QB GROUP BY status getRawMany()
 *   prisma.shipment.count({where})   → shipments QB COUNT getRawOne()
 *
 * Every query is tenant-scoped via the ALS helper `getCurrentTenantId()`
 * (bound per-request by `TenantContextMiddleware`; see
 * `apps/api/src/tenant-context.middleware.ts`). `SYSTEM_TENANT_ID` (-1)
 * bypasses the filter for jobs / migrations. All queries are read-only.
 */
@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
    @InjectRepository(ShipmentEntity)
    private readonly shipments: Repository<ShipmentEntity>,
    @InjectRepository(CarrierEntity)
    private readonly carriers: Repository<CarrierEntity>,
  ) {}

  /**
   * Resolve the current tenantId and refuse the call when no tenant is
   * bound (mirrors `typeorm-billing.service.ts#requireTenantId`).
   * Returns `SYSTEM_TENANT_ID` untouched — the callers skip the tenant
   * filter for system contexts.
   */
  private requireTenantId(): number {
    const tid = getCurrentTenantId();
    if (tid === undefined || tid === null) {
      throw new BadRequestException(
        'Tenant context required for dashboard analytics',
      );
    }
    return Number(tid);
  }

  /** Apply the tenant filter to an aliased query builder (skip for system). */
  private scopeTenant<T>(qb: T, tenantId: number, alias: string): T {
    if (tenantId !== SYSTEM_TENANT_ID) {
      (qb as any).andWhere(`${alias}.tenantId = :tenantId`, { tenantId });
    }
    return qb;
  }

  /** Apply the optional createdAt window (legacy `dateFilter` equivalent). */
  private scopeDateWindow<T>(
    qb: T,
    alias: string,
    startDate?: Date,
    endDate?: Date,
  ): T {
    if (startDate) (qb as any).andWhere(`${alias}.createdAt >= :start`, { start: startDate });
    if (endDate) (qb as any).andWhere(`${alias}.createdAt <= :end`, { end: endDate });
    return qb;
  }

  // -------------------------------------------------------------------------
  // revenueAnalytics
  // -------------------------------------------------------------------------

  /**
   * Comprehensive revenue analytics. Faithful port of the legacy
   * `getRevenueAnalytics`: total revenue (PAID orders), revenue by status,
   * daily revenue trends (last 30 days or from `startDate`), average order
   * value and paid order count.
   */
  async getRevenueAnalytics(
    startDate?: Date,
    endDate?: Date,
  ): Promise<RevenueAnalytics> {
    const tenantId = this.requireTenantId();

    // Total revenue / avg order value / order count from PAID orders.
    const paidAgg = await this.scopeDateWindow(
      this.scopeTenant(
        this.orders
          .createQueryBuilder('o')
          .select('COALESCE(SUM(o.total), 0)', 'total')
          .addSelect('COALESCE(AVG(o.total), 0)', 'avg')
          .addSelect('COUNT(o.id)', 'count'),
        tenantId,
        'o',
      ),
      'o',
      startDate,
      endDate,
    )
      .andWhere('o.status = :paid', { paid: OrderStatus.PAID })
      .getRawOne<{ total: string; avg: string; count: string }>();

    // Revenue by status (all statuses, same window).
    const byStatusRaw = await this.scopeDateWindow(
      this.scopeTenant(
        this.orders
          .createQueryBuilder('o')
          .select('o.status', 'status')
          .addSelect('COALESCE(SUM(o.total), 0)', 'revenue')
          .addSelect('COUNT(o.id)', 'orderCount'),
        tenantId,
        'o',
      ),
      'o',
      startDate,
      endDate,
    )
      .groupBy('o.status')
      .getRawMany<{ status: OrderStatus; revenue: string; orderCount: string }>();

    // Daily revenue trends (PAID only; default window = last 30 days —
    // mirrors the legacy behaviour of defaulting the trend window to
    // 30 days back while the aggregates cover all time).
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const trendStart = startDate ?? thirtyDaysAgo;
    const dailyRows = await this.scopeTenant(
      this.orders
        .createQueryBuilder('o')
        .select('o.total', 'total')
        .addSelect('o.createdAt', 'createdAt'),
      tenantId,
      'o',
    )
      .andWhere('o.status = :paid', { paid: OrderStatus.PAID })
      .andWhere('o.createdAt >= :trendStart', { trendStart })
      .andWhere('o.createdAt <= :end', { end: endDate ?? new Date('2999-01-01') })
      .getRawMany<{ total: string | number; createdAt: Date | string }>();

    return {
      totalRevenue: Number(paidAgg?.total ?? 0),
      averageOrderValue: Number(paidAgg?.avg ?? 0),
      orderCount: Number(paidAgg?.count ?? 0),
      paidOrderCount: Number(paidAgg?.count ?? 0),
      revenueByStatus: byStatusRaw.map(
        (r): RevenueByStatus => ({
          status: String(r.status),
          revenue: Number(r.revenue ?? 0),
          orderCount: Number(r.orderCount ?? 0),
        }),
      ),
      revenueTrends: this.groupByDay(
        dailyRows.map((r) => ({
          total: Number(r.total ?? 0),
          createdAt: new Date(r.createdAt),
        })),
      ),
    };
  }

  // -------------------------------------------------------------------------
  // carrierPerformance
  // -------------------------------------------------------------------------

  /**
   * Carrier performance metrics. Faithful port of the legacy
   * `getCarrierPerformance`: per-carrier shipment counts, delivery
   * success rate, average delivery time (shippedAt → deliveredAt, day
   * ceiling) and the five-status breakdown, plus a summary block.
   */
  async getCarrierPerformance(
    startDate?: Date,
    endDate?: Date,
  ): Promise<CarrierPerformanceAnalytics> {
    const tenantId = this.requireTenantId();

    const carrierRows = await this.scopeCarrierTenant(
      this.carriers.createQueryBuilder('c'),
      tenantId,
    )
      .select('c.id', 'id')
      .addSelect('c.name', 'name')
      .getRawMany<{ id: number | string; name: string }>();

    const shipmentQb = this.shipments
      .createQueryBuilder('s')
      .select('s.carrierId', 'carrierId')
      .addSelect('s.status', 'status')
      .addSelect('s.shippedAt', 'shippedAt')
      .addSelect('s.deliveredAt', 'deliveredAt');
    this.scopeTenant(shipmentQb, tenantId, 's');
    if (startDate) shipmentQb.andWhere('s.createdAt >= :start', { start: startDate });
    if (endDate) shipmentQb.andWhere('s.createdAt <= :end', { end: endDate });
    const shipmentRows = await shipmentQb.getRawMany<{
      carrierId: number | string;
      status: ShipmentStatus;
      shippedAt: Date | string | null;
      deliveredAt: Date | string | null;
    }>();

    const byCarrier = new Map<number, typeof shipmentRows>();
    for (const row of shipmentRows) {
      const cid = Number(row.carrierId);
      const list = byCarrier.get(cid) ?? [];
      list.push(row);
      byCarrier.set(cid, list);
    }

    const performance: CarrierPerformance[] = carrierRows.map((carrier) => {
      const shipments = byCarrier.get(Number(carrier.id)) ?? [];
      const totalShipments = shipments.length;
      const deliveredShipments = shipments.filter(
        (s) => s.status === ShipmentStatus.DELIVERED,
      ).length;
      const cancelledShipments = shipments.filter(
        (s) => s.status === ShipmentStatus.CANCELLED,
      ).length;

      // Average delivery time for delivered shipments (both timestamps set).
      const deliveredWithTimes = shipments.filter(
        (s) =>
          s.status === ShipmentStatus.DELIVERED && s.shippedAt && s.deliveredAt,
      );
      const avgDeliveryTime =
        deliveredWithTimes.length > 0
          ? deliveredWithTimes.reduce((sum, s) => {
              const days = Math.ceil(
                (new Date(s.deliveredAt!).getTime() -
                  new Date(s.shippedAt!).getTime()) /
                  (1000 * 60 * 60 * 24),
              );
              return sum + days;
            }, 0) / deliveredWithTimes.length
          : null;

      const deliverySuccessRate =
        totalShipments > 0 ? (deliveredShipments / totalShipments) * 100 : 0;

      const statusBreakdown: StatusBreakdown = {
        PENDING: shipments.filter((s) => s.status === ShipmentStatus.PENDING)
          .length,
        SHIPPED: shipments.filter((s) => s.status === ShipmentStatus.SHIPPED)
          .length,
        IN_TRANSIT: shipments.filter(
          (s) => s.status === ShipmentStatus.IN_TRANSIT,
        ).length,
        DELIVERED: deliveredShipments,
        CANCELLED: cancelledShipments,
      };

      return {
        carrierId: Number(carrier.id),
        carrierName: carrier.name,
        totalShipments,
        deliveredShipments,
        cancelledShipments,
        deliverySuccessRate:
          Math.round(deliverySuccessRate * 100) / 100,
        averageDeliveryTimeDays:
          avgDeliveryTime !== null
            ? Math.round(avgDeliveryTime * 100) / 100
            : null,
        statusBreakdown,
      };
    });

    return {
      carriers: performance,
      summary: {
        totalCarriers: carrierRows.length,
        totalShipments: performance.reduce(
          (sum, p) => sum + p.totalShipments,
          0,
        ),
        averageDeliverySuccessRate:
          performance.length > 0
            ? performance.reduce((sum, p) => sum + p.deliverySuccessRate, 0) /
              performance.length
            : 0,
      },
    };
  }

  // -------------------------------------------------------------------------
  // slaMetrics
  // -------------------------------------------------------------------------

  /**
   * SLA metrics summary. Faithful port of the legacy `getSlaMetrics`:
   * one grouped count query replaces the six Prisma `count()` calls.
   */
  async getSlaMetrics(): Promise<SlaMetrics> {
    const tenantId = this.requireTenantId();

    const rows = await this.scopeTenant(
      this.shipments
        .createQueryBuilder('s')
        .select('s.status', 'status')
        .addSelect('COUNT(s.id)', 'count'),
      tenantId,
      's',
    )
      .groupBy('s.status')
      .getRawMany<{ status: ShipmentStatus; count: string }>();

    const counts = new Map<string, number>(
      rows.map((r) => [String(r.status), Number(r.count ?? 0)]),
    );
    const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
    const delivered = counts.get(ShipmentStatus.DELIVERED) ?? 0;

    return {
      total,
      delivered,
      inTransit: counts.get(ShipmentStatus.IN_TRANSIT) ?? 0,
      shipped: counts.get(ShipmentStatus.SHIPPED) ?? 0,
      pending: counts.get(ShipmentStatus.PENDING) ?? 0,
      cancelled: counts.get(ShipmentStatus.CANCELLED) ?? 0,
      deliveryRate:
        total > 0 ? Math.round((delivered / total) * 10000) / 100 : 0,
    };
  }

  // -------------------------------------------------------------------------
  // totalSales
  // -------------------------------------------------------------------------

  /**
   * Total sales from paid orders. Port of the legacy
   * `ordersService.getTotalSales()` (backed the `totalSales` GraphQL
   * query in `src/orders/orders.resolver.ts`).
   */
  async getTotalSales(): Promise<number> {
    const tenantId = this.requireTenantId();

    const row = await this.scopeTenant(
      this.orders
        .createQueryBuilder('o')
        .select('COALESCE(SUM(o.total), 0)', 'total'),
      tenantId,
      'o',
    )
      .andWhere('o.status = :paid', { paid: OrderStatus.PAID })
      .getRawOne<{ total: string }>();

    return Number(row?.total ?? 0);
  }

  // -------------------------------------------------------------------------
  // dashboardStats (composite — no legacy resolver existed)
  // -------------------------------------------------------------------------

  /**
   * Composite snapshot documented in READY_FEATURES.md. There was no
   * legacy `dashboardStats` resolver (see the SS-103 bead) — this is an
   * honest composite of the ported primitives above, not new math.
   */
  async getDashboardStats(): Promise<DashboardStats> {
    const tenantId = this.requireTenantId();

    const orderAgg = await this.scopeTenant(
      this.orders
        .createQueryBuilder('o')
        .select('COUNT(o.id)', 'count')
        .addSelect(
          'COALESCE(SUM(CASE WHEN o.status = :paid THEN o.total ELSE 0 END), 0)',
          'sales',
        )
        .setParameter('paid', OrderStatus.PAID),
      tenantId,
      'o',
    ).getRawOne<{ count: string; sales: string }>();

    const shipmentRows = await this.scopeTenant(
      this.shipments
        .createQueryBuilder('s')
        .select('s.status', 'status')
        .addSelect('COUNT(s.id)', 'count'),
      tenantId,
      's',
    )
      .groupBy('s.status')
      .getRawMany<{ status: ShipmentStatus; count: string }>();

    const counts = new Map<string, number>(
      shipmentRows.map((r) => [String(r.status), Number(r.count ?? 0)]),
    );
    const totalShipments = [...counts.values()].reduce(
      (sum, n) => sum + n,
      0,
    );
    const delivered = counts.get(ShipmentStatus.DELIVERED) ?? 0;

    return {
      totalOrders: Number(orderAgg?.count ?? 0),
      totalShipments,
      totalSales: Number(orderAgg?.sales ?? 0),
      deliveredShipments: delivered,
      pendingShipments: counts.get(ShipmentStatus.PENDING) ?? 0,
      deliveryRate:
        totalShipments > 0
          ? Math.round((delivered / totalShipments) * 10000) / 100
          : 0,
    };
  }

  // -------------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------------

  /**
   * Helper: group (total, createdAt) rows by calendar day.
   * Port of the legacy `groupByDay`.
   */
  private groupByDay(
    data: Array<{ total: number; createdAt: Date }>,
  ): RevenueTrend[] {
    const grouped: Record<string, number> = {};
    for (const item of data) {
      if (item.createdAt instanceof Date && !Number.isNaN(item.createdAt.getTime())) {
        const dateStr = item.createdAt.toISOString().split('T')[0];
        grouped[dateStr] = (grouped[dateStr] ?? 0) + (item.total ?? 0);
      }
    }
    return Object.entries(grouped)
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Carrier queries are aliased `c` — thin wrapper for `scopeTenant`. */
  private scopeCarrierTenant<T>(qb: T, tenantId: number): T {
    return this.scopeTenant(qb, tenantId, 'c');
  }
}
