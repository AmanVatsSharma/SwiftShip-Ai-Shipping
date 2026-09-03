// SS-103 (2026-09): the legacy `src/dashboard/*` analytics queries are
// ported into this lib as TypeORM-native code (`DashboardLibModule`):
// `dashboardStats`, `revenueAnalytics`, `carrierPerformance`,
// `slaMetrics`, `totalSales`. The courier scorecard feature below
// (TypeORM + BullMQ) remains the source of truth for scorecards.
export { DashboardLibModule } from './lib/dashboard.module';
export { DashboardService } from './lib/dashboard.service';
export { DashboardResolver } from './lib/dashboard.resolver';
export {
  DashboardStats,
  RevenueAnalytics,
  RevenueByStatus,
  RevenueTrend,
  CarrierPerformance,
  CarrierPerformanceAnalytics,
  CarrierPerformanceSummary,
  SlaMetrics,
  StatusBreakdown,
} from './lib/dashboard.model';

// Courier scorecard feature (TypeORM + BullMQ).
// Re-exported from the lib so consumers can `import { CourierScoreModule } from '@swiftship/domains-dashboard'`.
export * from './lib/courier-score.module';
export * from './lib/courier-score.service';
export * from './lib/courier-score.worker';
export * from './lib/courier-score.scheduler';

// Export specific types
export { CourierScorecardResult } from './lib/courier-score.service';
export { CourierScoreDailyEntity } from '@swiftship/platform-typeorm';
