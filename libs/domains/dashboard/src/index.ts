export { DashboardModule, DashboardModule as DashboardLibModule } from '../../../../src/dashboard/dashboard.module';
export { DashboardService, DashboardService as DashboardLibService } from '../../../../src/dashboard/dashboard.service';
export { DashboardResolver, DashboardResolver as DashboardLibResolver } from '../../../../src/dashboard/dashboard.resolver';
export * from '../../../../src/dashboard/dashboard.model';

// Courier scorecard feature (TypeORM + BullMQ).
// Re-exported from the lib so consumers can `import { CourierScoreModule } from '@swiftship/domains-dashboard'`.
export * from './lib/courier-score.module';
export * from './lib/courier-score.service';
export * from './lib/courier-score.worker';

// Export specific types
export { CourierScorecardResult } from './lib/courier-score.service';
export { CourierScoreDailyEntity } from '@swiftship/platform-typeorm';
