import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TraceMiddleware } from './trace.middleware';

/**
 * SS-028 — OpenTelemetryModule.
 *
 * Mounts the `TraceMiddleware` globally. The actual SDK
 * initialization happens in `apps/api/src/main.ts` via `initOtel()`
 * — it MUST run before `NestFactory.create()` so spans are picked
 * up by the auto-instrumentation hooks.
 *
 * When `OTEL_EXPORTER_OTLP_ENDPOINT` is unset, the middleware is a
 * no-op and the bootstrap short-circuits with a console message.
 */
@Global()
@Module({})
export class OpenTelemetryModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceMiddleware).forRoutes('*');
  }
}
