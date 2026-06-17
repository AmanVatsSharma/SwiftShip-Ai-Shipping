import { Global, Module } from '@nestjs/common';
import { SentryGraphqlInterceptor } from './sentry.interceptor';
import { SentryExceptionFilter } from './sentry-exception.filter';

/**
 * SS-028 — SentryModule.
 *
 * Provides the GraphQL interceptor and the global exception filter.
 * The bootstrap call (`initSentry({...})`) must be invoked from
 * `apps/api/src/main.ts` BEFORE `NestFactory.create` so that
 * constructor-time throws are captured.
 *
 * When `SENTRY_DSN` is unset, both the interceptor and the filter
 * are no-ops — see `sentry.bootstrap.ts`.
 */
@Global()
@Module({
  providers: [SentryGraphqlInterceptor, SentryExceptionFilter],
  exports: [SentryGraphqlInterceptor, SentryExceptionFilter],
})
export class SentryModule {}
