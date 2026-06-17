import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import * as morgan from 'morgan';
import * as bodyParser from 'body-parser';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { StructuredLogger } from '../../libs/observability/src/lib/logger.service';

// SS-028 — Sentry + OpenTelemetry bootstraps. MUST run BEFORE
// NestFactory.create so that any constructor-time throw is captured
// and so the OTel auto-instrumentation hooks can patch the HTTP /
// TypeORM / BullMQ libraries that NestJS will load.
import { initSentry } from '../../libs/observability/src/lib/sentry/sentry.bootstrap';
import { initOtel } from '../../libs/observability/src/lib/otel/otel.bootstrap';
import { CorrelationIdMiddleware } from '../../libs/observability/src/lib/correlation/correlation-id.middleware';

initSentry({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE,
  serviceName: process.env.OTEL_SERVICE_NAME ?? 'swiftship-api',
});

initOtel({
  endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  serviceName: process.env.OTEL_SERVICE_NAME ?? 'swiftship-api',
  serviceVersion: process.env.npm_package_version,
  environment: process.env.NODE_ENV,
});

/**
 * SwiftShip AI — API bootstrap.
 *
 * Reads PORT, CORS_ORIGIN, NODE_ENV from env. Registers a raw-body parser
 * on `/shopify/webhook` for HMAC verification (see e-commerce integrations
 * Shopify controller). Installs helmet, CORS, and a global ValidationPipe
 * with whitelist+transform to strip unknown fields and coerce primitives.
 *
 * SS-028 — also wires the correlation-id middleware as the FIRST
 * Express middleware so every request (including CORS preflight and
 * /metrics scrapes) carries an `X-Request-Id` header.
 */
async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  app.useLogger(new StructuredLogger());
  const config = app.get(ConfigService);

  // SS-028 — install CorrelationIdMiddleware as the first Express
  // middleware. We do it via `app.use(...)` rather than the
  // NestMiddleware interface because we need it to run BEFORE helmet
  // and CORS so even rejected preflight requests echo the header.
  const expressApp = app.getHttpAdapter().getInstance() as import('express').Express;
  expressApp.use((req, res, next) =>
    new CorrelationIdMiddleware().use(req as any, res as any, next),
  );

  // security
  app.use(helmet({ contentSecurityPolicy: false }));
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN')?.split(',') ?? true,
    credentials: true,
  });

  // raw body for Shopify webhook HMAC verification
  app.use(
    '/shopify/webhook',
    bodyParser.raw({ type: '*/*', limit: '5mb' }),
  );

  // logs
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  // validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // graceful shutdown
  app.enableShutdownHooks();

  const port = Number(config.get<string>('PORT') ?? 3000);
  await app.listen(port);
  logger.log(`SwiftShip API listening on http://localhost:${port}`);
  logger.log(`GraphQL at http://localhost:${port}/graphql`);
}

bootstrap();
