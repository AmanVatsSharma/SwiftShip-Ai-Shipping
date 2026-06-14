import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  NdrCaseEntity,
  ShipmentEntity,
  TrackingEventEntity,
} from '@swiftship/platform-typeorm';
import { QueuesModule } from '@swiftship/platform-queues';
import { TenantModule } from '@swiftship/domains-tenants';
import { NdrService } from './ndr.service';
import { NdrStateMachine } from './ndr-state-machine.service';
import { NdrResolver } from './ndr.resolver';
import { TrackingIngestionProcessor } from './tracking-ingestion.processor';

/**
 * NdrModule — public API for the NDR (Non-Delivery Report) domain.
 *
 * Imports:
 *  - TypeOrmModule.forFeature on the entities this lib owns
 *    (NdrCaseEntity) plus the cross-aggregate entities it reads
 *    (ShipmentEntity, TrackingEventEntity).
 *  - QueuesModule (for the BullMQ `tracking-events` worker).
 *  - TenantModule (for TenantContext — request-scoped tenant identity).
 *
 * Exports:
 *  - NdrService — for sibling domains (orders, shipments) to read or
 *    transition cases.
 *  - NdrStateMachine — for sibling domains to validate transitions
 *    without touching the DB.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      NdrCaseEntity,
      ShipmentEntity,
      TrackingEventEntity,
    ]),
    QueuesModule,
    TenantModule,
  ],
  providers: [
    NdrService,
    NdrStateMachine,
    NdrResolver,
    TrackingIngestionProcessor,
  ],
  exports: [NdrService, NdrStateMachine],
})
export class NdrModule {}
