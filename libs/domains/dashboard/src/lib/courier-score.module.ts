import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueuesModule } from '@swiftship/platform-queues';
import { ObservabilityModule } from '@swiftship/observability';
import {
  CourierScoreDailyEntity,
  ShipmentEntity,
  CarrierEntity,
  PincodeZoneEntity,
  TrackingEventEntity,
} from '@swiftship/platform-typeorm';
import { CourierScoreWorker } from './courier-score.worker';
import { CourierScoreService } from './courier-score.service';

/**
 * CourierScoreModule
 *
 * Owns the daily courier scorecard pipeline:
 *  - `CourierScoreWorker` — BullMQ worker on queue `courier-score-pull`,
 *    scheduled to run nightly at 02:00. It pulls the last 7 days of
 *    `ShipmentEntity` rows, aggregates by (carrier, zone, day), and upserts
 *    `CourierScoreDailyEntity` rows.
 *  - `CourierScoreService` — read API returning the composite scorecard for
 *    a tenant (one per carrier, or per-zone for a single carrier).
 *
 * Imports:
 *  - `TypeOrmModule.forFeature([...])` registers repositories for the
 *    entity set the worker + service touch.
 *  - `QueuesModule` provides `QueuesService` (worker + cron scheduler use
 *    the same `createWorker()` / `getQueue()` helpers used elsewhere in
 *    the codebase).
 *  - `ObservabilityModule` is global; declaring it here makes the import
 *    graph explicit for downstream module wiring and ensures the structured
 *    logger is resolvable when the dashboard lib is consumed in isolation.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CourierScoreDailyEntity,
      ShipmentEntity,
      CarrierEntity,
      PincodeZoneEntity,
      TrackingEventEntity,
    ]),
    QueuesModule,
    ObservabilityModule,
  ],
  providers: [CourierScoreWorker, CourierScoreService],
  exports: [CourierScoreService],
})
export class CourierScoreModule {}
