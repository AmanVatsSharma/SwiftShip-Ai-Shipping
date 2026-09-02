# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

SwiftShip AI — an AI-powered Indian logistics/shipping SaaS backend (a Shiprocket competitor). It exposes a GraphQL + REST API for managing orders, multi-carrier shipments, returns, pickups, NDR, COD, billing, payments (Stripe + Razorpay), warehouses, channel integrations (Shopify, WooCommerce, Amazon, Flipkart, Myntra, Meesho), webhooks, notifications, plus two Next.js frontends (an owner/admin portal and customer-facing web) and a public REST API with Node/Python/PHP SDKs.

The repo is an **Nx 22 monorepo**. The Prisma → TypeORM migration is **complete** (no Prisma anywhere; `npm run audit:prisma` guards CI). Before planning work, re-read: [`STATUS.md`](./STATUS.md) (current state, known breakages, resume order), [`ARCHITECTURE.md`](./ARCHITECTURE.md) (lib layers + the 5 dependency rules), and [`READY_FEATURES.md`](./READY_FEATURES.md) (the public GraphQL + REST surface).

## Stack

- **NestJS 11** + **GraphQL** (Apollo, code-first — schema auto-generated at boot from `@ObjectType` / `@InputType` classes; legacy SDL snapshot at `src/schema.graphql`)
- **TypeORM 0.3** (the only ORM, wired in `libs/platform/typeorm/`, 16 migrations) + Postgres 16. Prisma was fully removed in SS-044 — do not reintroduce it.
- **BullMQ** on **Redis 7** (`ioredis`) for background jobs (label generation, webhook dispatch, KYC verify, channel sync, COD reconciliation cron)
- **Next.js 14** App Router + **Tailwind** + **Apollo Client** for `apps/admin-portal` (PWA) and `apps/web` (tracking page, return portal, CDN widgets)
- **Passport JWT** auth with refresh tokens (hashed in DB) + **per-tenant Postgres-backed throttler** (`libs/platform/throttler`) + **helmet** + raw-body capture for Shopify webhook signature verification
- **Public REST API v1** (`apps/api-public`, tsoa): Swagger UI at `/docs/v1/`, API-key auth, committed OpenAPI spec; **SDKs** in `packages/{node,python,php}` regenerated from it (`scripts/build-sdks.mjs`, CI `sdk-ci.yml`)
- **Observability**: OTel tracing, Sentry, correlation IDs, `@Auditable()` audit log, Prometheus `/metrics` (`libs/observability`, see `docs/observability.md`; compose stack in `docker-compose.observability.yml`)
- **Jest** with `ts-jest`; e2e in `apps/api-e2e/`
- **ESLint 9** flat config (`typescript-eslint` type-checked) + **Prettier** (`singleQuote: true`, `trailingComma: "all"`)
- **K8s** manifests under `deploy/k8s/`, **GitHub Actions** under `.github/workflows/` (`ci.yml`, `sdk-ci.yml`, `release.yml`)
- **k6** load tests (`loadtest/`), **chaos** scenarios + runbooks (`chaos/`), **Postman** collection + newman (`postman/`)

## Common commands

```bash
# install
npm install

# bring up infra only (api still needs the env below)
docker compose up -d postgres redis

# serve each app
npx nx serve api           # http://localhost:3000    (GraphQL at /graphql)
npx nx serve admin-portal  # http://localhost:4200
npx nx serve web           # http://localhost:4300

# build / test / lint / typecheck the whole monorepo
npx nx run-many -t build       --all
npx nx run-many -t test        --all --coverage
npx nx run-many -t lint        --all
npx nx run-many -t typecheck   --all

# single project
npx nx test api
npx nx test billing --testPathPattern=invoice.service
npx nx lint shipments

# e2e (boots the full AppModule against PG + Redis)
npx nx run api-e2e:e2e

# visualize the lib dependency graph
npx nx graph
```

Per-app and per-lib `package.json` files exist (so `cd apps/api && npm run start:dev` works too) but the canonical way is `nx`. A short list of root `npm run` aliases is at the top of the root `package.json` (`serve:api`, `test:all`, `lint:all`, `typecheck:all`, `build:all`, `graph`).

> ⚠️ **Known breakage (2026-06-30 audit):** `apps/api` currently fails to typecheck —
> `app.module.ts`/`main.ts` use `'../../libs/...'` import paths that resolve to
> `apps/libs/...` (nonexistent; `apps/api-public` shows the correct `'../../../libs/...'`
> depth), `apps/api/project.json` references a missing `jest.config.ts`, and
> `src/prisma/prisma.service.ts` imports the deleted PrismaCompat shim. Fix these first —
> exact symptom list and resume order in [`STATUS.md`](./STATUS.md) §2/§4.

## High-level architecture

The full picture (with a Mermaid graph) is in [`ARCHITECTURE.md`](./ARCHITECTURE.md). The short version:

```
apps/            ← the only things that wire everything together
  api/           NestJS core API — GraphQL /graphql + REST (port 3000)
  api-public/    Public versioned REST v1 + Swagger UI /docs/v1/ + SDK landing
  api-e2e/       Supertest e2e suite (full AppModule vs PG + Redis)
  admin-portal/  Next.js owner console, PWA (port 4200)
  web/           Next.js tracking page, return portal, CDN widgets (port 4300)

libs/
  platform/      Infrastructure: auth, typeorm, queues, carriers, graphql, config,
                 rate-cache, rate-math, throttler
  domains/       29 bounded-context dirs: orders, shipments, billing (GST/COD recon),
                 channels, tenants, onboarding (KYC), ndr (+analytics), warehouses,
                 notifications, serviceability, rate-shop (+ranking), ecommerce-integrations,
                 carriers, cod, manifests, pickups, returns, shipping-rates, users,
                 webhooks, payments, plus capability libs (plugins, roles,
                 bulk-operations, surcharges, dashboard, storage, metrics)
  observability/ StructuredLogger, /metrics, OTel, Sentry, audit log, correlation IDs
  shared-ui/     cn(), formatINR(), formatDate() (used by both Next apps)

packages/        Generated SDKs: node (@swiftship/node), python, php
```

### The 5 dependency rules (enforced by `@nx/enforce-module-boundaries` in `eslint.config.cjs`)

1. **No cycles between libs.** If you need one, the boundary is wrong — split the lib.
2. **Platform libs can only depend on other platform libs** (plus `shared` and `type:types`). Platform libs must not import from `domains/`. That keeps infrastructure reusable across multiple business domains.
3. **Domain libs can only depend on platform + their own type.** A `domains/orders` service can inject `@InjectRepository(Order)` and call `QueuesService`, but it must not reach into `domains/billing` directly — it goes through that lib's public API or an event.
4. **Apps are the only things that wire everything together.** Composition (module imports, `TypeOrmModule.forFeature`, GraphQL resolver registration) lives in `apps/api/src/app.module.ts`, `apps/admin-portal/app/`, and `apps/web/app/`. This is what makes the same domain lib reusable from more than one app.
5. **Cross-cutting concerns (logger, metrics) live in `libs/observability`.** No domain or platform lib should `console.log` or instantiate its own `Counter`. Import the observability primitives; the wire-up (Prometheus registry, OTLP exporter) happens once in the apps.

ESLint also bans direct `@prisma/client` imports (`no-restricted-imports`) and `scripts/audit-prisma-compat.mjs` (run as `npm run audit:prisma`, CI-enforced) blocks any new Prisma references in `libs/`. Prisma was removed in SS-044 — if a rule fires on your PR, do not silence it; use `@swiftship/platform-typeorm`.

## Data access (TypeORM — the only ORM)

The Prisma → TypeORM migration is **complete** (SS-040…SS-044; the `PrismaCompat` shim and the `@prisma/client` path mappings are deleted). Conventions:

- Entities live in `libs/platform/typeorm/src/lib/entities/` (re-exported from its `index.ts`); migrations in `libs/platform/typeorm/src/lib/migrations/` (16 so far).
- Services inject `@InjectRepository(Entity)` and declare `TypeOrmModule.forFeature([...])` in their module. The Prisma→TypeORM call-site mapping (`include` → `relations`, `orderBy: { x: 'desc' }` → `order: { x: 'DESC' }`, `findUnique` → `findOne`, …) is preserved as a runbook in [`MIGRATION.md`](./MIGRATION.md#7-how-to-migrate-a-service-historical-runbook).
- Enums come from `@swiftship/platform-typeorm` (string-union enums), never `@prisma/client`.
- What remains of the old migration is the **legacy `src/` decommission** — see MIGRATION.md §9 and STATUS.md §3.

## Adding a new domain lib

1. `mkdir libs/domains/<name>/src/lib` and add a `project.json` (copy the shape from an existing domain lib), `tsconfig.json`, `tsconfig.lib.json`, `package.json`, and an `index.ts` barrel.
2. Add a `@swiftship/domains-<name>` entry to `tsconfig.base.json` under `compilerOptions.paths`.
3. Add the lib to the `depConstraints` array in `eslint.config.cjs` (pick the layer tag — typically `layer:domain`).
4. Register the module in `apps/api/src/app.module.ts`. If it has React components, register it in `apps/admin-portal/app/` and/or `apps/web/app/` too.
5. Use the established shape: `*.module.ts`, `*.resolver.ts` (GraphQL `@Query` / `@Mutation`), `*.service.ts` (business logic), `*.model.ts` (`@ObjectType` classes — these drive schema generation, do not hand-edit `apps/api/src/schema.graphql`), `*.input.ts` / `*.dto.ts`, co-located `*.spec.ts` tests.
6. If it adds an entity, add it under `libs/platform/typeorm/src/lib/entities/` and re-export from `libs/platform/typeorm/src/lib/entities/index.ts`.
7. Run `npx nx run-many -t lint test typecheck --all` before opening the PR. The bar is "all three green."

## Adding a new carrier

Implement `CarrierAdapter` from `libs/platform/carriers/src/lib/adapter.interface.ts` (methods: `generateLabel`, `trackShipment`, optional `cancelShipment` / `voidLabel`), drop the file at `libs/platform/carriers/src/lib/adapters/<name>.adapter.ts`, and register it in `carrier-adapter.service.ts` guarded by env credentials (`<CARRIER>_TOKEN`, `<CARRIER>_API_KEY`, etc. — see the existing adapters for the exact env-var name per carrier). Adapter selection is driven entirely by `process.env` so missing credentials gracefully skip the carrier.

## Adding a new env var

1. Add it to the Joi schema in `apps/api/src/app.module.ts` (the `.required()`-ness is the contract).
2. Add it to `apps/api/.env.example` with a dev default. Both Next.js apps have their own `.env.example` for `NEXT_PUBLIC_*` only.
3. If the value must be available in another process (CI, K8s), also add it to `deploy/k8s/10-config.yaml` (non-secret) or the `Secret` block in the same file (secret).

## Deployment

- `docker-compose.yml` — Postgres + Redis + api + web + admin-portal, local dev. Builds the three apps from the per-app `Dockerfile`.
- `docker-compose.observability.yml` — Prometheus + Loki + Promtail + Grafana, in a separate compose project. Prometheus scrapes the api at `host.docker.internal:3000/metrics`; Promtail tails the Docker JSON logs from `StructuredLogger` (`libs/observability/src/lib/logger.service.ts`).
- `deploy/k8s/` — Namespace, ConfigMap, Secret, Postgres StatefulSet, Redis Deployment, three app Deployments + Services + Ingresses, two HPAs. Read `deploy/k8s/README.md` before applying.
- `.github/workflows/ci.yml` — four parallel jobs (lint, typecheck, test, e2e + build) with Postgres + Redis service containers.
- `.github/workflows/release.yml` — builds and pushes three OCI images (`api`, `web`, `admin-portal`) to `ghcr.io` on `v*.*.*` tags.

## Other notes

- **GraphQL schema** is regenerated by Apollo on every API boot. Do not hand-edit it; change the `@ObjectType` classes. (The committed SDL snapshot lives at the legacy `src/schema.graphql`.)
- **Queues** (`QueuesService`, `getQueue`, `createWorker` in `libs/platform/queues/`) wrap BullMQ on `REDIS_URL`. Workers live alongside the service that owns them (e.g. `label-generator` worker is in `libs/domains/shipments/`).
- **WebSockets** — `@nestjs/platform-socket.io` is available. The shipments lib publishes `trackingUpdates(shipmentId)` for live AWB events.
- **E-commerce** — Shopify is the primary platform. `apps/api/src/main.ts` registers a raw-body parser on `/shopify/webhook` for HMAC verification. WooCommerce and the rest live under `libs/domains/ecommerce-integrations/`; the channel-agnostic sync stack (Amazon, Flipkart, Myntra, Meesho included) is `libs/domains/channels/`.
- **Storage** — `STORAGE_DRIVER` is `s3` (default; uses `@aws-sdk/client-s3` + presigner) or `stub` (dev).
- **Old `src/` directory** — the legacy single-package source still exists at `src/`. Ten domain libs (`bulk-operations`, `dashboard`, `ecommerce-integrations`, `metrics`, `plugins`, `rate-shop` partially, `storage`, `surcharges`, `users`, `webhooks`) still re-export it through their barrels, and five more (`carriers`, `returns`, `roles`, `serviceability`, `shipping-rates`) are placeholder barrels over it. It is on the way out; do not add new features to `src/`. Add them to a `libs/domains/<name>/` lib instead, and flip the barrel to local exports. `src/prisma/prisma.service.ts` currently imports the deleted PrismaCompat shim — see STATUS.md §2 before touching the legacy tree.

## Architectural guard (Nx graph check)

`scripts/check-nx-graph.mjs` is a static guard that runs as the `graph` job in CI before `lint`. It reads the workspace dependency graph via `npx nx graph --json` (with a `project.json` + `tsconfig.base.json` fallback when the Nx CLI is unavailable) and asserts:

1. No cycles in the lib dependency graph (DFS with white/grey/black colouring).
2. No `layer:platform` / `layer:shared` / `layer:observability` / `layer:ui` lib depends on a `layer:domain` / `layer:api` / `layer:data-access` lib.
3. No `layer:types` / `layer:utils` lib depends on anything above it.
4. Every project has a `project.json` + `tsconfig.json`; libs additionally need `tsconfig.lib.json` + `src/index.ts`; apps need a `src/` directory.

Run locally:
```bash
node scripts/check-nx-graph.mjs
```

When adding a new project to the workspace:
- **New lib**: `libs/<layer>/<name>/project.json` with tags from the layer taxonomy (mirrors `eslint.config.cjs` `depConstraints`), plus `tsconfig.json`, `tsconfig.lib.json`, `package.json`, and `src/index.ts` exporting the public API.
- **New app**: `apps/<name>/project.json` with a `scope:<app>` tag, plus `tsconfig.json` and a `src/` directory.
- Add a path mapping in `tsconfig.base.json` if the lib should be importable as `@swiftship/<...>`.
- Add the lib to the `depConstraints` array in `eslint.config.cjs` if it introduces a new layer tag.
