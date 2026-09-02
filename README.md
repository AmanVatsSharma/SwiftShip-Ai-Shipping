# SwiftShip AI

SwiftShip AI is an AI-powered Indian logistics and shipping SaaS — a Shiprocket
competitor built on NestJS, GraphQL, and PostgreSQL. It is a multi-tenant platform
for managing orders, multi-carrier shipments, live rate shopping with AI ranking,
returns/RMA, pickups, NDR/RTO automation, COD remittance + bank reconciliation,
GST/E-way compliance, KYC, billing/wallet, payments (Stripe + Razorpay),
warehouses, channel integrations (Shopify, WooCommerce, Amazon, Flipkart, Myntra,
Meesho), webhooks, and notifications — plus a public REST API with official
Node/Python/PHP SDKs.

> **Resuming work?** Read [`STATUS.md`](./STATUS.md) first — it records the current
> state of the tree, the known build breakages, and the recommended order of work.
> The 24-week roadmap (all 9 pillars) is complete: 65/65 tracker items closed.

## Architecture

```
apps/              ← api, api-public, api-e2e, web, admin-portal
libs/domains/      ← 29 bounded contexts (orders, shipments, billing, channels, …)
libs/platform/     ← auth, typeorm, queues, carriers, graphql, config,
                     rate-cache, rate-math, throttler
libs/observability/← OTel, Sentry, audit log, correlation IDs, /metrics
libs/shared-ui/    ← cn(), formatINR(), formatDate() (used by both Next apps)
packages/          ← generated SDKs: node, python, php
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full lib layer diagram, the
dependency rules, and the complete lib inventory.

## Quick start

```bash
# 1. Install
npm install

# 2. Start Postgres + Redis (the API talks to both)
docker compose up -d postgres redis

# 3. Run the API in dev mode (watches, regenerates the GraphQL schema)
npx nx serve api
```

The API listens on `http://localhost:3000` by default. GraphQL Playground is
mounted at `/graphql`; the public REST API serves Swagger UI at `/docs/v1/`
(when `apps/api-public` is served) and Prometheus metrics at `/metrics`.

### Other useful commands

```bash
npx nx serve web               # merchant storefront (apps/web)
npx nx serve admin-portal      # owner panel (apps/admin-portal)
npx nx serve api-public        # public REST v1 + /docs/v1/ swagger UI
npx nx run-many -t build --all # build everything
npx nx run-many -t test  --all # run every unit suite
npx nx run-many -t lint  --all # lint every project
npx nx graph                   # visualize the lib dependency graph
```

A full list of root-level scripts is in `package.json`; the most common ones
are also exposed as `npm run serve:api`, `npm run test:all`, `npm run lint:all`,
`npm run typecheck:all`, and `npm run graph`. Also available:
`npm run docs:api:openapi` / `docs:api:postman` / `docs:api:run` (Postman +
OpenAPI refresh and newman run), `npm run loadtest:*` (k6), `npm run chaos:*`,
and `npm run audit:prisma` (CI guard against Prisma imports).

## Directory map

```
apps/
  api/             NestJS GraphQL + REST core API
  api-public/      Public versioned REST API v1 (tsoa) + Swagger UI + SDK landing
  api-e2e/         Supertest e2e suite (boots the full AppModule)
  admin-portal/    Next.js owner/operator console (+ PWA)
  web/             Next.js storefront: tracking page, return portal, CDN widgets

libs/
  platform/
    auth/          Passport JWT, refresh tokens, @CurrentUser / @Roles
    typeorm/       TypeOrmModule, entities, DataSource, 16 migrations
    queues/        BullMQ wrapper on ioredis
    carriers/      CarrierAdapter interface + 13 carrier adapters + sandbox
    graphql/       Apollo driver, code-first schema, throttler
    config/        Joi-validated ConfigModule
    rate-cache/    Redis rate cache + carrier circuit breaker
    rate-math/     weight-break, zones, fuel/ODA/COD surcharges
    throttler/     Postgres-backed, per-tenant-tier rate limiting
  domains/         29 bounded contexts — see ARCHITECTURE.md
  observability/   OTel, Sentry, audit log, correlation IDs, StructuredLogger
  shared-ui/       Shared formatting helpers for the Next apps

packages/
  node/            @swiftship/node SDK (typescript-fetch, from OpenAPI)
  python/          swiftship Python SDK
  php/             swiftship/sdk-php

docs/              public-api guides, observability, pilot playbook, openapi/
deploy/            k8s manifests + grafana/loki/prometheus/otel configs
chaos/, loadtest/  chaos scenarios + runbooks; k6 scenarios
postman/           Postman collection + environment + newman runner
scripts/           SDK build, openapi/postman refresh, graph guard, pilot dry-run
```

## Docs

- [`STATUS.md`](./STATUS.md) — **current state, known issues, resume plan**
- [`LAUNCH_PLAN.md`](./LAUNCH_PLAN.md) — **deploy-readiness verdict + phased plan to production / competing with Shiprocket**
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — layers, apps, lib inventory, 5 dependency rules
- [`MIGRATION.md`](./MIGRATION.md) — Prisma → TypeORM (complete) + remaining `src/` decommission
- [`ROADMAP_24W.md`](./ROADMAP_24W.md) — the 24-week product roadmap (all pillars landed)
- [`READY_FEATURES.md`](./READY_FEATURES.md) — the public GraphQL + REST surface
- [`docs/public-api/`](./docs/public-api/) — getting started, auth, errors, rate limits, webhooks
- [`docs/observability.md`](./docs/observability.md) — OTel / Sentry / audit log guide
- [`docs/anchor-tenant-pilot.md`](./docs/anchor-tenant-pilot.md) — pilot playbook + dry-run script

## Contributing

- **Architecture & layering rules** — read [`ARCHITECTURE.md`](./ARCHITECTURE.md)
  before adding a new lib or changing an import direction. The Nx boundary rule
  in `eslint.config.cjs` and `scripts/check-nx-graph.mjs` (CI `graph` job) will
  reject illegal imports.
- **TypeORM is the only ORM.** Prisma is gone (SS-044). `npm run audit:prisma`
  blocks new Prisma imports in CI. See [`MIGRATION.md`](./MIGRATION.md) for the
  TypeORM conventions and the remaining legacy `src/` cleanup.
- **Conventions for a new module** — see `CLAUDE.md` at the repo root.

## License

TBD — proprietary, all rights reserved. Contact the maintainers before
redistributing.
