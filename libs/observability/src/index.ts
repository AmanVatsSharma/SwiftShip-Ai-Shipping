// SS-028 — observability barrel.
//
// The observability lib is the single source of truth for everything
// observability-related in SwiftShip:
//   - structured logging (StructuredLogger)
//   - Prometheus /metrics (MetricsController)
//   - correlation IDs (correlation/*)
//   - per-tenant audit log (audit/*)
//   - Sentry error tracking (sentry/*)
//   - OpenTelemetry tracing (otel/*)
//
// The legacy entries at the top are preserved so existing
// `import { StructuredLogger, MetricsController } from '@swiftship/observability'`
// call-sites keep working.

export * from './lib/observability.module';
export * from './lib/logger.service';
export * from './lib/metrics.controller';

export * from './lib/correlation/context';
export * from './lib/correlation/correlation-id.middleware';
export * from './lib/correlation/correlation.module';

export * from './lib/audit/audit-log.types';
export * from './lib/audit/audit-log.entity';
export * from './lib/audit/audit-log.service';
export * from './lib/audit/audit-log.model';
export * from './lib/audit/audit-log.input';
export * from './lib/audit/audit-log.resolver';
export * from './lib/audit/audit-log.module';
export * from './lib/audit/auditable.decorator';
export * from './lib/audit/audit.interceptor';

export * from './lib/sentry/sentry.bootstrap';
export * from './lib/sentry/sentry.interceptor';
export * from './lib/sentry/sentry-exception.filter';
export * from './lib/sentry/sentry.module';

export * from './lib/otel/otel.bootstrap';
export * from './lib/otel/trace.middleware';
export * from './lib/otel/otel.module';
