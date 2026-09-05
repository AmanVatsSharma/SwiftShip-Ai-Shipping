import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StructuredLogger } from './logger.service';
import { MetricsController } from './metrics.controller';

// SS-028 — sub-modules
import { CorrelationIdModule } from './correlation/correlation.module';
import { AuditLogModule } from './audit/audit-log.module';
import { SentryModule } from './sentry/sentry.module';
import { OpenTelemetryModule } from './otel/otel.module';
import { AuditLogEntity } from './audit/audit-log.entity';
import { CorrelationIdMiddleware } from './correlation/correlation-id.middleware';

/**
 * Top-level observability module.
 *
 * Bundles:
 *   - StructuredLogger       (existing — JSON logs w/ correlation context)
 *   - MetricsController      (existing — /metrics Prometheus)
 *   - CorrelationIdModule    (X-Request-Id + AsyncLocalStorage)
 *   - AuditLogModule         (audit_logs entity + service + resolver)
 *   - SentryModule           (interceptor + exception filter — no-op if SENTRY_DSN unset)
 *   - OpenTelemetryModule    (TraceMiddleware — no-op if OTEL_EXPORTER_OTLP_ENDPOINT unset)
 *
 * The bootstrap calls (`initOtel()`, `initSentry()`) live in main.ts,
 * BEFORE NestFactory.create, so SDK installation happens before any
 * auto-instrumentation hooks fire.
 *
 * The correlation-id middleware is also wired here as a direct
 * `forRoutes('*')` application — `CorrelationIdModule` does the same
 * thing via `configure()`, but the duplicate mount guarantees the
 * middleware runs even if a consumer imports the observability lib
 * without mounting the sub-module explicitly.
 */
@Global()
@Module({
  imports: [
    CorrelationIdModule,
    AuditLogModule,
    SentryModule,
    OpenTelemetryModule,
    TypeOrmModule.forFeature([AuditLogEntity]),
  ],
  providers: [StructuredLogger],
  controllers: [MetricsController],
  exports: [
    StructuredLogger,
    AuditLogModule,
    SentryModule,
    OpenTelemetryModule,
    CorrelationIdModule,
  ],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
