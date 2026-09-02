import { Module } from '@nestjs/common';
import { RateShopPublicController } from './rate-shop.public.controller';
// Direct file import (not the `@swiftship/domains-rate-shop` barrel) so the
// legacy `src/rate-shop` re-exports in the barrel stay out of the app's
// compile graph — see STATUS.md §3 (src-to-libs decommission).
import { RateRankingModule } from '../../../../libs/domains/rate-shop/src/lib/rate-ranking/rate-ranking.module';
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
