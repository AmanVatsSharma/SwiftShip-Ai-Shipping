import { Module, NestModule, MiddlewareConsumer, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { join } from 'path';

// Platform libs (TypeORM, auth, queues, carriers, graphql, config, throttler)
import { TypeormModule } from '../../../libs/platform/typeorm/src/lib/typeorm.module';
import { configureTenantContext } from '@swiftship/platform-typeorm';
import { AuthLibModule } from '../../../libs/platform/auth/src/lib/auth.module';
import { QueuesModule } from '../../../libs/platform/queues/src/lib/queues.module';
import { PlatformCarriersModule } from '@swiftship/platform-carriers';
import { RateCacheModule } from '../../../libs/platform/rate-cache/src/lib/rate-cache.module';
import {
  ThrottlerModule as PlatformThrottlerModule,
  TenantThrottlerGuard,
} from '@swiftship/platform-throttler';

// Observability lib
import { ObservabilityModule } from '../../../libs/observability/src/lib/observability.module';
import { MetricsController } from '../../../libs/observability/src/lib/metrics.controller';
// SS-028 — Sentry filter + audit interceptor (wired globally via APP_* tokens below)
import { SentryExceptionFilter } from '../../../libs/observability/src/lib/sentry/sentry-exception.filter';
import { SentryGraphqlInterceptor } from '../../../libs/observability/src/lib/sentry/sentry.interceptor';
import { AuditInterceptor } from '../../../libs/observability/src/lib/audit/audit.interceptor';

// SS-031: KYC module (PAN + GSTIN + bank with BullMQ async verify).
// Lives under the onboarding domain; registered directly so it can
// inject the TypeORM-platform entities (no PrismaCompat shim).
import { KycModule } from '../../../libs/domains/onboarding/src/lib/kyc/kyc.module';
import { CodRemittanceModule } from '@swiftship/domains-billing';

// SS-032: GST invoicing + E-way bill (ClearTax sandbox adapter).
import { GstModule } from '../../../libs/domains/billing/src/lib/gst/gst.module';

// SS-026: channel-agnostic sync stack (Shopify, WooCommerce, Amazon Seller,
// Flipkart Seller, Myntra). Adds `channelConnections`, `connectChannel`,
// `triggerChannelSync`, etc. to the GraphQL surface and registers BullMQ
// recurring jobs for product + order pulls.
import { ChannelSyncModule } from '../../../libs/domains/channels/src/lib/sync/channel-sync.module';

// Domain libs — every feature is now an importable Nx lib.
import { OrdersLibModule } from '../../../libs/domains/orders/src/lib/orders.module';
import { ShipmentsLibModule } from '../../../libs/domains/shipments/src/lib/shipments.module';
import { WarehousesLibModule } from '../../../libs/domains/warehouses/src/lib/warehouses.module';
import { BillingLibModule } from '../../../libs/domains/billing/src/lib/billing.module';
import { UsersModule as UsersLibModule } from '../../../libs/domains/users/src/lib/users.module';
import { RolesModule as RolesLibModule } from '../../../libs/domains/users/src/lib/roles.module';
import { CodModule as CodLibModule } from '../../../libs/domains/cod/src/lib/cod.module';
import { NdrModule as NdrLibModule } from '../../../libs/domains/ndr/src/lib/ndr.module';
import { ManifestsModule as ManifestsLibModule } from '../../../libs/domains/manifests/src/lib/manifests.module';
import { PickupsModule as PickupsLibModule } from '../../../libs/domains/pickups/src/lib/pickups.module';
import { TenantModule } from '@swiftship/domains-tenants';

// App-level glue
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppResolver } from './app.resolver';
import { HealthController } from './health.controller';
import { TenantContextMiddleware } from './tenant-context.middleware';
import { RateShopPublicModule } from './rate-shop/rate-shop.public.module';

@Module({
  imports: [
    // Platform
    TypeormModule.forRoot(),
    // Joi-validated env via @nestjs/config (the platform/config lib ships
    // only the environment helpers — there is no ConfigLibModule).
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
        PORT: Joi.number().default(3000),
        DATABASE_URL: Joi.string().uri().required(),
        CORS_ORIGIN: Joi.string().optional(),
        SHOPIFY_API_KEY: Joi.string().optional(),
        SHOPIFY_API_SECRET: Joi.string().optional(),
        SHOPIFY_APP_URL: Joi.string().uri().optional(),
        SHOPIFY_SCOPES: Joi.string().optional(),
        JWT_SECRET: Joi.string().default('dev-secret'),
        JWT_EXPIRES_IN: Joi.string().default('15m'),
        DELHIVERY_TOKEN: Joi.string().optional(),
        REDIS_URL: Joi.string().uri().optional(),
        XPRESSBEES_TOKEN: Joi.string().optional(),
        STRIPE_SECRET_KEY: Joi.string().optional(),
        STRIPE_WEBHOOK_SECRET: Joi.string().optional(),
        RAZORPAY_KEY_ID: Joi.string().optional(),
        RAZORPAY_KEY_SECRET: Joi.string().optional(),
        RAZORPAY_WEBHOOK_SECRET: Joi.string().optional(),
        PAYMENT_DEFAULT_GATEWAY: Joi.string().valid('STRIPE', 'RAZORPAY').optional(),
        SENDGRID_API_KEY: Joi.string().optional(),
        SMTP_HOST: Joi.string().optional(),
        SMTP_PORT: Joi.number().optional(),
        SMTP_USER: Joi.string().optional(),
        SMTP_PASSWORD: Joi.string().optional(),
        EMAIL_FROM: Joi.string().email().optional(),
        EMAIL_FROM_NAME: Joi.string().optional(),
        APP_URL: Joi.string().uri().optional(),
        GSTN_API_URL: Joi.string().uri().optional(),
        GSTN_API_KEY: Joi.string().optional(),
        GSTN_CLIENT_ID: Joi.string().optional(),
        GSTN_CLIENT_SECRET: Joi.string().optional(),
        GSTN_SIGNATURE_SECRET: Joi.string().optional(),
        GSTN_RETRY_ATTEMPTS: Joi.number().optional(),
        STORAGE_DRIVER: Joi.string().valid('s3', 'stub').optional(),
        S3_BUCKET: Joi.string().optional(),
        S3_REGION: Joi.string().optional(),
        S3_ENDPOINT: Joi.string().optional(),
        S3_ACCESS_KEY_ID: Joi.string().optional(),
        S3_SECRET_ACCESS_KEY: Joi.string().optional(),
        S3_FORCE_PATH_STYLE: Joi.string().optional(),
        // SS-028 — observability env vars. Optional; features are no-ops
        // when the relevant var is unset.
        SENTRY_DSN: Joi.string().optional(),
        SENTRY_RELEASE: Joi.string().optional(),
        OTEL_EXPORTER_OTLP_ENDPOINT: Joi.string().uri().optional(),
        OTEL_SERVICE_NAME: Joi.string().optional(),
        // SS-026: per-tenant encryption key for channel connection credentials.
        // Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
        CHANNEL_ENCRYPTION_KEY: Joi.string().min(16).optional(),
      }),
    }),
    // Per-tenant throttler (SS-003b). Replaces the previous global
    // 120/min in-memory ThrottlerModule. The platform throttler lib wires
    // `PostgresThrottlerStorage` as the storage (so limits hold across
    // API instances) and `TenantThrottlerGuard` picks the bucket size
    // per tenant tier (Starter 60/min, Growth 300/min, Pro 1000/min,
    // Enterprise 10000/min) at request time.
    PlatformThrottlerModule,
    // Apollo code-first GraphQL wired directly (the platform/graphql lib
    // ships a shared `graphQLConfig` object, not a module).
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'apps/api/src/schema.graphql'),
      playground: process.env.NODE_ENV !== 'production',
      context: ({ req }: any) => ({ req }),
    }),

    // Domain
    OrdersLibModule,
    ShipmentsLibModule,
    WarehousesLibModule,
    BillingLibModule,
    UsersLibModule,
    RolesLibModule,
    CodLibModule,
    NdrLibModule,
    ManifestsLibModule,
    PickupsLibModule,
    AuthLibModule,
    QueuesModule,
    PlatformCarriersModule,
    RateCacheModule,
    ObservabilityModule,
    TenantModule,
    RateShopPublicModule,
    // SS-031: KYC (PAN + GSTIN + bank) with BullMQ async verify.
    KycModule,
    // SS-032: GST invoicing + E-way bill generation.
    GstModule,
    // SS-033: COD remittance + bank reconciliation + dispute queue.
    CodRemittanceModule,
    // SS-026: channel-agnostic sync stack — connections, GraphQL, BullMQ.
    ChannelSyncModule,
  ],
  controllers: [AppController, HealthController, MetricsController],
  providers: [
    AppService,
    AppResolver,
    // SS-003b: per-tenant throttler guard. Reads `req.tenantId` set by
    // TenantMiddleware (or the request-scoped TenantContext) and applies
    // the per-tier bucket. Replaces the previous IP-based `ThrottlerGuard`
    // which used an in-memory store.
    { provide: APP_GUARD, useClass: TenantThrottlerGuard },
    // SS-028 — global exception filter. Captures 5xx to Sentry (no-op when
    // SENTRY_DSN is unset); leaves 4xx alone.
    { provide: APP_FILTER, useClass: SentryExceptionFilter },
    // SS-028 — global GraphQL interceptors. Order matters:
    //   1. SentryGraphqlInterceptor — enriches scope with tenant/user tags
    //      BEFORE the audit interceptor writes the row (so the breadcrumb
    //      is in place if captureException fires).
    //   2. AuditInterceptor — reads @Auditable() metadata and writes
    //      one audit_logs row per decorated mutation.
    { provide: APP_INTERCEPTOR, useClass: SentryGraphqlInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements NestModule, OnModuleInit {
  /**
   * SS-002c: bind the shim's per-request tenantId to whatever the
   * TenantMiddleware (already wired in `TenantModule#configure`) puts on
   * the request. The TenantContextMiddleware runs *after* it.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }

  /**
   * SS-002c / SS-044: tell the tenant-context helper how to read a tenantId
   * from the active request when the ALS slot isn't already populated.
   * This is the fallback used by worker / cron contexts that never had a
   * request to bind to. The PrismaCompat shim that previously owned this
   * was removed in SS-044; the helpers are now in `tenant-context.helpers.ts`.
   */
  onModuleInit(): void {
    configureTenantContext({
      getTenantId: () => {
        // The request middleware populates `als` directly. This callback
        // is the safety-net for code paths outside of HTTP (e.g. a worker
        // that processes a single read). In those contexts there is no
        // `req` to read from — returning undefined forces the helper to
        // fall through to whatever the caller has already bound.
        return undefined;
      },
    });
  }
}
