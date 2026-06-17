import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * SS-028 — AsyncLocalStorage-backed correlation context.
 *
 * Every incoming HTTP request gets a `correlationId` (from the
 * `X-Request-Id` / `X-Correlation-Id` header, otherwise a fresh UUIDv4).
 * The id is stored both on the response object (echoed back in the
 * `X-Request-Id` header) and in an `AsyncLocalStorage` slot so log
 * lines, Sentry breadcrumbs, BullMQ worker job runs, etc. can pick it
 * up without it being threaded through every function call.
 *
 * BullMQ workers re-establish this context by reading the id from the
 * job's data envelope (`{ correlationId, ... }`) and wrapping the
 * processor in `withCorrelationId(...)`.
 */
export interface CorrelationStore {
  correlationId: string;
  traceId?: string;
  spanId?: string;
  tenantId?: number | string;
  userId?: number | string;
}

export const correlationStorage = new AsyncLocalStorage<CorrelationStore>();

/** Returns the active correlation context, or `undefined` outside an ALS scope. */
export function getCorrelationContext(): CorrelationStore | undefined {
  return correlationStorage.getStore();
}

/** Returns the correlation id for the current ALS scope, or `undefined`. */
export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore()?.correlationId;
}

/** Returns the active trace id (from OTel) for the current ALS scope, or `undefined`. */
export function getTraceId(): string | undefined {
  return correlationStorage.getStore()?.traceId;
}

/** Returns the active span id (from OTel) for the current ALS scope, or `undefined`. */
export function getSpanId(): string | undefined {
  return correlationStorage.getStore()?.spanId;
}

/** Returns the active tenant id, or `undefined`. */
export function getTenantIdFromContext(): number | string | undefined {
  return correlationStorage.getStore()?.tenantId;
}

/**
 * Run `fn` inside an ALS scope seeded with `store`. The store is merged
 * with any parent context so fields like `tenantId` and `userId` survive
 * nested calls (a BullMQ worker wrapped on top of an HTTP request keeps
 * both the inbound correlation id AND the resolved tenant id). The store
 * is inherited by every synchronous + awaited call inside `fn`, so log
 * lines and Sentry breadcrumbs pick the correlation id up automatically.
 */
export function runWithCorrelation<T>(
  store: Partial<CorrelationStore>,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  const parent = correlationStorage.getStore();
  const merged: CorrelationStore = {
    ...(parent ?? {}),
    ...store,
  } as CorrelationStore;
  // correlationId is required by the type, but if the caller didn't pass
  // one we fall back to the parent's id (or a freshly-minted uuid).
  if (!merged.correlationId) {
    merged.correlationId = parent?.correlationId ?? 'no-correlation';
  }
  return correlationStorage.run(merged, fn);
}

/**
 * Convenience for callers that only have a correlation id (BullMQ workers,
 * cron jobs, ad-hoc background tasks). Equivalent to
 * `runWithCorrelation({ correlationId: id }, fn)`.
 */
export function withCorrelationId<T>(
  id: string,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return runWithCorrelation({ correlationId: id }, fn);
}
