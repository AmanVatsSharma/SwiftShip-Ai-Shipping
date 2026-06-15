# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

SwiftShip AI — an AI-powered Indian logistics/shipping SaaS backend (a Shiprocket competitor). It exposes a GraphQL + REST API for managing orders, multi-carrier shipments, returns, pickups, NDR, COD, billing, payments (Stripe + Razorpay), warehouses, e-commerce integrations (Shopify, WooCommerce), webhooks, notifications, plus two Next.js frontends (an owner/admin portal and a public seller storefront).

The repo is an **Nx 19 monorepo** mid-flight on a **Prisma → TypeORM** migration. Three things are not in the source of truth yet and need to be re-read before planning work in a domain: [`MIGRATION.md`](./MIGRATION.md) (per-domain status + migration runbook), [`ARCHITECTURE.md`](./ARCHITECTURE.md) (lib layers + the 5 dependency rules), and [`READY_FEATURES.md`](./READY_FEATURES.md) (the public GraphQL surface).

## Stack

- **NestJS 11** + **GraphQL** (Apollo, code-first — schema auto-generated to `apps/api/src/schema.graphql` from `@ObjectType` / `@InputType` classes)
- **TypeORM 0.3** (the new ORM, wired in `libs/platform/typeorm/`) + Postgres 16. Prisma is still installed but the only thing left in `src/` that uses it is the `PrismaCompat` shim — see MIGRATION.md
- **BullMQ** on **Redis 7** (`ioredis`) for background jobs (label generation, webhook dispatch)
- **Next.js 14** App Router + **Tailwind** + **Apollo Client** for `apps/admin-portal` and `apps/web`
- **Passport JWT** auth with refresh tokens (hashed in DB) + **Throttler** (120 req/min) + **helmet** + raw-body capture for Shopify webhook signature verification
- **Jest** with `ts-jest`; e2e in `apps/api-e2e/`
- **ESLint 9** flat config (`typescript-eslint` type-checked) + **Prettier** (`singleQuote: true`, `trailingComma: "all"`)
- **Prometheus** + **Loki** + **Grafana** for observability (compose file at `docker-compose.observability.yml`)
- **K8s** manifests under `deploy/k8s/`, **GitHub Actions** under `.github/workflows/`

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

## High-level architecture

The full picture (with a Mermaid graph) is in [`ARCHITECTURE.md`](./ARCHITECTURE.md). The short version:

```
apps/            ← the only things that wire everything together
  api/           NestJS API (port 3000)
  admin-portal/  Next.js owner panel (port 4200)
  web/           Next.js merchant storefront (port 4300)
  api-e2e/       Supertest e2e suite

libs/
  platform/      Infrastructure: auth, typeorm, queues, carriers, graphql, config
  domains/       18 bounded contexts: orders, shipments, billing, warehouses,
                 notifications, serviceability, rate-shop, ecommerce-integrations,
                 carriers, cod, ndr, manifests, pickups, returns, shipping-rates,
                 users, webhooks, payments, plus capability libs (plugins, roles,
                 bulk-operations, surcharges, dashboard, storage, metrics,
                 onboarding)
  shared/        Cross-cutting types, DTO fragments, money helpers
  observability/ StructuredLogger, Prometheus /metrics
  shared-ui/     cn(), formatINR(), formatDate() (used by both Next apps)
```

### The 5 dependency rules (enforced by `@nx/enforce-module-boundaries` in `eslint.config.cjs`)

1. **No cycles between libs.** If you need one, the boundary is wrong — split the lib.
2. **Platform libs can only depend on other platform libs** (plus `shared` and `type:types`). Platform libs must not import from `domains/`. That keeps infrastructure reusable across multiple business domains.
3. **Domain libs can only depend on platform + their own type.** A `domains/orders` service can inject `@InjectRepository(Order)` and call `QueuesService`, but it must not reach into `domains/billing` directly — it goes through that lib's public API or an event.
4. **Apps are the only things that wire everything together.** Composition (module imports, `TypeOrmModule.forFeature`, GraphQL resolver registration) lives in `apps/api/src/app.module.ts`, `apps/admin-portal/app/`, and `apps/web/app/`. This is what makes the same domain lib reusable from more than one app.
5. **Cross-cutting concerns (logger, metrics) live in `libs/observability`.** No domain or platform lib should `console.log` or instantiate its own `Counter`. Import the observability primitives; the wire-up (Prometheus registry, OTLP exporter) happens once in the apps.

ESLint also bans direct `@prisma/client` imports outside the compat shim — see MIGRATION.md §6. If the rule fires on your PR, do not silence it; migrate the import.

## Prisma → TypeORM migration (in flight)

[`MIGRATION.md`](./MIGRATION.md) is the source of truth. Read it **before** opening a PR against a domain lib. Summary:

- **Fully TypeORM** (real `@InjectRepository(Entity)` services): `orders`, `shipments`, `billing`, `warehouses`, `notifications`, `serviceability`, `rate-shop`, `ecommerce-integrations`.
- **Still on `PrismaCompat`** (legacy `prisma.x.findMany({ ... })` call sites go through a shim that translates to TypeORM): `carriers`, `cod`, `ndr`, `manifests`, `pickups`, `returns`, `shipping-rates`, `users`, `roles`, `webhooks`, `plugins`, `surcharges`, `dashboard`, `storage`, `metrics`, `onboarding`, `payments`, `bulk-operations`.
- The `PrismaCompat` shim lives in `libs/platform/typeorm/src/lib/prisma-compat.types.ts` and is registered per-module via `registerPrismaCompat(...)`. If you are tempted to add a new translator to that file, don't — migrate the service instead.
- Plan 5 (delete the shim) is unblocked when: every lib is off `PrismaCompat`, every test passes without it, and the `@prisma/client` entries in `tsconfig.base.json` and the `no-restricted-imports` rule in `eslint.config.cjs` can be removed as one atomic PR.

The runbook in MIGRATION.md §7 walks through migrating a service. The Prisma→TypeORM call-site mapping (`include` → `relations`, `orderBy: { x: 'desc' }` → `order: { x: 'DESC' }`, `findUnique` → `findOne`, etc.) is in the same section.

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

- **GraphQL schema** is regenerated by Apollo into `apps/api/src/schema.graphql` on every API boot. Do not hand-edit it; change the `@ObjectType` classes.
- **Queues** (`QueuesService`, `getQueue`, `createWorker` in `libs/platform/queues/`) wrap BullMQ on `REDIS_URL`. Workers live alongside the service that owns them (e.g. `label-generator` worker is in `libs/domains/shipments/`).
- **WebSockets** — `@nestjs/platform-socket.io` is available. The shipments lib publishes `trackingUpdates(shipmentId)` for live AWB events.
- **E-commerce** — Shopify is the primary platform. `apps/api/src/main.ts` registers a raw-body parser on `/shopify/webhook` for HMAC verification. WooCommerce and the rest live under `libs/domains/ecommerce-integrations/`.
- **Storage** — `STORAGE_DRIVER` is `s3` (default; uses `@aws-sdk/client-s3` + presigner) or `stub` (dev).
- **Old `src/` directory** — the legacy single-package source still exists at `src/`. It is what the domain libs re-export through their barrels. It is on the way out; do not add new features to `src/`. Add them to a `libs/domains/<name>/` lib instead, and update the barrel.

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
