import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PincodeZoneEntity,
  WarehouseCoverageEntity,
} from '@swiftship/platform-typeorm';
import { RateCacheModule } from '@swiftship/platform-rate-cache';
import { TenantModule } from '@swiftship/domains-tenants';
import { ServiceabilityService } from './serviceability.service';
import { RateShopResolver } from './rate-shop.resolver';

/**
 * RateShopLibModule (SS-103)
 *
 * TypeORM-native replacement for the legacy `src/rate-shop` module.
 * Wires:
 *
 *  - `RateCacheModule` — provides the platform `RateShopService`
 *    (multi-carrier fan-out + Redis cache + circuit breaker) that the
 *    `rateShop` query delegates to. The legacy local scoring loop
 *    (shipping_rates × surcharges, Prisma-based) is superseded by that
 *    engine + the `RateRankingModule` strategies.
 *  - `TypeOrmModule.forFeature` — repos for the serviceability lookups
 *    (`pincode_zones`, `warehouse_coverage`).
 *  - `TenantModule` — `TenantGuard` on the resolver.
 *
 * The ranking engine + simulator stay in `RateRankingModule`
 * (`./rate-ranking/`), registered separately.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PincodeZoneEntity, WarehouseCoverageEntity]),
    RateCacheModule,
    TenantModule,
  ],
  providers: [ServiceabilityService, RateShopResolver],
  exports: [ServiceabilityService],
})
export class RateShopLibModule {}
