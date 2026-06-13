import { Injectable, LoggerService, Scope, ConsoleLogger } from '@nestjs/common';

/**
 * Structured JSON logger.
 *
 * The default Nest ConsoleLogger writes `[Nest] <level> <msg>` to stdout,
 * which is hard to parse in Loki/Datadog. `StructuredLogger` emits one JSON
 * line per log record so a sidecar (Vector, Promtail) can ship it directly.
 *
 * Use:
 *   constructor(private readonly log: StructuredLogger) {}
 *   this.log.info('order.created', { orderId: 42 });
 */
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

  private emit(level: string, message: any, context?: string, trace?: string) {
    const record = {
      ts: new Date().toISOString(),
      level,
      context: context ?? 'app',
      msg: typeof message === 'string' ? message : JSON.stringify(message),
      trace,
      pid: process.pid,
    };
    if (level === 'error' || level === 'warn') {
      // eslint-disable-next-line no-console
      console.error(JSON.stringify(record));
    } else {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(record));
    }
  }

  // ---- helper methods used widely in services
  info(event: string, data?: Record<string, any>, context?: string) {
    this.emit('info', { event, ...data }, context);
  }
  metric(name: string, value: number, tags?: Record<string, string | number>) {
    this.emit('metric', { event: 'metric', name, value, tags });
  }
}
