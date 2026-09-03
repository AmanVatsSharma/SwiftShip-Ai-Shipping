// SS-103 (2026-09): the legacy `src/rate-shop/*` queries are ported into
// this lib as TypeORM-native code (`RateShopLibModule`): the plain
// `rateShop` query delegates to `RateShopService` from
// `@swiftship/platform-rate-cache` (no ranking), and
// `checkServiceability` answers pincode-pair serviceability from
// `pincode_zones` / `warehouse_coverage`. The legacy local
// Prisma-based scoring service is superseded and was removed.
export { RateShopLibModule } from './lib/rate-shop.module';
export { RateShopResolver } from './lib/rate-shop.resolver';
export { ServiceabilityService } from './lib/serviceability.service';
export type { ServiceabilityParams } from './lib/serviceability.service';
export {
  RateShopQuote,
  ZoneInfo,
  WarehouseCoverageInfo,
  ServiceabilityCheckResult,
  projectQuoteForGql,
} from './lib/rate-shop.model';
export {
  RateShopRequestInput,
  ServiceabilityParamsInput,
} from './lib/rate-shop.input';

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
