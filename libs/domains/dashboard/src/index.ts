// SS-decommission (2026-08): the legacy `src/dashboard/*` re-exports were
// removed — that tree no longer compiles (it still referenced the deleted
// PrismaCompat shim). The courier scorecard below is the TypeORM-native
// source of truth. The old `dashboardStats` / `revenueAnalytics` /
// `carrierPerformance` / `slaMetrics` / `totalSales` GraphQL queries are
// unwired until ported into this lib — tracked as a follow-up bead
// (see STATUS.md §3).

// Courier scorecard feature (TypeORM + BullMQ).
// Re-exported from the lib so consumers can `import { CourierScoreModule } from '@swiftship/domains-dashboard'`.
export * from './lib/courier-score.module';
export * from './lib/courier-score.service';
export * from './lib/courier-score.worker';
export * from './lib/courier-score.scheduler';

// Export specific types
export { CourierScorecardResult } from './lib/courier-score.service';
export { CourierScoreDailyEntity } from '@swiftship/platform-typeorm';
