import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import * as morgan from 'morgan';
import * as bodyParser from 'body-parser';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { StructuredLogger } from '../../libs/observability/src/lib/logger.service';

/**
 * SwiftShip AI — API bootstrap.
 *
 * Reads PORT, CORS_ORIGIN, NODE_ENV from env. Registers a raw-body parser
 * on `/shopify/webhook` for HMAC verification (see e-commerce integrations
 * Shopify controller). Installs helmet, CORS, and a global ValidationPipe
 * with whitelist+transform to strip unknown fields and coerce primitives.
 */
async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);

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
