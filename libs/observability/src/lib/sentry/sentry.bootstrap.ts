/**
 * SS-028 — Sentry bootstrap.
 *
 * Thin wrapper over `@sentry/node` that:
 *  - is a complete no-op when `SENTRY_DSN` is unset,
 *  - sets `environment`, `release`, and a 10% trace sample rate,
 *  - tags every event with the swiftship service name,
 *  - hooks the global error handlers.
 *
 * Called from `apps/api/src/main.ts` BEFORE `NestFactory.create` so
 * that any constructor-time throw is captured.
 *
 * The actual SDK is loaded lazily via `require()` so the
 * observability lib does not have a hard runtime dep on
 * `@sentry/node`; if the package is not installed (e.g. while
 * developing the observability lib in isolation), `init()` is still
 * a safe no-op and `captureException(...)` is a safe no-op.
 */
let _initialized = false;
let _enabled = false;

export interface SentryInitOptions {
  dsn?: string;
  environment?: string;
  release?: string;
  serviceName?: string;
  tracesSampleRate?: number;
}

export function initSentry(opts: SentryInitOptions): boolean {
  if (_initialized) return _enabled;
  _initialized = true;
  const dsn = opts.dsn ?? process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('[sentry] SENTRY_DSN unset; Sentry is a no-op');
    return false;
  }

  // Lazy require so the @sentry/node dep is optional at the
  // observability lib's package.json. If the package is missing,
  // fall back to a no-op (we still keep the env var documented so
  // ops know what to set).
  let Sentry: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Sentry = require('@sentry/node');
  } catch {
    console.warn(
      '[sentry] @sentry/node not installed; Sentry is a no-op even though SENTRY_DSN is set',
    );
    return false;
  }

  Sentry.init({
    dsn,
    environment: opts.environment ?? process.env.NODE_ENV ?? 'development',
    release: opts.release ?? process.env.SENTRY_RELEASE ?? undefined,
    tracesSampleRate: opts.tracesSampleRate ?? 0.1,
    initialScope: {
      tags: {
        service:
          opts.serviceName ?? process.env.OTEL_SERVICE_NAME ?? 'swiftship-api',
      },
    },
  });
  _enabled = true;

  console.log('[sentry] initialized for service swiftship-api');
  return true;
}

export function isSentryEnabled(): boolean {
  return _enabled;
}

export function captureException(
  err: unknown,
  extra?: Record<string, any>,
): void {
  if (!_enabled) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry: any = require('@sentry/node');
    Sentry.captureException(err, { extra });
  } catch {
    /* swallow */
  }
}

export function setSentryTag(
  key: string,
  value: string | number | boolean,
): void {
  if (!_enabled) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry: any = require('@sentry/node');
    Sentry.setTag(key, value);
  } catch {
    /* swallow */
  }
}

export function setSentryContext(key: string, ctx: Record<string, any>): void {
  if (!_enabled) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry: any = require('@sentry/node');
    Sentry.setContext(key, ctx);
  } catch {
    /* swallow */
  }
}

export function addSentryBreadcrumb(b: Record<string, any>): void {
  if (!_enabled) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry: any = require('@sentry/node');
    Sentry.addBreadcrumb(b);
  } catch {
    /* swallow */
  }
}
