// Legacy rate-shop re-exports (kept stable for consumers during the
// Prisma → TypeORM migration; the source-of-truth still lives in
// `src/rate-shop/*`).
export { RateShopModule, RateShopModule as RateShopLibModule } from '../../../../src/rate-shop/rate-shop.module';
export { RateShopService, RateShopService as RateShopLibService } from '../../../../src/rate-shop/rate-shop.service';
export { RateShopResolver, RateShopResolver as RateShopLibResolver } from '../../../../src/rate-shop/rate-shop.resolver';
export { RateShopRequest, RateShopDecision } from '../../../../src/rate-shop/rate-shop.service';
export { ServiceabilityService, ServiceabilityService as ServiceabilityLibService } from '../../../../src/rate-shop/serviceability.service';
export { ServiceabilityParams, ServiceabilityResult } from '../../../../src/rate-shop/serviceability.service';

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
