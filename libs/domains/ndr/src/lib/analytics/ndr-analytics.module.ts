import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CarrierEntity,
  NdrCaseEntity,
  ShipmentEntity,
} from '@swiftship/platform-typeorm';
import { TenantModule } from '@swiftship/domains-tenants';
import { NdrAnalyticsService } from './ndr-analytics.service';
import { NdrAnalyticsResolver } from './ndr-analytics.resolver';

/**
 * SS-038 — NDR analytics sub-module.
 *
 * The analytics service needs read access to the NDR + Shipment +
 * Carrier tables, and to TenantContext. It does NOT depend on the
 * rest of the NdrModule (the state machine, the contact service, the
 * RTO settlement, the BullMQ worker) — analytics is read-only, so
 * it ships as a sibling module that the parent NdrModule imports.
 *
 * Imports are kept narrow on purpose: the parent NdrModule already
 * registers TypeOrmModule.forFeature for NdrCaseEntity and
 * ShipmentEntity, so this module only needs to add CarrierEntity
 * and re-declare the entities it touches.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([NdrCaseEntity, ShipmentEntity, CarrierEntity]),
    TenantModule,
  ],
  providers: [NdrAnalyticsService, NdrAnalyticsResolver],
  exports: [NdrAnalyticsService],
})
export class NdrAnalyticsModule {}
