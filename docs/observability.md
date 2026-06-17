# Observability (SS-028)

End-to-end observability for SwiftShip AI: structured logs, OpenTelemetry
tracing, Sentry error tracking, per-tenant audit log, and request-scoped
correlation IDs that flow from HTTP entry through GraphQL resolvers
into BullMQ workers and back into the database.

All four integrations are **no-ops when their environment variables
are unset**. You can deploy SwiftShip without any of them and add
them in one step per integration.

| Capability       | Env var                            | Default      |
| ---------------- | ---------------------------------- | ------------ |
| Correlation IDs  | (always on)                        | enabled      |
| Structured logs  | `LOG_LEVEL` (future)               | always on    |
| OpenTelemetry    | `OTEL_EXPORTER_OTLP_ENDPOINT`      | disabled     |
| Sentry           | `SENTRY_DSN`                       | disabled     |
| Audit log        | (always on; needs the migration)   | always on    |

## 1. Correlation IDs

Every incoming HTTP request gets a correlation id. The id is read from
the `X-Request-Id` (preferred) or `X-Correlation-Id` header; if neither
is set, a fresh UUIDv4 is minted. The id is:

- attached to the request as `req.correlationId`,
- stored in `AsyncLocalStorage` so log lines and Sentry breadcrumbs
  pick it up automatically without explicit threading,
- echoed back in the response as `X-Request-Id`.

### Manual smoke test

```bash
curl -i -H 'X-Request-Id: test-123' http://localhost:3000/ping
# Response header:
#   X-Request-Id: test-123
# Log line (Loki-friendly JSON):
#   {"ts":"...","level":"log","msg":"ping","correlationId":"test-123",...}
```

The same id propagates to every log line for that request and to
every audit row it writes.

### Through a BullMQ worker

Workers re-establish the ALS scope by reading
`job.data.correlationId` and wrapping the processor in
`withCorrelationId(id, fn)`. Concretely:

```ts
import { withCorrelationId } from '@swiftship/observability';

queuesService.createWorker('label-generation', async (job) => {
  return withCorrelationId(job.data.correlationId, async () => {
    // every log line emitted here carries the same correlationId
    structuredLogger.info('label.generated', { awb: job.data.awb });
    // ...
  });
});
```

When the producer enqueues a job it should pass the active correlation
id along:

```ts
import { getCorrelationId } from '@swiftship/observability';
await queuesService.add('label-generation', {
  awb,
  correlationId: getCorrelationId(),
});
```

## 2. OpenTelemetry tracing

The OTel SDK is lazy-loaded — `initOtel()` is a no-op unless
`OTEL_EXPORTER_OTLP_ENDPOINT` is set. When it is, the SDK starts
a Node server with:

| Auto-instrumentation     | What gets traced                                |
| ------------------------ | ----------------------------------------------- |
| `http` + `express`       | Inbound HTTP requests, Express middleware       |
| `graphql` (Apollo)       | Each GraphQL resolver                           |
| `typeorm`                | `Repository.find / save / update / remove`      |
| `bullmq`                 | `Queue.add` and `Worker.process`                |
| `nestjs-core`            | Provider initialization                         |
| `ioredis`                | Redis I/O                                       |
| `pg`                     | Raw pg queries                                  |

### Resource attributes

Every span carries the standard OTel resource envelope:

```yaml
service.name:           swiftship-api
service.namespace:      swiftship
service.version:        ${npm_package_version}
deployment.environment: ${NODE_ENV}
process.pid:            ${process.pid}
host.name:              ${HOSTNAME or os.hostname()}
```

### Local dev — start the collector

The local stack has an OTel Collector under
`docker-compose.observability.yml`:

```bash
docker compose -f docker-compose.observability.yml up -d otel-collector
# Point the API at it:
echo 'OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318' >> apps/api/.env
echo 'OTEL_SERVICE_NAME=swiftship-api'                   >> apps/api/.env
npx nx serve api
```

Spans are forwarded by the collector to its configured exporter.
The default config in `deploy/otel-collector/config.yaml` exports
to stdout; uncomment the `otlp/honeycomb` or `otlp/datadog` block
and set the matching API key to ship to a real backend.

## 3. Sentry error tracking

`Sentry.init({...})` is called from `apps/api/src/main.ts` **before**
`NestFactory.create`. When `SENTRY_DSN` is unset the bootstrap is
a complete no-op (the SDK is not loaded, no spans or breadcrumbs
are recorded).

When enabled, the global filter `SentryExceptionFilter`:

- **captures 5xx errors and any non-`HttpException` throws** as
  `error`-level Sentry events,
- **ignores 4xx `HttpException`s** — they are user errors (validation
  failures, 404s, 401s), not bugs,
- attaches `correlationId`, `tenant.id`, `user.id`, `http.url`,
  `http.status_code`, `traceId` as tags on every event.

### Local dev

```bash
echo 'SENTRY_DSN=https://...@o123.ingest.sentry.io/456' >> apps/api/.env
npx nx serve api
```

To trigger a 5xx and verify the capture, hit a route that doesn't
exist (or a query that throws inside a resolver):

```bash
curl -i http://localhost:3000/v1/shipments/99999999
# -> 500 + Sentry event "Cannot read property '...' of undefined"
```

## 4. Audit log

The audit log lives in `audit_logs`. One row per audited mutation —
refund, void, role change, key rotation, manual shipment cancel,
channel disconnect, etc.

### Schema

| Column          | Type        | Notes                                        |
| --------------- | ----------- | -------------------------------------------- |
| id              | SERIAL PK   |                                              |
| tenantId        | INTEGER     | No FK — audit rows survive tenant deletion.  |
| actorUserId     | INTEGER     | Nullable for `api_key` / `system` actions.   |
| actorType       | VARCHAR(16) | `'user'` / `'api_key'` / `'system'`.         |
| action          | VARCHAR(128)| e.g. `'orders.cancel'`.                      |
| resourceType    | VARCHAR(64) | e.g. `'Order'`.                              |
| resourceId      | VARCHAR(128)| Stringified resource id.                     |
| beforeJson      | JSONB       | Mutation args snapshot.                      |
| afterJson       | JSONB       | Return value snapshot.                       |
| ipAddress       | VARCHAR(64) | From `X-Forwarded-For` / socket.             |
| userAgent       | VARCHAR(256)|                                              |
| correlationId   | VARCHAR(128)| The same id in the response header.          |
| createdAt       | TIMESTAMP   |                                              |

Indexes: `(tenantId, createdAt DESC)`, `(resourceType, resourceId)`,
`(correlationId)`, `(actorUserId)`, `(action)`.

### Decorator

Auto-record any `@Mutation` resolver by decorating it with
`@Auditable({...})`. The global `AuditInterceptor` reads the
metadata, captures the input as `before`, the return value's
`id` as `resourceId`, and the return value as `after`:

```ts
@Auditable({ action: 'orders.cancel', resourceType: 'Order' })
@Mutation(() => Order)
async cancelOrder(@Args('input') input: CancelInput): Promise<Order> {
  // ... resolver body unchanged ...
}
```

### Manual record

Call `AuditLogService.record(...)` directly when an audit row is
needed outside a GraphQL resolver (e.g. a webhook callback, a
worker that mutates state, an admin CLI):

```ts
await auditLogService.record({
  tenantId,
  actorUserId: null,
  actorType: 'system',
  action: 'wallets.auto_topup',
  resourceType: 'Wallet',
  resourceId: walletId,
  before: { availableBalancePaise: 0 },
  after: { availableBalancePaise: 100_000 },
  metadata: { trigger: 'low_balance_threshold' },
});
```

### Soft-fail safety

`AuditLogService.record()` is wrapped in a `try/catch` — if the
`audit_logs` table is missing (e.g. the migration has not run
yet on a fresh dev DB), the row is dropped with a `console.warn`
and the calling resolver completes normally. Decorated mutations
**never crash** because of an audit failure.

### Retention

| actorType  | Retention |
| ---------- | --------- |
| `user`     | 7 years   |
| `api_key`  | 7 years   |
| `system`   | 90 days   |

Enforced by a housekeeping cron (separate bead) that runs daily
and `DELETE`s rows older than the threshold for the matching
`actorType`. The `correlationId` index makes the "show me
everything that happened on this one request" lookup trivial:

```sql
SELECT createdAt, action, resource_type, resource_id, ip_address
FROM   audit_logs
WHERE  correlation_id = 'test-123'
ORDER  BY created_at;
```

## 5. Structured logger

`StructuredLogger` emits one JSON line per log record so a sidecar
(Vector, Promtail) can ship it directly to Loki without a per-line
schema check. Every line now carries the active correlation
context automatically:

```json
{
  "ts":            "2026-06-17T10:30:11.123Z",
  "level":         "info",
  "context":       "OrderService",
  "msg":           {"event":"order.created","orderId":42},
  "pid":           1234,
  "correlationId": "test-123",
  "traceId":       "5b8efff798038103d269b633813fc60c",
  "spanId":        "eee19b7ec3c1b174",
  "tenantId":      7,
  "userId":        99
}
```

The shape is stable; backends can index on `correlationId`,
`traceId`, `tenantId` directly.

## 6. Verification

```bash
# Typecheck everything (must be green)
npx nx run-many -t typecheck --all

# Unit tests for observability + api (must be green)
npx nx test observability
npx nx test api

# Cold-start smoke (Sentry + OTel must not exceed 50ms combined)
time npx nx serve api
```

### Manual smoke matrix

| # | Action                                                                            | Expected                                                                 |
| - | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1 | `curl -H 'X-Request-Id: test-123' http://localhost:3000/ping`                     | Response carries `X-Request-Id: test-123`; log line includes the id      |
| 2 | Trigger a 5xx (e.g. `/v1/shipments/99999999`) with `SENTRY_DSN` set               | New event in Sentry with `correlationId` tag                             |
| 3 | `curl http://localhost:3000/graphql -d '{"query":"{ auditEvents(tenantId:\"1\"){ id action resourceType createdAt } }"}'` (after running the migration + decorating at least one mutation) | Returns `[]` or recent rows; headers carry `X-Request-Id`               |
| 4 | Set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`; run the local collector  | `docker compose -f docker-compose.observability.yml logs otel-collector` shows the API spans |

## 7. Files touched by SS-028

```
libs/observability/src/lib/observability.module.ts             (modified)
libs/observability/src/lib/logger.service.ts                   (modified)
libs/observability/src/lib/correlation/context.ts              (new)
libs/observability/src/lib/correlation/correlation-id.middleware.ts  (new)
libs/observability/src/lib/correlation/correlation.module.ts   (new)
libs/observability/src/lib/audit/audit-log.types.ts            (new)
libs/observability/src/lib/audit/audit-log.entity.ts           (new)
libs/observability/src/lib/audit/audit-log.service.ts          (new)
libs/observability/src/lib/audit/audit-log.model.ts            (new)
libs/observability/src/lib/audit/audit-log.input.ts            (new)
libs/observability/src/lib/audit/audit-log.resolver.ts         (new)
libs/observability/src/lib/audit/audit-log.module.ts           (new)
libs/observability/src/lib/audit/auditable.decorator.ts        (new)
libs/observability/src/lib/audit/audit.interceptor.ts          (new)
libs/observability/src/lib/sentry/sentry.bootstrap.ts           (new)
libs/observability/src/lib/sentry/sentry.interceptor.ts        (new)
libs/observability/src/lib/sentry/sentry-exception.filter.ts   (new)
libs/observability/src/lib/sentry/sentry.module.ts             (new)
libs/observability/src/lib/otel/otel.bootstrap.ts              (new)
libs/observability/src/lib/otel/trace.middleware.ts            (new)
libs/observability/src/lib/otel/otel.module.ts                 (new)
libs/observability/src/index.ts                                (modified)
libs/platform/typeorm/src/lib/entities/index.ts                (modified — re-exports AuditLogEntity)
libs/platform/typeorm/src/lib/datasource.ts                    (modified — registers 1718160000014)
libs/platform/typeorm/src/lib/migrations/1718160000014-AddAuditLogTable.ts  (new)
apps/api/src/main.ts                                           (modified — initSentry + initOtel + CorrelationIdMiddleware first)
apps/api/src/app.module.ts                                     (modified — APP_FILTER, APP_INTERCEPTOR, Joi schema)
apps/api-public/src/main.ts                                    (modified — correlation-only shim)
docker-compose.observability.yml                               (modified — otel-collector service)
deploy/otel-collector/config.yaml                              (new)
docs/observability.md                                          (new — this file)
apps/api/.env.example                                          (modified — observability env vars commented)
```

## 8. Future work

- Audit log housekeeping cron (separate bead — enforces 7y / 90d retention).
- Sentry source-map upload in the CI release workflow.
- OTel metrics export (currently trace-only; metrics go via Prometheus /metrics).
- Distributed tracing across `apps/web` / `apps/admin-portal` — needs a browser-side RUM SDK; out of scope.