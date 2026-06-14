import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  NdrCaseEntity,
  OrderEntity,
  RtoDisputeEntity,
  ShipmentEntity,
  TrackingEventEntity,
} from '@swiftship/platform-typeorm';
import { QueuesModule } from '@swiftship/platform-queues';
import { TenantModule } from '@swiftship/domains-tenants';
import { NotificationsModule } from '@swiftship/domains-notifications';
import { NdrService } from './ndr.service';
import { NdrStateMachine } from './ndr-state-machine.service';
import { NdrResolver } from './ndr.resolver';
import { TrackingIngestionProcessor } from './tracking-ingestion.processor';
import { NdrContactService } from './ndr-contact.service';
import { NdrVoiceWebhookController } from './ndr-voice-webhook.controller';
import { RtoSettlementService } from './rto-settlement.service';
import { RtoDisputeResolver } from './rto-dispute.resolver';

/**
 * NdrModule — public API for the NDR (Non-Delivery Report) domain.
 *
 * Imports:
 *  - TypeOrmModule.forFeature on the entities this lib owns
 *    (NdrCaseEntity, RtoDisputeEntity) plus the cross-aggregate entities
 *    it reads (ShipmentEntity, OrderEntity, TrackingEventEntity).
 *  - QueuesModule (for the BullMQ `tracking-events` worker).
 *  - TenantModule (for TenantContext — request-scoped tenant identity, and
 *    WalletService for the RTO settlement cascade).
 *  - NotificationsModule (WatiService + ExotelService — SS-018).
 *
 * Exports:
 *  - NdrService — for sibling domains (orders, shipments) to read or
 *    transition cases.
 *  - NdrStateMachine — for sibling domains to validate transitions
 *    without touching the DB.
 *  - NdrContactService — for resolvers / jobs to trigger customer
 *    outreach.
 *  - RtoSettlementService — for sibling domains to fire the RTO cascade
 *    explicitly (e.g. from a webhook that bypasses the NDR state machine).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      NdrCaseEntity,
      RtoDisputeEntity,
      ShipmentEntity,
      OrderEntity,
      TrackingEventEntity,
    ]),
    QueuesModule,
    TenantModule,
    NotificationsModule,
  ],
  providers: [
    NdrService,
    NdrStateMachine,
    NdrResolver,
    TrackingIngestionProcessor,
    NdrContactService,
    RtoSettlementService,
    RtoDisputeResolver,
  ],
  controllers: [NdrVoiceWebhookController],
  exports: [
    NdrService,
    NdrStateMachine,
    NdrContactService,
    RtoSettlementService,
  ],
})
export class NdrModule {}
