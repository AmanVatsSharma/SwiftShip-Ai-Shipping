import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CarrierEntity,
  NdrCaseEntity,
  NdrCaseStatus,
  ShipmentEntity,
} from '@swiftship/platform-typeorm';
import { TenantContext } from '@swiftship/domains-tenants';
import { DateRangeInput, NdrAnalyticsFilter } from './ndr-analytics.input';
import {
  NdrCourierBreakdown,
  NdrPincodeBreakdown,
  NdrReasonBreakdown,
  NdrTimeOfDayBucket,
} from './ndr-analytics.model';

/**
 * SS-038 — NDR analytics aggregation service.
 *
 * Pure read-side service. No mutations. All aggregations are done via
 * TypeORM's `createQueryBuilder` (the canonical pattern for TypeORM
 * aggregates) so the SQL is explicit and reviewable in code review.
 *
 * The dashboards are read by sellers diagnosing where they're losing
 * money to NDR — by reason (so they can fix root cause), by pincode
 * (so they can refuse orders to chronically failing areas), by
 * courier (so they can negotiate with carriers), and by time-of-day
 * (so they can see if their warehouse has a packing bottleneck).
 */
@Injectable()
export class NdrAnalyticsService {
  /** Default top-N for the reason breakdown when the caller doesn't specify. */
  static readonly DEFAULT_REASON_LIMIT = 10;

  /** Default top-N for the pincode breakdown. */
  static readonly DEFAULT_PINCODE_LIMIT = 20;

  constructor(
    @InjectRepository(NdrCaseEntity)
    private readonly ndrs: Repository<NdrCaseEntity>,
    @InjectRepository(ShipmentEntity)
    private readonly shipments: Repository<ShipmentEntity>,
    @InjectRepository(CarrierEntity)
    private readonly carriers: Repository<CarrierEntity>,
    private readonly tenantContext: TenantContext,
  ) {}

  // ------------------------------------------------------------------
  // Public queries
  // ------------------------------------------------------------------

  /**
   * Top N NDR reasons with their count, recovery rate, and average
   * attempts. Sorted by count desc.
   *
   * `recoveryRate` is computed as cases in DELIVERED / total cases for
   * that reason. Reasons with NULL `ndrReason` are bucketed as
   * "UNKNOWN".
   */
  async reasons(
    filter: NdrAnalyticsFilter,
    limit: number = NdrAnalyticsService.DEFAULT_REASON_LIMIT,
  ): Promise<NdrReasonBreakdown[]> {
    const tid = this.resolveTenantId(filter.tenantId);
    const { from, to } = this.normalizeRange(filter.range);

    // Use a single query: group by reason, aggregate count, sum(delivered),
    // and avg(attemptCount). COALESCE handles NULL reasons.
    const qb = this.ndrs
      .createQueryBuilder('n')
      .select(`COALESCE(n.ndr_reason, 'UNKNOWN')`, 'reason')
      .addSelect('COUNT(*)', 'count')
      .addSelect(
        `SUM(CASE WHEN n.status = :delivered THEN 1 ELSE 0 END)`,
        'recovered',
      )
      .addSelect('AVG(n.attempt_count)', 'avgAttempts')
      .where('n.tenant_id = :tid', { tid })
      .andWhere('n.created_at BETWEEN :from AND :to', { from, to })
      .groupBy(`COALESCE(n.ndr_reason, 'UNKNOWN')`)
      .orderBy('count', 'DESC')
      .limit(limit)
      .setParameter('delivered', NdrCaseStatus.DELIVERED);

    const rows = await qb.getRawMany<{
      reason: string;
      count: string;
      recovered: string;
      avgAttempts: string | null;
    }>();

    return rows.map((r) => {
      const count = Number(r.count);
      const recovered = Number(r.recovered ?? 0);
      return {
        reason: r.reason,
        count,
        recoveryRate: count === 0 ? 0 : recovered / count,
        avgAttempts: r.avgAttempts == null ? 0 : Number(r.avgAttempts),
      };
    });
  }

  /**
   * Top N pincodes (by destination) with their NDR count and NDR rate
   * (NDR count / total shipments to that pincode in the range).
   */
  async byPincode(
    filter: NdrAnalyticsFilter,
    limit: number = NdrAnalyticsService.DEFAULT_PINCODE_LIMIT,
  ): Promise<NdrPincodeBreakdown[]> {
    const tid = this.resolveTenantId(filter.tenantId);
    const { from, to } = this.normalizeRange(filter.range);

    // We need NDR count AND total shipment count, so join through the
    // shipment table on the pincode. Pincode lives on ShipmentEntity
    // (destinationPincode); the NDR row points to the shipment via
    // shipmentId.
    const rows = await this.ndrs
      .createQueryBuilder('n')
      .innerJoin(ShipmentEntity, 's', 's.id = n.shipmentId')
      .select('s.destinationPincode', 'pincode')
      .addSelect('COUNT(*)', 'ndrCount')
      .where('n.tenant_id = :tid', { tid })
      .andWhere('s.tenant_id = :tid', { tid })
      .andWhere('n.created_at BETWEEN :from AND :to', { from, to })
      .andWhere('s.destinationPincode IS NOT NULL')
      .groupBy('s.destinationPincode')
      .orderBy('ndrCount', 'DESC')
      .limit(limit)
      .getRawMany<{ pincode: string; ndrCount: string }>();

    if (rows.length === 0) return [];

    // Pull the matching total shipment counts in one shot. We can't
    // combine this into the same GROUP BY without losing the NDR
    // filter, so this is a second roundtrip — but the pincode set is
    // already bounded by `limit`.
    const pincodes = rows.map((r) => r.pincode);
    const totals = await this.shipments
      .createQueryBuilder('s')
      .select('s.destinationPincode', 'pincode')
      .addSelect('COUNT(*)', 'total')
      .where('s.tenant_id = :tid', { tid })
      .andWhere('s.created_at BETWEEN :from AND :to', { from, to })
      .andWhere('s.destinationPincode IN (:...pincodes)', { pincodes })
      .groupBy('s.destinationPincode')
      .getRawMany<{ pincode: string; total: string }>();

    const totalByPincode = new Map(
      totals.map((t) => [t.pincode, Number(t.total)]),
    );

    return rows.map((r) => {
      const ndrCount = Number(r.ndrCount);
      const total = totalByPincode.get(r.pincode) ?? ndrCount;
      return {
        pincode: r.pincode,
        count: ndrCount,
        ndrRate: total === 0 ? 0 : ndrCount / total,
      };
    });
  }

  /**
   * NDR rate per carrier. The bead calls for "all 13 carriers" — to
   * satisfy that, we LEFT JOIN against the carriers table so a carrier
   * with zero NDRs in the range still appears with count=0 and
   * ndrRate=0. The totalShipments column comes from the shipments
   * table (so it counts every shipment for the carrier in the range,
   * not just those that resulted in NDR).
   */
  async byCourier(
    filter: NdrAnalyticsFilter,
  ): Promise<NdrCourierBreakdown[]> {
    const tid = this.resolveTenantId(filter.tenantId);
    const { from, to } = this.normalizeRange(filter.range);

    // Two CTEs:
    //   ndr_per_carrier — ndrs grouped by carrierId
    //   ship_per_carrier — shipments grouped by carrierId
    // Final select LEFT JOINs both against the carrier registry so
    // every active carrier appears.
    const rows = await this.carriers
      .createQueryBuilder('c')
      .leftJoin(
        (qb) =>
          qb
            .select('s.carrierId', 'carrierId')
            .addSelect('COUNT(*)', 'ndrCount')
            .from(NdrCaseEntity, 'n')
            .innerJoin(ShipmentEntity, 's', 's.id = n.shipmentId')
            .where('n.tenant_id = :tid', { tid })
            .andWhere('s.tenant_id = :tid', { tid })
            .andWhere('n.created_at BETWEEN :from AND :to', { from, to })
            .groupBy('s.carrierId'),
        'npc',
        'npc.carrierId = c.id',
      )
      .leftJoin(
        (qb) =>
          qb
            .select('s2.carrierId', 'carrierId')
            .addSelect('COUNT(*)', 'totalCount')
            .from(ShipmentEntity, 's2')
            .where('s2.tenant_id = :tid', { tid })
            .andWhere('s2.created_at BETWEEN :from AND :to', { from, to })
            .groupBy('s2.carrierId'),
        'spc',
        'spc.carrierId = c.id',
      )
      .select('c.code', 'courier')
      .addSelect('COALESCE(npc.ndrCount, 0)', 'ndrCount')
      .addSelect('COALESCE(spc.totalCount, 0)', 'totalShipments')
      .where('c.active = true')
      .orderBy('COALESCE(npc.ndrCount, 0)', 'DESC')
      .getRawMany<{
        courier: string;
        ndrCount: string;
        totalShipments: string;
      }>();

    return rows.map((r) => {
      const ndrCount = Number(r.ndrCount);
      const total = Number(r.totalShipments);
      return {
        courier: r.courier,
        count: ndrCount,
        totalShipments: total,
        ndrRate: total === 0 ? 0 : ndrCount / total,
      };
    });
  }

  /**
   * NDR count bucketed by hour of the day (0..23, UTC). Returns a
   * dense 24-element array so the heatmap component never has to
   * render missing buckets. Empty buckets are returned as 0.
   */
  async byTimeOfDay(
    filter: NdrAnalyticsFilter,
  ): Promise<NdrTimeOfDayBucket[]> {
    const tid = this.resolveTenantId(filter.tenantId);
    const { from, to } = this.normalizeRange(filter.range);

    // EXTRACT(HOUR FROM created_at) on Postgres returns 0..23.
    const rows = await this.ndrs
      .createQueryBuilder('n')
      .select(`EXTRACT(HOUR FROM n.created_at)`, 'hour')
      .addSelect('COUNT(*)', 'count')
      .where('n.tenant_id = :tid', { tid })
      .andWhere('n.created_at BETWEEN :from AND :to', { from, to })
      .groupBy(`EXTRACT(HOUR FROM n.created_at)`)
      .orderBy('hour', 'ASC')
      .getRawMany<{ hour: string; count: string }>();

    const counts = new Map<number, number>();
    for (const r of rows) {
      counts.set(Number(r.hour), Number(r.count));
    }

    // Dense-fill 0..23 so the heatmap is always a 24x7 grid.
    const buckets: NdrTimeOfDayBucket[] = [];
    for (let h = 0; h < 24; h += 1) {
      buckets.push({ hour: h, count: counts.get(h) ?? 0 });
    }
    return buckets;
  }

  // ------------------------------------------------------------------
  // Private
  // ------------------------------------------------------------------

  /**
   * Tenant resolution. We allow the caller to override the tenant via
   * the filter (used by the platform-admin GraphQL path); otherwise we
   * fall back to the request-scoped TenantContext. Missing context
   * falls back to tenant 1, matching the pattern in NdrService.
   */
  private resolveTenantId(override?: number): number {
    if (override != null) return Number(override);
    const raw = this.tenantContext.getTenantId();
    if (raw == null) return 1;
    return Number(raw);
  }

  /**
   * Clamp the date range to start-of-day `from` and end-of-day `to`.
   * Accepts ISO-8601 strings or a Date. Returns Date instances ready
   * for TypeORM parameter binding.
   */
  private normalizeRange(range: DateRangeInput): { from: Date; to: Date } {
    const fromRaw = new Date(range.from);
    const toRaw = new Date(range.to);
    if (Number.isNaN(fromRaw.getTime()) || Number.isNaN(toRaw.getTime())) {
      throw new Error(`Invalid date range: from=${range.from}, to=${range.to}`);
    }
    const from = new Date(fromRaw);
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(toRaw);
    to.setUTCHours(23, 59, 59, 999);
    return { from, to };
  }
}
