import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Observable, catchError, throwError } from 'rxjs';
import {
  addSentryBreadcrumb,
  captureException,
  isSentryEnabled,
  setSentryContext,
  setSentryTag,
} from './sentry.bootstrap';
import { getCorrelationContext } from '../correlation/context';

/**
 * SS-028 — SentryGraphqlInterceptor.
 *
 * Registered as a global GraphQL interceptor in `apps/api/src/app.module.ts`.
 * For every resolver call:
 *  - sets the current correlation id as the Sentry `transaction` tag,
 *  - sets tenant.id / tenant.slug / user.id from the GraphQL context,
 *  - adds a breadcrumb with the resolver field name.
 *
 * On error (4xx or 5xx), the error is rethrown — capturing is the
 * job of `SentryExceptionFilter`, which decides 4xx-vs-5xx and
 * rate-limits accordingly. This interceptor just enriches the
 * per-request scope.
 */
@Injectable()
export class SentryGraphqlInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (!isSentryEnabled()) return next.handle();
    const gql = GqlExecutionContext.create(context);
    const info = gql.getInfo();
    const ctx = gql.getContext();
    const req = ctx?.req;
    const correlation = getCorrelationContext();

    if (correlation?.correlationId) {
      setSentryTag('correlationId', correlation.correlationId);
    }
    if (correlation?.traceId) {
      setSentryTag('traceId', correlation.traceId);
    }
    const tenantId = req?.tenantId ?? correlation?.tenantId;
    if (tenantId !== undefined) setSentryTag('tenant.id', String(tenantId));
    if (req?.tenant?.slug) setSentryTag('tenant.slug', String(req.tenant.slug));
    if (req?.user?.id) setSentryTag('user.id', String(req.user.id));

    setSentryContext('resolver', {
      fieldName: info?.fieldName,
      parentType: info?.parentType?.name,
    });
    addSentryBreadcrumb({
      category: 'graphql',
      message: `${info?.parentType?.name ?? ''}.${info?.fieldName ?? ''}`,
      level: 'info',
    });

    return next.handle().pipe(
      catchError((err) => {
        // Filtering decision (4xx vs 5xx) lives in SentryExceptionFilter;
        // here we just attach the resolver metadata so the filter has
        // everything it needs without re-deriving it.
        setSentryContext('error.resolver', {
          fieldName: info?.fieldName,
          parentType: info?.parentType?.name,
        });
        // Pre-tag for filtering; the filter will decide whether to capture.
        try {
          const status = (err && (err.status || err.statusCode)) ?? undefined;
          setSentryTag('http.status_code', String(status ?? 0));
        } catch {
          /* ignore */
        }
        return throwError(() => err);
      }),
    );
  }
}
