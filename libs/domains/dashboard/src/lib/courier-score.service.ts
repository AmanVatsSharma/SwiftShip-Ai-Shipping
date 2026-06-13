import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CourierScoreDailyEntity,
  CarrierEntity,
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
  constructor(
    @InjectRepository(CourierScoreDailyEntity)
    private readonly scoreRepo: Repository<CourierScoreDailyEntity>,
    @InjectRepository(CarrierEntity)
    private readonly carrierRepo: Repository<CarrierEntity>,
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
