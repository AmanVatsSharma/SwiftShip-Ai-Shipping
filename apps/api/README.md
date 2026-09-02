# apps/api — SwiftShip AI NestJS API

The GraphQL + REST surface. Wires together every `@swiftship/platform-*` and
`@swiftship/domains-*` lib into a runnable NestJS application: tenants +
wallet, KYC (SS-031), GST/E-way (SS-032), COD remittance (SS-033), channel
sync (SS-026), rate engine, NDR + analytics, observability (OTel / Sentry /
audit / correlation IDs), and the per-tenant throttler.

> ⚠️ **Known breakage (see [`STATUS.md`](../../STATUS.md) §2):** `src/app.module.ts`
> and `src/main.ts` currently import `'../../libs/...'`, which resolves to
> `apps/libs/...` (nonexistent) — the file was moved one level down without
> fixing the depths. `apps/api-public` shows the correct `'../../../libs/...'`
> form. The `test` target also points at a missing `jest.config.ts`. Fix these
> before `nx serve api` / `nx build api` will pass.

## Run

```bash
# from the repo root
nx serve api
# or
cd apps/api && npm run start:dev
```

## Build

```bash
nx build api
```

## Env

See `tsconfig.app.json` and the inline Joi schema in `src/app.module.ts` for
the full list. Required: `DATABASE_URL`, `JWT_SECRET`. Recommended for local
dev: `DATABASE_URL=postgres://swiftship:swiftship@localhost:5432/swiftship`
and `REDIS_URL=redis://localhost:6379`. `.env.example` lists everything
including the optional observability vars (`SENTRY_DSN`,
`OTEL_EXPORTER_OTLP_ENDPOINT`) — all no-ops when unset
(see `docs/observability.md`).

## Public routes (non-GraphQL)

- Liveness: `GET /health`
- Readiness: `GET /health/ready`
- Correlation echo: `GET /ping` (returns `X-Request-Id`)
- Prometheus metrics: `GET /metrics`
- Public rate-shop (widget backend): see `src/rate-shop/`
- Shopify webhook receiver: `POST /shopify/webhook` (raw body, HMAC verified)
- GraphQL playground (dev only): `GET /graphql`
