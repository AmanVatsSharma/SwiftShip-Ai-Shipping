import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CarrierEntity,
  OrderEntity,
  ShipmentEntity,
} from '@swiftship/platform-typeorm';
import { TenantModule } from '@swiftship/domains-tenants';
import { DashboardResolver } from './dashboard.resolver';
import { DashboardService } from './dashboard.service';

/**
 * DashboardLibModule (SS-103)
 *
 * TypeORM-native replacement for the legacy `src/dashboard` module.
 * Registers repositories for the three aggregates the analytics read
 * (orders, shipments, carriers — MIGRATION.md §7 mapping) plus
 * `TenantModule` so `TenantGuard` can resolve the request tenant.
 *
 * The courier-scorecard pipeline still lives in `CourierScoreModule`
 * (same lib, separate module).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([OrderEntity, ShipmentEntity, CarrierEntity]),
    TenantModule,
  ],
  providers: [DashboardResolver, DashboardService],
  exports: [DashboardService],
})
export class DashboardLibModule {}
