import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { AppController } from './app.controller';
import { HealthController } from './health.controller';
import { AppService } from './app.service';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { AppResolver } from './app.resolver';
import { TypeormModule } from '../libs/platform/typeorm/src/lib/typeorm.module';
import { PrismaService } from './prisma/prisma.service';
import { OrdersModule } from './orders/orders.module';
import { CarriersModule } from './carriers/carriers.module';
import { ShippingRatesModule } from './shipping-rates/shipping-rates.module';
import { ShipmentsModule } from './shipments/shipments.module';
import { ReturnsModule } from './returns/returns.module';
import { PluginsModule } from './plugins/plugins.module';
import { RolesModule } from './users/roles.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { PickupsModule } from './pickups/pickups.module';
import { ManifestsModule } from './manifests/manifests.module';
import { NdrModule } from './ndr/ndr.module';
import { CodModule } from './cod/cod.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { RateShopModule } from './rate-shop/rate-shop.module';
import { ServiceabilityModule } from './serviceability/serviceability.module';
import { SurchargesModule } from './surcharges/surcharges.module';
import { QueuesModule } from './queues/queues.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PaymentsModule } from './payments/payments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { BillingModule } from './billing/billing.module';
import { BulkOperationsModule } from './bulk-operations/bulk-operations.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    TypeormModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'test', 'production')
          .default('development'),
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
        PAYMENT_DEFAULT_GATEWAY: Joi.string()
          .valid('STRIPE', 'RAZORPAY')
          .optional(),
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
      }),
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.graphql'),
      playground: process.env.NODE_ENV !== 'production',
      context: ({ req }) => ({ req }),
    }),
    OrdersModule,
    CarriersModule,
    ShippingRatesModule,
    ShipmentsModule,
    ReturnsModule,
    PluginsModule,
    RolesModule,
    AuthModule,
    OnboardingModule,
    PickupsModule,
    ManifestsModule,
    NdrModule,
    CodModule,
    WebhooksModule,
    RateShopModule,
    ServiceabilityModule,
    SurchargesModule,
    QueuesModule,
    DashboardModule,
    PaymentsModule,
    NotificationsModule,
    BillingModule,
    BulkOperationsModule,
    WarehousesModule,
    StorageModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    AppResolver,
    PrismaService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
