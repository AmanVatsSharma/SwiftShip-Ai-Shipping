// Re-export barrel for the Metrics lib.
// SS-101: points at the local implementation only — the legacy root
// `src/metrics` re-exports are gone (see STATUS.md §3).

export {
  MetricsModule,
  MetricsModule as MetricsLibModule,
} from './lib/metrics.module';
export {
  MetricsService,
  MetricsService as MetricsLibService,
} from './lib/metrics.service';
export {
  MetricsController,
  MetricsController as MetricsLibController,
} from './lib/metrics.controller';
