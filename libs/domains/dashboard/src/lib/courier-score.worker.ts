import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StructuredLogger } from '@swiftship/observability';
import { QueuesService } from '@swiftship/platform-queues';
import {
  CourierScoreDailyEntity,
  ShipmentEntity,
  CarrierEntity,
  PincodeZoneEntity,
  TrackingEventEntity,
  ShipmentStatus,
} from '@swiftship/platform-typeorm';

/**
 * CourierScoreWorker
 *
 * BullMQ worker bound to queue `courier-score-pull`. The job is scheduled
 * to run daily at 02:00 (the scheduler is registered in `OnModuleInit`).
 *
 * For each of the last 7 days (yesterday and the 6 days before it), the
 * worker:
 *  1. Iterates the set of `CarrierEntity` rows.
 *  2. For each (carrier, zone) pair, queries `ShipmentEntity` plus
 *     `TrackingEventEntity` to compute the daily counts.
 *  3. Upserts a `CourierScoreDailyEntity` row keyed on
 *     `(tenantId, carrierId, zone, day)`.
 *
 * Zone resolution:
 *  The `ShipmentEntity` has `destinationPincode` but no `zone` column, so we
 *  look up the zone via `PincodeZoneEntity.pincode`. If we don't know the
 *  zone we bucket the row under the literal `'UNKNOWN'` zone.
 *
 * Tenant resolution:
 *  `ShipmentEntity` does not have `tenantId`, but it links to `OrderEntity`
 *  which has `userId`. We denormalise that to the daily score row.
 *
 * "onTime", "ndr", "rto", "damaged" semantics:
 *  - onTime    = shipments with status = DELIVERED where
 *                (deliveredAt - shippedAt) <= estimated TAT
 *  - ndr       = shipments that produced an NDR case (i.e. have a non-null
 *                NDR row via the relation or a tracking event with status
 *                starting with `NDR_`)
 *  - rto       = shipments cancelled after creation with a tracking event
 *                whose status = RTO
 *  - damaged   = tracking events with status `DAMAGED`
 *  - attempted = shipments that had at least one tracking event
 */
@Injectable()
export class CourierScoreWorker implements OnModuleInit {
  static QUEUE = 'courier-score-pull';

  private static readonly LOOKBACK_DAYS = 7;

  constructor(
    private readonly queues: QueuesService,
    private readonly log: StructuredLogger,
    @InjectRepository(CourierScoreDailyEntity)
    private readonly scoreRepo: Repository<CourierScoreDailyEntity>,
    @InjectRepository(ShipmentEntity)
    private readonly shipmentRepo: Repository<ShipmentEntity>,
    @InjectRepository(CarrierEntity)
    private readonly carrierRepo: Repository<CarrierEntity>,
    @InjectRepository(PincodeZoneEntity)
    private readonly pincodeZoneRepo: Repository<PincodeZoneEntity>,
    @InjectRepository(TrackingEventEntity)
    private readonly trackingRepo: Repository<TrackingEventEntity>,
  ) {}

  onModuleInit() {
    this.queues.createWorker(CourierScoreWorker.QUEUE, async (job) => {
      const data = (job.data || {}) as { daysBack?: number };
      const days = Math.max(1, data.daysBack ?? CourierScoreWorker.LOOKBACK_DAYS);
      return this.run(days);
    });

    // Schedule a nightly run at 02:00 server time. BullMQ's `repeat` is a
    // cron expression; we let it use the platform queue's default connection.
    const queue = this.queues.getQueue(CourierScoreWorker.QUEUE);
    queue.add(
      CourierScoreWorker.QUEUE,
      { daysBack: CourierScoreWorker.LOOKBACK_DAYS },
      {
        repeat: { pattern: '0 2 * * *' },
        jobId: 'courier-score-pull:daily',
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }

  /**
   * Pull handler — exposed so other workers (e.g. an admin "refresh now" GraphQL
   * mutation) can call it directly.
   */
  async run(days: number): Promise<{ days: number; rows: number }> {
    const startedAt = Date.now();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const dayStarts: Date[] = [];
    for (let i = 1; i <= days; i++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      dayStarts.push(d);
    }

    const carriers = await this.carrierRepo.find();
    if (carriers.length === 0) {
      this.log.info('courier_score_worker.no_carriers', { days });
      return { days, rows: 0 };
    }

    // Pre-load pincode -> zone lookup as a Map for the worker's lifetime.
    const pincodeZones = await this.pincodeZoneRepo.find();
    const zoneByPincode = new Map<string, string>();
    for (const pz of pincodeZones) zoneByPincode.set(pz.pincode, pz.zone);

    let rowsUpserted = 0;
    for (const dayStart of dayStarts) {
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

      for (const carrier of carriers) {
        // Aggregate per (carrier, zone) for this day.
        const rows = await this.aggregateForCarrierDay(
          carrier,
          dayStart,
          dayEnd,
          zoneByPincode,
        );
        for (const r of rows) {
          await this.upsertDay(r);
          rowsUpserted++;
        }
      }
    }

    const elapsedMs = Date.now() - startedAt;
    this.log.metric('courier_score_worker.rows_upserted', rowsUpserted, {
      days: String(days),
    });
    this.log.info('courier_score_worker.done', {
      days,
      rows: rowsUpserted,
      elapsedMs,
    });
    return { days, rows: rowsUpserted };
  }

  private async aggregateForCarrierDay(
    carrier: CarrierEntity,
    start: Date,
    end: Date,
    zoneByPincode: Map<string, string>,
  ): Promise<Partial<CourierScoreDailyEntity>[]> {
    const rows = await this.shipmentRepo
      .createQueryBuilder('s')
      .leftJoin('s.order', 'o')
      .leftJoin(TrackingEventEntity, 'te', 'te.shipmentId = s.id')
      .select('s.id', 'shipmentId')
      .addSelect('o.userId', 'tenantId')
      .addSelect('s.carrierId', 'carrierId')
      .addSelect('s.destinationPincode', 'destinationPincode')
      .addSelect('s.status', 'status')
      .addSelect('s.shippedAt', 'shippedAt')
      .addSelect('s.deliveredAt', 'deliveredAt')
      .addSelect("string_agg(distinct te.status, ',' )", 'trackingStatuses')
      .where('s.carrierId = :carrierId', { carrierId: carrier.id })
      .andWhere('s.createdAt >= :start AND s.createdAt < :end', { start, end })
      .groupBy('s.id')
      .addGroupBy('o.userId')
      .getRawMany();

    // Bucket per (tenant, zone).
    type Bucket = {
      tenantId: number;
      carrierId: number;
      carrierCode: string;
      zone: string;
      day: string;
      delivered: number;
      onTime: number;
      ndr: number;
      rto: number;
      damaged: number;
      attempted: number;
    };
    const buckets = new Map<string, Bucket>();

    const dayKey = start.toISOString().slice(0, 10);
    // We use the carrier's `name` as a stand-in for a short code; the schema
    // doesn't yet have a `code` column on CarrierEntity.
    const carrierCode = this.toCarrierCode(carrier.name);

    for (const r of rows) {
      const tenantId = Number(r.tenantId ?? 0);
      const zone =
        (r.destinationPincode && zoneByPincode.get(r.destinationPincode)) ||
        'UNKNOWN';
      const key = `${tenantId}|${zone}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          tenantId,
          carrierId: carrier.id,
          carrierCode,
          zone,
          day: dayKey,
          delivered: 0,
          onTime: 0,
          ndr: 0,
          rto: 0,
          damaged: 0,
          attempted: 0,
        };
        buckets.set(key, bucket);
      }
      const statuses = String(r.trackingStatuses ?? '')
        .split(',')
        .filter(Boolean);
      const attempted = statuses.length > 0 ? 1 : 0;
      bucket.attempted += attempted;

      if (r.status === ShipmentStatus.DELIVERED) {
        bucket.delivered += 1;
        if (
          r.shippedAt &&
          r.deliveredAt &&
          new Date(r.deliveredAt).getTime() - new Date(r.shippedAt).getTime() <=
            1000 * 60 * 60 * 24 * 5 // 5-day TAT as the default on-time threshold
        ) {
          bucket.onTime += 1;
        }
      }
      if (statuses.some((s) => s.startsWith('NDR'))) bucket.ndr += 1;
      if (statuses.some((s) => s === 'RTO' || s.startsWith('RTO'))) bucket.rto += 1;
      if (statuses.some((s) => s === 'DAMAGED')) bucket.damaged += 1;
    }
    return Array.from(buckets.values());
  }

  private async upsertDay(b: Partial<CourierScoreDailyEntity>): Promise<void> {
    // We use an explicit SELECT-then-INSERT/UPDATE here to stay portable
    // across the TypeORM shim's upsert gap. The (tenantId, carrierId, zone, day)
    // tuple is unique-by-construction because the worker owns it.
    const existing = await this.scoreRepo.findOne({
      where: {
        tenantId: b.tenantId!,
        carrierId: b.carrierId!,
        zone: b.zone!,
        day: b.day!,
      } as any,
    });
    if (existing) {
      existing.delivered = b.delivered!;
      existing.onTime = b.onTime!;
      existing.ndr = b.ndr!;
      existing.rto = b.rto!;
      existing.damaged = b.damaged!;
      existing.attempted = b.attempted!;
      existing.carrierCode = b.carrierCode!;
      await this.scoreRepo.save(existing);
    } else {
      const ent = this.scoreRepo.create(b);
      await this.scoreRepo.save(ent);
    }
  }

  private toCarrierCode(name: string): string {
    return (name || 'UNKNOWN')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 64);
  }
}
