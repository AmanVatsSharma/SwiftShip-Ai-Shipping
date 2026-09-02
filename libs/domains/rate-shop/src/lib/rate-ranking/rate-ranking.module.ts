import { DynamicModule, Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule } from '@swiftship/domains-tenants';
import { ConfigModule } from '@nestjs/config';

import { RateRankingService } from './rate-ranking.service';
import { RateRankingResolver } from './rate-ranking.resolver';
import { RateSimulatorService } from './rate-simulator.service';
// Direct file imports (not the `@swiftship/domains-dashboard` /
// `@swiftship/platform-rate-math` barrels) so the legacy `src/dashboard`
// re-exports stay out of the compile graph, and because the rate-math
// barrel deliberately does not re-export its module — see STATUS.md §3.
import { CourierScoreModule } from '@swiftship/domains-dashboard';
import { RateMathModule } from '@swiftship/platform-rate-math';
import { RateCacheModule } from '@swiftship/platform-rate-cache';
import { ObservabilityModule } from '@swiftship/observability';

/**
 * RateRankingModule
 *
 * Wires up the ranking engine as a GraphQL sub-tree under
 * `RateRankingResolver` (the `rankedRateShop` query).
 *
 * Consumers (apps/api/app.module.ts) register this alongside
 * `RateCacheModule` + `RateMathModule` + `CourierScoreModule`.
 *
 * SS-013 added `RateSimulatorService` (the "what if?" engine) and
 * `RateSimulationOverrides` — two new GraphQL queries (`simulateRateShop`,
 * `simulateRateShopBatch`) live on `RateRankingResolver` and delegate
 * to it.
 *
 * Making it `@Global()` means importing it once is enough — providers
 * like `RateRankingService` and `RateSimulatorService` are available
 * everywhere. The GraphQL resolver is still scoped to this module's
 * context.
 */
@Global()
@Module({
  imports: [
    TenantModule,
    RateCacheModule,
    // RateMathModule is dynamic-only (@Module({}) + static forRoot) —
    // importing the bare class registers zero providers. Found by the
    // live boot test (2026-08).
    RateMathModule.forRoot(),
    CourierScoreModule,
    ObservabilityModule,
  ],
  providers: [RateRankingService, RateRankingResolver, RateSimulatorService],
  exports: [RateRankingService, RateSimulatorService],
})
export class RateRankingModule {
  /**
   * Static `forRoot()` pattern. A plain module import works too, but
   * `forRoot()` lets future SS-beads plumb tenantId / env overrides
   * without changing the consumer.
   */
  static forRoot(): DynamicModule {
    return {
      module: RateRankingModule,
      imports: [],
      providers: [RateRankingService, RateRankingResolver, RateSimulatorService],
      exports: [RateRankingService, RateSimulatorService],
    };
  }
}
