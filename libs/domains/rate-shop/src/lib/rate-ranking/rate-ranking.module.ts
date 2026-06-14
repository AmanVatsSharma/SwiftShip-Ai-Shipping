import { DynamicModule, Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { RateRankingService } from './rate-ranking.service';
import { RateRankingResolver } from './rate-ranking.resolver';
import { RateSimulatorService } from './rate-simulator.service';
import { CourierScoreModule } from '@swiftship/domains-dashboard';
import { RateCacheModule } from '@swiftship/platform-rate-cache';
import { RateMathModule } from '@swiftship/platform-rate-math';
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
    RateCacheModule,
    RateMathModule,
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
