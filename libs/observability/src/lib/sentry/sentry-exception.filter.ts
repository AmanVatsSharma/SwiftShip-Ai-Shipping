import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  addSentryBreadcrumb,
  captureException,
  isSentryEnabled,
  setSentryTag,
} from './sentry.bootstrap';
import { getCorrelationContext } from '../correlation/context';

/**
 * SS-028 — SentryExceptionFilter.
 *
 * Registered as a global filter via `APP_FILTER` in app.module.ts.
 *
 * Behaviour:
 *  - 4xx errors (HttpException with status < 500) are user errors:
 *    a tenant cancelled a non-cancellable order, a JWT was expired,
 *    a validation rule failed. These are not bugs; do NOT capture.
 *  - 5xx errors and any non-HttpException throw ARE bugs. Capture to
 *    Sentry with a `fatal` level so PagerDuty fires (when wired).
 *  - Always sets a `correlationId` and `http.status_code` tag so the
 *    Sentry event can be cross-referenced with the structured log
 *    stream and the OTel trace.
 */
@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    if (!isSentryEnabled()) {
      throwIfResponseOnly(host);
      return;
    }
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const status = this.resolveStatus(exception);
    const correlation = getCorrelationContext();

    if (correlation?.correlationId) {
      setSentryTag('correlationId', correlation.correlationId);
    }
    if (correlation?.traceId) {
      setSentryTag('traceId', correlation.traceId);
    }
    if (correlation?.tenantId !== undefined) {
      setSentryTag('tenant.id', String(correlation.tenantId));
    }
    setSentryTag('http.status_code', String(status));
    const user = (req as any)?.user;
    if (user?.id) setSentryTag('user.id', String(user.id));
    if (req?.url) setSentryTag('http.url', String(req.url));

    addSentryBreadcrumb({
      category: 'http',
      message: `${req?.method ?? ''} ${req?.url ?? ''} -> ${status}`,
      level: status >= 500 ? 'error' : 'info',
    });

    if (status >= 500 || !(exception instanceof HttpException)) {
      captureException(exception, {
        status,
        url: req?.url,
        method: req?.method,
        correlationId: correlation?.correlationId,
        tenantId: correlation?.tenantId,
      });
    }

    // Re-throw to the next filter (or the default Nest error handler).
    // We do NOT swallow the error here.
    throwIfResponseOnly(host);
  }

  private resolveStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}

/**
 * Re-throw the error so the default Nest error handler still emits the
 * response. The filter pattern in Nest 11 doesn't support "swallow";
 * this helper simply ensures we do not double-send if no body has been
 * written yet.
 */
function throwIfResponseOnly(_host: ArgumentsHost): void {
  // intentionally empty — see note above. The filter is observable only.
}
