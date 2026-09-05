/**
 * AppModule — wires every domain + platform lib the REST controllers
 * need, but skips GraphQL-specific bits. Mirrors `apps/api/src/app.module.ts`
 * minus `GraphqlLibModule` and the GraphQL schema generation.
 *
 * Tenant resolution is the *middleware* path (the GraphQL app uses
 * the same `TenantMiddleware` via the GraphQL `context` callback).
 * Rate limiting runs as plain Express middleware in `main.ts` because
 * it must run BEFORE the tsoa routes to short-circuit 429s without
 * ever invoking a handler.
 */
import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

// Platform
import { TypeormModule } from '../../../../libs/platform/typeorm/src/lib/typeorm.module';
import { configureTenantContext } from '@swiftship/platform-typeorm';
import { AuthLibModule } from '../../../../libs/platform/auth/src/lib/auth.module';
import { QueuesModule } from '../../../../libs/platform/queues/src/lib/queues.module';
import { CarriersLibModule } from '../../../../libs/platform/carriers/src/lib/carriers.module';
import { RateCacheModule } from '../../../../libs/platform/rate-cache/src/lib/rate-cache.module';
import { ConfigLibModule } from '../../../../libs/platform/config/src/lib/config.module';

// Observability
import { ObservabilityModule } from '../../../../libs/observability/src/lib/observability.module';
import { MetricsController } from '../../../../libs/observability/src/lib/metrics.controller';

// Domain libs
import { OrdersLibModule } from '../../../../libs/domains/orders/src/lib/orders.module';
import { ShipmentsLibModule } from '../../../../libs/domains/shipments/src/lib/shipments.module';
import { WarehousesLibModule } from '../../../../libs/domains/warehouses/src/lib/warehouses.module';
import { BillingLibModule } from '../../../../libs/domains/billing/src/lib/billing.module';
import { TenantModule } from '@swiftship/domains-tenants';
import { RateRankingModule } from '@swiftship/domains-rate-shop';
import { TenantKeyBootstrap } from './auth/tenant-key.bootstrap';

@Module({
  imports: [
    NestConfigModule.forRoot({ isGlobal: true }),
    ConfigLibModule.forRoot({
      schema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'test', 'production')
          .default('development'),
        API_REST_PORT: Joi.number().default(3001),
        DATABASE_URL: Joi.string().uri().required(),
        CORS_ORIGIN: Joi.string().optional(),
        REDIS_URL: Joi.string().uri().optional(),
        JWT_SECRET: Joi.string().default('dev-secret'),
        DELHIVERY_TOKEN: Joi.string().optional(),
        XPRESSBEES_TOKEN: Joi.string().optional(),
        STORAGE_DRIVER: Joi.string().valid('s3', 'stub').optional(),
      }),
    }),

    // Platform
    TypeormModule.forRoot(),
    AuthLibModule,
    QueuesModule,
    CarriersLibModule,
    RateCacheModule,
    ObservabilityModule,

    // Domain
    OrdersLibModule,
    ShipmentsLibModule,
    WarehousesLibModule,
    BillingLibModule,
    TenantModule,
    RateRankingModule,
  ],
  controllers: [MetricsController],
  providers: [TenantKeyBootstrap],
})
export class AppModule {
  onModuleInit(): void {
    // SS-002c/SS-044 fallback for code paths outside of HTTP (workers,
    // cron). Mirrors apps/api/src/app.module.ts.
    configureTenantContext({
      getTenantId: () => undefined,
    });
  }
}
