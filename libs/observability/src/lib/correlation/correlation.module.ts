import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CorrelationIdMiddleware } from './correlation-id.middleware';

/**
 * SS-028 — CorrelationIdModule.
 *
 * Provides the `CorrelationIdMiddleware` and the `withCorrelationId` /
 * `readCorrelationIdFromJob` helpers. Global so apps/api, apps/api-public
 * and any future worker entry-point can mount it.
 *
 * The middleware itself is applied via `configure(consumer)` for `*`
 * so every request — including the GraphQL /graphql endpoint, the
 * /metrics endpoint, the /shopify/webhook raw-body endpoint and the
 * health endpoints — gets a correlation id.
 */
@Global()
@Module({})
export class CorrelationIdModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
