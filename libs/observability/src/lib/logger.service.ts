import { Injectable, Scope, ConsoleLogger, LoggerService } from '@nestjs/common';
import {
  getCorrelationContext,
  runWithCorrelation,
  withCorrelationId,
} from './correlation/context';
import type { AuditEvent } from './audit/audit-log.types';

/**
 * Structured JSON logger.
 *
 * The default Nest ConsoleLogger writes `[Nest] <level> <msg>` to stdout,
 * which is hard to parse in Loki/Datadog. `StructuredLogger` emits one JSON
 * line per log record so a sidecar (Vector, Promtail) can ship it directly.
 *
 * SS-028 — every log line now also carries `correlationId`, `traceId`,
 * `spanId`, `tenantId`, and `userId` whenever they are present in the
 * active AsyncLocalStorage scope. This is what makes "follow a request
 * from HTTP entry to a BullMQ worker" possible: the same id is set in
 * `CorrelationIdMiddleware` and re-established in the worker wrapper,
 * so a single grep `{correlationId="..."}` returns every line.
 *
 * The JSON shape is fixed: keep the field names short and stable so
 * downstream pipelines (Vector, Promtail, Loki, OTel log appender) can
 * parse without a per-line schema check.
 */
export interface StructuredLogFields {
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  tenantId?: number | string;
  userId?: number | string;
  [k: string]: any;
}

@Injectable({ scope: Scope.DEFAULT })
export class StructuredLogger extends ConsoleLogger implements LoggerService {
  private readonly isProd = process.env.NODE_ENV === 'production';

  log(message: any, context?: string) {
    this.emit('log', message, context);
  }
  error(message: any, trace?: string, context?: string) {
    this.emit('error', message, context, trace);
  }
  warn(message: any, context?: string) {
    this.emit('warn', message, context);
  }
  debug(message: any, context?: string) {
    if (this.isProd) return;
    this.emit('debug', message, context);
  }
  verbose(message: any, context?: string) {
    if (this.isProd) return;
    this.emit('verbose', message, context);
  }

  // ---- NestJS expects a fatal() on LoggerService (added in v9) ---------
  fatal(message: any, context?: string) {
    this.emit('fatal', message, context);
  }

  private emit(level: string, message: any, context?: string, trace?: string) {
    const correlation = (getCorrelationContext() ?? {}) as {
      correlationId?: string;
      traceId?: string;
      spanId?: string;
      tenantId?: number | string;
      userId?: number | string;
    };
    const record: Record<string, any> = {
      ts: new Date().toISOString(),
      level,
      context: context ?? 'app',
      msg: typeof message === 'string' ? message : safeStringify(message),
      pid: process.pid,
    };
    if (correlation.correlationId) record.correlationId = correlation.correlationId;
    if (correlation.traceId) record.traceId = correlation.traceId;
    if (correlation.spanId) record.spanId = correlation.spanId;
    if (correlation.tenantId !== undefined) record.tenantId = correlation.tenantId;
    if (correlation.userId !== undefined) record.userId = correlation.userId;
    if (trace) record.trace = trace;

    const out = JSON.stringify(record);
    if (level === 'error' || level === 'fatal') {
      // eslint-disable-next-line no-console
      console.error(out);
    } else if (level === 'warn') {
      // eslint-disable-next-line no-console
      console.error(out);
    } else {
      // eslint-disable-next-line no-console
      console.log(out);
    }
  }

  // ---- helper methods used widely in services
  info(event: string, data?: Record<string, any>, context?: string) {
    this.emit('info', { event, ...(data ?? {}) }, context);
  }
  metric(name: string, value: number, tags?: Record<string, string | number>) {
    this.emit('metric', { event: 'metric', name, value, tags });
  }

  /**
   * SS-028 — write a structured audit log line. The persistent record is
   * also written to the `audit_logs` table by `AuditLogService.record(...)`;
   * the logger side-effect exists so audit events show up in Loki/Grafana
   * alongside the rest of the request timeline.
   */
  logAudit(event: AuditEvent, context = 'audit') {
    this.emit('info', { event: 'audit', ...event }, context);
  }

  /**
   * SS-028 — run `fn` inside an ALS frame seeded with the given correlation
   * id. Useful for BullMQ workers, cron jobs, and ad-hoc background tasks
   * that need their log lines correlated with the original HTTP request.
   */
  withCorrelationId<T>(id: string, fn: () => T | Promise<T>): T | Promise<T> {
    return withCorrelationId(id, fn);
  }

  /**
   * SS-028 — run `fn` inside an ALS frame seeded with the active OTel trace
   * context (`traceId` + `spanId`) so the next log line carries them.
   * No-op when OTel is not initialised.
   */
  withTraceContext<T>(
    trace: { traceId: string; spanId: string },
    fn: () => T | Promise<T>,
  ): T | Promise<T> {
    return runWithCorrelation({ traceId: trace.traceId, spanId: trace.spanId }, fn);
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
