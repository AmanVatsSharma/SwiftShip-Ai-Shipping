// SS-decommission (2026-08): the legacy `src/rate-shop/*` re-exports were
// removed — that tree no longer compiles (it still referenced the deleted
// PrismaCompat shim). The rate-ranking engine below is the TypeORM-native
// source of truth. `RateShopService` (the actual rate fetcher) lives in
// `@swiftship/platform-rate-cache`. The old `rateShop` / `checkServiceability`
// GraphQL queries are unwired until they are ported into this lib — tracked
// as a follow-up bead (see STATUS.md §3).

// ---------------------------------------------------------------------------
// SS-010: Rate ranking engine — TypeORM-native, depends on
// `RateShopService` (platform/rate-cache) + `RateMathService` (platform/rate-math)
// + `CourierScoreService` (domains/dashboard). Exposes a GraphQL `rankedRateShop`
// query that returns a sorted/filtered list of `RankedRateQuote`.
// ---------------------------------------------------------------------------
export { RateRankingService } from './lib/rate-ranking/rate-ranking.service';
export { RateRankingModule } from './lib/rate-ranking/rate-ranking.module';
export { RateRankingResolver } from './lib/rate-ranking/rate-ranking.resolver';
export type {
  RateRankingPreferences,
  RateRankingStrategyName,
  RankedRateQuote,
} from './lib/rate-ranking/rate-ranking.service';
export {
  RateRanking,
  RankedRateQuoteGql,
  RankedRateShopResult,
} from './lib/rate-ranking/rate-ranking.model';
export { RankedRateShopInput, RateRankingStrategy, RateSimulationOverrides } from './lib/rate-ranking/rate-shop.input';
export { RateSimulatorService } from './lib/rate-ranking/rate-simulator.service';
