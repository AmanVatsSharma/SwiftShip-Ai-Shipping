import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { isOtelEnabled } from './otel.bootstrap';
import {
  runWithCorrelation,
  getCorrelationContext,
} from '../correlation/context';

type Correlation = {
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  tenantId?: number | string;
  userId?: number | string;
};

/**
 * SS-028 — TraceMiddleware.
 *
 * Reads the W3C `traceparent` header from incoming HTTP requests,
 * starts a server span, and stores the traceId / spanId in the
 * AsyncLocalStorage slot so log lines and Sentry breadcrumbs pick
 * them up automatically.
 *
 * No-op when OpenTelemetry is not enabled (i.e. when
 * `OTEL_EXPORTER_OTLP_ENDPOINT` is unset). The correlation-id
 * middleware in front of this one will still populate the
 * `correlationId` ALS field.
 */
@Injectable()
export class TraceMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    if (!isOtelEnabled()) return next();
    try {
      // Lazy require so we don't have a hard dep on @opentelemetry/api.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const traceApi: any = require('@opentelemetry/api');
      const { trace, context, propagation, SpanKind, SpanStatusCode } =
        traceApi;
      const tracer = trace.getTracer('swiftship-http');

      const existing = (getCorrelationContext() ?? {}) as Correlation;
      const parentCtx = propagation.extract(context.active(), {
        traceparent: this.headerString(req.headers['traceparent']),
        tracestate: this.headerString(req.headers['tracestate']),
        baggage: this.headerString(req.headers['baggage']),
      });

      const span = tracer.startSpan(
        `HTTP ${req.method} ${req.path || req.url}`,
        {
          kind: SpanKind?.SERVER ?? 1,
          attributes: {
            'http.method': req.method,
            'http.target': req.path || req.url,
            'http.scheme': (req.protocol || 'http').toUpperCase(),
            'http.host': req.headers.host ?? '',
            'http.user_agent': req.headers['user-agent'] ?? '',
          },
        },
        parentCtx,
      );

      res.on('finish', () => {
        try {
          span.setAttribute('http.status_code', res.statusCode);
          if (res.statusCode >= 500) {
            span.setStatus?.({ code: SpanStatusCode?.ERROR ?? 2 });
          } else {
            span.setStatus?.({ code: SpanStatusCode?.OK ?? 1 });
          }
        } catch {
          /* ignore */
        } finally {
          span.end?.();
        }
      });

      const ctxWithSpan = trace.setSpan(parentCtx, span);
      const spanCtx = span.spanContext?.() ?? {};
      const correlationId = existing.correlationId ?? 'no-correlation-id';
      context.with(ctxWithSpan, () => {
        runWithCorrelation(
          {
            correlationId,
            traceId: spanCtx.traceId ?? existing.traceId,
            spanId: spanCtx.spanId ?? existing.spanId,
            tenantId: existing.tenantId,
            userId: existing.userId,
          },
          () => next(),
        );
      });
    } catch {
      // OTel failed; never block the request.
      next();
    }
  }

  private headerString(
    value: string | string[] | undefined,
  ): string | undefined {
    if (Array.isArray(value)) return value[0];
    return value;
  }
}
