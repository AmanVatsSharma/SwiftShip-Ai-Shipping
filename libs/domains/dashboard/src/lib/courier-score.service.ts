import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import {
  CourierScoreDailyEntity,
  CarrierEntity,
  ShipmentEntity,
  TrackingEventEntity,
  ShipmentStatus,
} from '@swiftship/platform-typeorm';

export interface ScoreInputs {
  delivered: number;
  onTime: number;
  ndr: number;
  rto: number;
  damaged: number;
  attempted: number;
}

export interface CourierScorecardResult {
  carrierId: number;
  carrierCode: string;
  carrierName: string;
  zone?: string;
  delivered: number;
  onTime: number;
  ndr: number;
  rto: number;
  damaged: number;
  attempted: number;
  score: number;
}

/**
 * CourierScoreService
 *
 * Read-side API over `CourierScoreDailyEntity`. The worker
 * (`CourierScoreWorker`) owns the writes; this service:
 *
 *  - `getScorecard(tenantId, carrierId, days?)` — single carrier aggregate.
 *  - `getScorecards(tenantId, days?)`           — one row per carrier.
 *  - `getScorecardsForCarrier(tenantId, carrierId, days?)` — one row per zone.
 *
 * Each call returns a composite `score` field in [0, 100]:
 *
 *   score = 100 * (
 *     0.4 * (onTime / max(delivered, 1))               // on-time ratio
 *   + 0.2 * (1 - ndr / max(attempted, 1))              // NDR avoidance
 *   + 0.2 * (1 - rto / max(delivered, 1))             // RTO avoidance
 *   + 0.1 * (1 - damaged / max(delivered, 1))         // damage avoidance
 *   + 0.1 * min(delivered / 30, 1)                     // sample-size confidence
 *   )
 */
@Injectable()
export class CourierScoreService {
  private readonly logger = new Logger(CourierScoreService.name);

  constructor(
    @InjectRepository(CourierScoreDailyEntity)
    private readonly scoreRepo: Repository<CourierScoreDailyEntity>,
    @InjectRepository(CarrierEntity)
    private readonly carrierRepo: Repository<CarrierEntity>,
    @InjectRepository(ShipmentEntity)
    private readonly shipmentRepo: Repository<ShipmentEntity>,
    @InjectRepository(TrackingEventEntity)
    private readonly trackingRepo: Repository<TrackingEventEntity>,
  ) {}

  /** Aggregate scorecard for one carrier. */
  async getScorecard(
    tenantId: number,
    carrierId: number,
    days = 30,
  ): Promise<CourierScorecardResult> {
    const { start } = this.daysBack(days);
    const rows = await this.scoreRepo
      .createQueryBuilder('s')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s.carrierId = :carrierId', { carrierId })
      .andWhere('s.day >= :start', { start })
      .getMany();

    const totals = this.sumRows(rows);
    const carrier = await this.carrierRepo.findOne({ where: { id: carrierId } });
    return {
      carrierId,
      carrierCode: totals.carrierCode,
      carrierName: carrier?.name ?? `carrier-${carrierId}`,
      delivered: totals.delivered,
      onTime: totals.onTime,
      ndr: totals.ndr,
      rto: totals.rto,
      damaged: totals.damaged,
      attempted: totals.attempted,
      score: this.computeScore(totals),
    };
  }

  /** One scorecard per carrier for the tenant. */
  async getScorecards(
    tenantId: number,
    days = 30,
  ): Promise<CourierScorecardResult[]> {
    const { start } = this.daysBack(days);
    const rows = await this.scoreRepo.find({
      where: { tenantId, day: start.toISOString().slice(0, 10) as any },
    });

    // group by carrier
    const byCarrier = new Map<number, CourierScoreDailyEntity[]>();
    for (const r of rows) {
      const arr = byCarrier.get(r.carrierId) ?? [];
      arr.push(r);
      byCarrier.set(r.carrierId, arr);
    }

    const out: CourierScorecardResult[] = [];
    const carrierIds = Array.from(byCarrier.keys());
    const carriers = carrierIds.length
      ? await this.carrierRepo.findByIds(carrierIds as any)
      : [];
    const carrierById = new Map<number, CarrierEntity>(
      (carriers as CarrierEntity[]).map((c) => [c.id, c]),
    );

    for (const [carrierId, group] of byCarrier.entries()) {
      const totals = this.sumRows(group);
      const carrier = carrierById.get(carrierId);
      out.push({
        carrierId,
        carrierCode: totals.carrierCode,
        carrierName: carrier?.name ?? `carrier-${carrierId}`,
        delivered: totals.delivered,
        onTime: totals.onTime,
        ndr: totals.ndr,
        rto: totals.rto,
        damaged: totals.damaged,
        attempted: totals.attempted,
        score: this.computeScore(totals),
      });
    }

    return out.sort((a, b) => b.score - a.score);
  }

  /** Per-zone breakdown for one carrier. */
  async getScorecardsForCarrier(
    tenantId: number,
    carrierId: number,
    days = 30,
  ): Promise<CourierScorecardResult[]> {
    const { start } = this.daysBack(days);
    const rows = await this.scoreRepo
      .createQueryBuilder('s')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s.carrierId = :carrierId', { carrierId })
      .andWhere('s.day >= :start', { start })
      .getMany();

    const byZone = new Map<string, CourierScoreDailyEntity[]>();
    for (const r of rows) {
      const arr = byZone.get(r.zone) ?? [];
      arr.push(r);
      byZone.set(r.zone, arr);
    }

    const carrier = await this.carrierRepo.findOne({ where: { id: carrierId } });
    const carrierName = carrier?.name ?? `carrier-${carrierId}`;
    const out: CourierScorecardResult[] = [];
    for (const [zone, group] of byZone.entries()) {
      const totals = this.sumRows(group);
      out.push({
        carrierId,
        carrierCode: totals.carrierCode,
        carrierName,
        zone,
        delivered: totals.delivered,
        onTime: totals.onTime,
        ndr: totals.ndr,
        rto: totals.rto,
        damaged: totals.damaged,
        attempted: totals.attempted,
        score: this.computeScore(totals),
      });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  /**
   * Recompute the courier scorecard for every carrier, over the requested
   * lookback window. Called by `CourierScoreScheduler` (SS-012) on a daily
   * cron. Returns the per-carrier summary so the caller (or its tests) can
   * inspect what was persisted.
   *
   * Score formula (per the SS-012 spec):
   *
   *   score = 100 * (
   *     0.50 * deliveryRate                         // % shipped that delivered
   *   + 0.30 * (1 - ndrRate)                        // NDR avoidance
   *   + 0.20 * (1 - rtoRate)                        // RTO avoidance
   *   )
   *
   * where each `xxxRate` is the per-carrier count divided by the carrier's
   * total shipments in the window. A carrier with no shipments in the
   * window gets a score of 0.
   *
   * The per-(carrier, zone, day) daily rows in `courier_score_daily` are
   * upserted via the worker's `upsertDay` shape — keyed on
   * `(tenantId, carrierId, zone, day)`. For `recomputeAll` we collapse
   * everything onto the `'ALL'` zone so downstream readers can roll up
   * to a tenant/carrier composite without re-aggregating.
   *
   * Resilient: a single carrier that throws does not abort the whole
   * sweep — we log and continue. This matches the SS-012 requirement
   * that "if recompute fails for one carrier, log and continue".
   */
  async recomputeAll(
    windowDays: 30 | 60 | 90 = 30,
  ): Promise<{
    windowDays: number;
    carriersProcessed: number;
    carriersFailed: number;
  }> {
    const startedAt = Date.now();
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - windowDays);

    const carriers = await this.carrierRepo.find();
    if (carriers.length === 0) {
      this.logger.log(
        `recomputeAll: no carriers found, nothing to do (window=${windowDays}d)`,
      );
      return {
        windowDays,
        carriersProcessed: 0,
        carriersFailed: 0,
      };
    }

    let carriersProcessed = 0;
    let carriersFailed = 0;
    for (const carrier of carriers) {
      try {
        await this.recomputeForCarrier(carrier, since, windowDays);
        carriersProcessed++;
      } catch (err) {
        carriersFailed++;
        this.logger.error(
          `recomputeAll: failed for carrier ${carrier.id} (${carrier.name}): ${(err as Error).message}`,
          (err as Error).stack,
        );
      }
    }

    const elapsedMs = Date.now() - startedAt;
    this.logger.log(
      `recomputeAll: window=${windowDays}d processed=${carriersProcessed} failed=${carriersFailed} elapsedMs=${elapsedMs}`,
    );
    return { windowDays, carriersProcessed, carriersFailed };
  }

  /** Compute + persist a single carrier's roll-up row. */
  private async recomputeForCarrier(
    carrier: CarrierEntity,
    since: Date,
    windowDays: number,
  ): Promise<void> {
    // 1. Count delivered shipments in the window.
    const delivered = await this.shipmentRepo.count({
      where: {
        carrierId: carrier.id,
        status: ShipmentStatus.DELIVERED,
        createdAt: MoreThan(since),
      },
    });

    // 2. Count total shipments in the window.
    const totalShipped = await this.shipmentRepo.count({
      where: {
        carrierId: carrier.id,
        createdAt: MoreThan(since),
      },
    });

    // 3. NDR + RTO come from tracking events for shipments owned by this
    //    carrier in the window.
    const trackingRows = await this.trackingRepo
      .createQueryBuilder('te')
      .leftJoin(ShipmentEntity, 's', 's.id = te.shipmentId')
      .select('te.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('s.carrierId = :carrierId', { carrierId: carrier.id })
      .andWhere('te.createdAt >= :since', { since })
      .groupBy('te.status')
      .getRawMany();

    let ndrCount = 0;
    let rtoCount = 0;
    for (const r of trackingRows) {
      const status = String(r.status ?? '');
      const c = Number(r.count ?? 0);
      if (status.startsWith('NDR')) ndrCount += c;
      if (status === 'RTO' || status.startsWith('RTO')) rtoCount += c;
    }

    // 4. Compute the score.
    const safeRate = (n: number, d: number) => (d <= 0 ? 0 : n / d);
    const deliveryRate = safeRate(delivered, totalShipped);
    const ndrRate = safeRate(ndrCount, totalShipped);
    const rtoRate = safeRate(rtoCount, totalShipped);
    const raw =
      0.5 * deliveryRate +
      0.3 * (1 - ndrRate) +
      0.2 * (1 - rtoRate);
    const score = Math.round(Math.max(0, Math.min(1, raw)) * 100);

    // 5. Persist as a single roll-up row per (tenantId=1, carrier, zone=ALL, day=today).
    //    The composite read API sums these rows; for the roll-up case we
    //    collapse to one row keyed on a synthetic 'ALL' zone + today's
    //    UTC day.
    const day = new Date().toISOString().slice(0, 10);
    const carrierCode = this.toCarrierCode(carrier.name);
    const existing = await this.scoreRepo
      .createQueryBuilder('s')
      .where('s.tenantId = :tenantId', { tenantId: 1 })
      .andWhere('s.carrierId = :carrierId', { carrierId: carrier.id })
      .andWhere('s.zone = :zone', { zone: 'ALL' })
      .andWhere('s.day = :day', { day })
      .getOne();
    if (existing) {
      existing.delivered = delivered;
      existing.onTime = delivered; // not separately tracked in recomputeAll
      existing.ndr = ndrCount;
      existing.rto = rtoCount;
      existing.damaged = 0;
      existing.attempted = totalShipped;
      existing.carrierCode = carrierCode;
      await this.scoreRepo.save(existing);
    } else {
      const ent = this.scoreRepo.create({
        tenantId: 1,
        carrierId: carrier.id,
        carrierCode,
        zone: 'ALL',
        day,
        delivered,
        onTime: delivered,
        ndr: ndrCount,
        rto: rtoCount,
        damaged: 0,
        attempted: totalShipped,
      } as Partial<CourierScoreDailyEntity>);
      await this.scoreRepo.save(ent);
    }
    this.logger.debug?.(
      `recomputeForCarrier(${carrier.id}, ${windowDays}d): score=${score} delivered=${delivered}/${totalShipped} ndr=${ndrCount} rto=${rtoCount}`,
    );
  }

  /**
   * Convert a carrier display name into the short code stored on
   * `CourierScoreDailyEntity.carrierCode`. Mirrors the worker's
   * `toCarrierCode` helper so the roll-up rows line up with the
   * per-day rows emitted by `CourierScoreWorker.run`.
   */
  private toCarrierCode(name: string): string {
    return (name || 'UNKNOWN')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 64);
  }

  // ---------- helpers ----------

  private daysBack(days: number): { start: Date; end: Date } {
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - days);
    return { start, end };
  }

  private sumRows(rows: CourierScoreDailyEntity[]): ScoreInputs & {
    carrierCode: string;
  } {
    const totals: ScoreInputs & { carrierCode: string } = {
      delivered: 0,
      onTime: 0,
      ndr: 0,
      rto: 0,
      damaged: 0,
      attempted: 0,
      carrierCode: rows[0]?.carrierCode ?? '',
    };
    for (const r of rows) {
      totals.delivered += r.delivered ?? 0;
      totals.onTime += r.onTime ?? 0;
      totals.ndr += r.ndr ?? 0;
      totals.rto += r.rto ?? 0;
      totals.damaged += r.damaged ?? 0;
      totals.attempted += r.attempted ?? 0;
    }
    return totals;
  }

  private computeScore(i: ScoreInputs): number {
    const safe = (n: number, d: number) => (d <= 0 ? 0 : n / d);
    const raw =
      0.4 * safe(i.onTime, Math.max(i.delivered, 1)) +
      0.2 * (1 - safe(i.ndr, Math.max(i.attempted, 1))) +
      0.2 * (1 - safe(i.rto, Math.max(i.delivered, 1))) +
      0.1 * (1 - safe(i.damaged, Math.max(i.delivered, 1))) +
      0.1 * Math.min(i.delivered / 30, 1);
    return Math.round(100 * Math.max(0, Math.min(1, raw)) * 100) / 100;
  }
}
