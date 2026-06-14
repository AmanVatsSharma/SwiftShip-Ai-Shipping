import { Module } from '@nestjs/common';
import { RateShopPublicController } from './rate-shop.public.controller';
import { RateRankingModule } from '@swiftship/domains-rate-shop';
import { TenantModule } from '@swiftship/domains-tenants';

/**
 * SS-014: Hosts the public REST controller. The internal
 * `RateRankingService` is provided by the ranking module (already
 * registered by `RateRankingModule.forRoot()` is *not* called here —
 * the ranker is exported from the `domains/rate-shop` barrel).
 *
 * `TenantModule` brings in `TenantGuard` + the API-key middleware
 * that resolves `X-Swiftship-Api-Key` → `req.tenantId` before the
 * guard runs.
 */
@Module({
  imports: [RateRankingModule, TenantModule],
  controllers: [RateShopPublicController],
})
export class RateShopPublicModule {}
