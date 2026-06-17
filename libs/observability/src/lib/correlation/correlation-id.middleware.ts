import {
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import {
  correlationStorage,
  runWithCorrelation,
} from './context';

/**
 * SS-028 — CorrelationIdMiddleware.
 *
 * Reads `X-Request-Id` (preferred) or `X-Correlation-Id` from the incoming
 * request. If neither is set, mints a fresh UUIDv4. The id is then:
 *
 *  1. Attached to `req.correlationId` so handlers / resolvers can read it.
 *  2. Stored in AsyncLocalStorage so `StructuredLogger`, Sentry breadcrumbs
 *     and any downstream service can pick it up without explicit threading.
 *  3. Echoed back in the response as `X-Request-Id`.
 *
 * Mounted in `apps/api/src/main.ts` BEFORE helmet / cors / the raw body
 * parser so EVERY response — including CORS preflight rejections and
 * Shopify webhook HMAC rejections — carries the header.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = this.pickHeader(
      req.headers['x-request-id'] ?? req.headers['x-correlation-id'],
    );
    const correlationId = this.sanitize(incoming) ?? randomUUID();

    // Expose on the request for handlers that want to read it directly.
    (req as any).correlationId = correlationId;
    res.setHeader('X-Request-Id', correlationId);

    // Bind into ALS so loggers + Sentry breadcrumbs see it for the
    // duration of the request (incl. async resolvers).
    runWithCorrelation({ correlationId }, () => next());
  }

  private pickHeader(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) return value[0];
    return value;
  }

  /** Reject obviously-hostile header values (CR/LF injection, huge strings). */
  private sanitize(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > 128) return undefined;
    if (/[\r\n\t]/.test(trimmed)) return undefined;
    return trimmed;
  }
}

/**
 * Read the correlation id that an HTTP middleware placed on the request.
 * Used by GraphQL resolvers and worker wrappers to propagate the id from
 * the inbound job data.
 */
export function readCorrelationIdFromJob(
  data: Record<string, any> | undefined,
): string | undefined {
  return data?.correlationId;
}
