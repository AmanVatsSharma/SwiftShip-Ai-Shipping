/**
 * SS-028 — OpenTelemetry bootstrap.
 *
 * Mirrors the Sentry bootstrap pattern: thin wrapper that is a no-op
 * when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset.
 *
 * Lazy-loads the OTel SDK packages so the observability lib does not
 * have a hard runtime dep on `@opentelemetry/sdk-node` etc. If the
 * packages are not installed, `initOtel()` is a safe no-op and the
 * `withSpan(...)` / `getCurrentTraceId()` helpers return undefined.
 *
 * Resource attributes (the OTel "who am I" envelope) follow the
 * semantic conventions for a web service:
 *
 *   service.name        = "swiftship-api"
 *   service.namespace   = "swiftship"
 *   service.version     = package.json version or "dev"
 *   deployment.environment = NODE_ENV
 *   process.pid, host.name
 *
 * Auto-instrumented libraries (registered via `getNodeAutoInstrumentations`):
 *   - @opentelemetry/instrumentation-http   (Express middleware)
 *   - @opentelemetry/instrumentation-express (route handlers)
 *   - @opentelemetry/instrumentation-graphql (Apollo)
 *   - @opentelemetry/instrumentation-typeorm (Repository<>.find/save)
 *   - @opentelemetry/instrumentation-bullmq  (Queue.add, Worker.process)
 *   - @opentelemetry/instrumentation-nestjs-core (provider init)
 *   - @opentelemetry/instrumentation-ioredis (Redis I/O)
 *   - @opentelemetry/instrumentation-pg      (raw pg queries)
 *
 * Span export uses OTLP/HTTP to the configured endpoint with the
 * `BatchSpanProcessor` (5s flush, 512 max queue, 2048 max export).
 */
let _initialized = false;
let _enabled = false;

export interface OtelInitOptions {
  endpoint?: string;
  serviceName?: string;
  serviceVersion?: string;
  environment?: string;
}

export function initOtel(opts: OtelInitOptions = {}): boolean {
  if (_initialized) return _enabled;
  _initialized = true;

  const endpoint =
    opts.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? '';
  if (!endpoint) {
    console.log(
      '[otel] OTEL_EXPORTER_OTLP_ENDPOINT unset; OpenTelemetry is a no-op',
    );
    return false;
  }

  let sdk: any;
  let resources: any;
  let exporter: any;
  let processor: any;
  let instrumentations: any;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sdk = require('@opentelemetry/sdk-node');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    resources = require('@opentelemetry/resources');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    exporter = require('@opentelemetry/exporter-trace-otlp-http');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    processor = require('@opentelemetry/sdk-trace-base');
  } catch {
    console.warn(
      '[otel] OpenTelemetry SDK packages not installed; OTel is a no-op',
    );
    return false;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    instrumentations = require('@opentelemetry/auto-instrumentations-node');
  } catch {
    instrumentations = { getNodeAutoInstrumentations: () => [] };
  }

  const NodeSDK = sdk.NodeSDK;
  const OTLPTraceExporter = exporter.OTLPTraceExporter;
  const BatchSpanProcessor = processor.BatchSpanProcessor;

  const traceExporter = new OTLPTraceExporter({
    url: `${endpoint.replace(/\/$/, '')}/v1/traces`,
  });

  const resource = new resources.Resource({
    'service.name':
      opts.serviceName ?? process.env.OTEL_SERVICE_NAME ?? 'swiftship-api',
    'service.namespace': 'swiftship',
    'service.version':
      opts.serviceVersion ?? process.env.npm_package_version ?? 'dev',
    'deployment.environment':
      opts.environment ?? process.env.NODE_ENV ?? 'development',
    'process.pid': process.pid,
    'host.name': process.env.HOSTNAME ?? require('os').hostname(),
  });

  const otel = new NodeSDK({
    resource,
    traceExporter,
    spanProcessor: new BatchSpanProcessor(traceExporter, {
      maxQueueSize: 2048,
      maxExportBatchSize: 512,
      scheduledDelayMillis: 5000,
    }),
    instrumentations: instrumentations.getNodeAutoInstrumentations({
      // Disable filesystem instrumentation by default — too chatty.
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  });

  try {
    otel.start();
    _enabled = true;

    console.log(
      `[otel] initialized: service=swiftship-api endpoint=${endpoint}`,
    );

    // Best-effort shutdown so spans are flushed on SIGTERM.
    const shutdown = async () => {
      try {
        await otel.shutdown();
      } catch {
        /* ignore */
      }
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  } catch (err) {
    console.warn('[otel] failed to start:', (err as Error).message);
    return false;
  }

  return true;
}

export function isOtelEnabled(): boolean {
  return _enabled;
}

/** Best-effort current trace id (24 hex chars), or undefined if no active span. */
export function getCurrentTraceId(): string | undefined {
  if (!_enabled) return undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const trace: any = require('@opentelemetry/api');
    const span = trace?.trace?.getActiveSpan?.();
    return span?.spanContext?.()?.traceId;
  } catch {
    return undefined;
  }
}

/** Best-effort current span id (16 hex chars), or undefined if no active span. */
export function getCurrentSpanId(): string | undefined {
  if (!_enabled) return undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const trace: any = require('@opentelemetry/api');
    const span = trace?.trace?.getActiveSpan?.();
    return span?.spanContext?.()?.spanId;
  } catch {
    return undefined;
  }
}
