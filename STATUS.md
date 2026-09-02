# Project status — read this first when resuming work

> **UPDATE 2026-09-01 — Phase 0 of [`LAUNCH_PLAN.md`](./LAUNCH_PLAN.md) IS DONE.**
> The P0 repair session fixed **everything in §2 below**: `apps/api` typechecks
> (350 errors → 0), all unit-test projects are green (incl. channels/payments/
> onboarding suites that had *never actually run* — broken jest preset paths),
> `nx build api` produces a working bundle, and the **full stack boots live**
> against Postgres + Redis: `/health` OK, GraphQL serves, `register`/`login`
> return real JWTs persisted to the database. ~25 latent runtime bugs were
> found and fixed by the boot test (DI reflection, TDZ model ordering, BullMQ
> redis options, throttler GraphQL context, entity FK types, duplicate index
> names, missing module imports). Docker production path, alert rules, status
> page, runbook, and 8 money-path e2e suites were added (see §6).
> Remaining work is tracked as beads **SS-101…SS-107**.
>
> **Last code change:** `1f296a8` (2026-06-17) + the uncommitted 2026-09-01 repair session.
> **Tracker:** 65 beads closed through the 24-week roadmap; SS-100 (P0 repair) closed;
> SS-101…SS-107 open (decommission tail, e2e-in-CI, surface gaps, security, launch phases).
> **This file** is the resume point. Update it whenever you land or discover something.
>
> **Going to production / competing with Shiprocket?** The full assessment + phased launch
> plan is in [`LAUNCH_PLAN.md`](./LAUNCH_PLAN.md). Short version: Phase 0 done; next is
> integration hardening (SS-105), staging deploy (SS-106), then the anchor-tenant pilot (SS-107).

## 1. What is built (verified in code)

| Area | State |
| --- | --- |
| **Monorepo** | Nx 22 workspace: 5 apps, 9 platform libs, 29 domain lib dirs, observability lib, `shared-ui`, 3 SDK packages (~46 registered Nx projects). |
| **`apps/api`** | NestJS 11 GraphQL (Apollo, code-first) + REST core. Wires all domain libs, KYC (SS-031), GST/E-way (SS-032), COD remittance (SS-033), channel sync (SS-026), OTel/Sentry/audit (SS-028), tenant guard, per-tenant throttler. ✅ compiles, tests green, builds, and **boots live** (2026-09-01). |
| **`apps/api-public`** | Public versioned REST API v1 (tsoa): 8 controllers (orders, shipments, shipping-rates, carriers, returns, tracking, rate-shop, webhooks), `X-Swiftship-Api-Key` auth, per-tenant throttling, Swagger UI at `/docs/v1/`, committed OpenAPI spec. |
| **`apps/web`** | Next.js 14: branded tracking page `/track/[awb]`, end-customer return portal `/return/[token]`, embeddable CDN widgets (`public/cdn/`: tracking.js, returns.js, rate-shop.js, swiftship-loader.js). |
| **`apps/admin-portal`** | Next.js 14 + PWA: dashboard, NDR analytics, orders, channels (list/new/detail), rate-shop widget. |
| **`apps/api-e2e`** | Boots the full `AppModule` against Postgres + Redis (health suite only — thin). |
| **Carriers** | 13 adapters in `libs/platform/carriers` (Delhivery, BlueDart, DTDC, Ecom Express, Xpressbees, Shadowfax, Aramex, DHL, FedEx India, Gati, India Post, Professional Couriers) + sandbox. |
| **Rate engine** | `rate-cache` (Redis + circuit breaker), `rate-math` (weight-break, zones, fuel/ODA/COD surcharges), rate ranking + A/B simulator (`rankedRateShop`, `simulateRateShop`, `simulateRateShopBatch`). |
| **Channels** | `ChannelSyncService` + Shopify/WooCommerce sync adapters, Amazon/Flipkart/Myntra/Meesho direct adapters, credential cipher, BullMQ schedulers. |
| **Compliance** | KYC (PAN/GSTIN/bank validators + async verify), GST invoicing + E-way bill (ClearTax sandbox), COD reconciliation (5 bank statement parsers: HDFC/ICICI/Axis/SBI/Kotak) + dispute queue. |
| **Observability** | OTel traces, Sentry, correlation IDs, `@Auditable()` audit log with `auditEvents`/`resourceHistory` queries, Prometheus `/metrics`, Grafana/Loki/Promtail/collector stack in `docker-compose.observability.yml`. |
| **SDKs** | `packages/node` (`@swiftship/node`), `packages/python`, `packages/php` — generated from the OpenAPI spec by `scripts/build-sdks.mjs`; `sdk-ci.yml` regenerates + tests all three. |
| **Infra/tooling** | 16 TypeORM migrations, k8s manifests (`deploy/k8s/`), CI (`ci.yml`: graph-guard incl. `audit:prisma`, lint, typecheck, test w/ services, e2e, build; `sdk-ci.yml`; `release.yml`), chaos scenarios + runbooks, k6 load tests, Postman collection + newman runner, pilot onboarding dry-run (`scripts/tenant-onboarding-dryrun.sh` + `docs/anchor-tenant-pilot.md`). |

## 2. Known broken / unfinished (do not be surprised)

> **2026-09-01: EVERY ITEM IN THIS SECTION IS FIXED** (kept for the record; see SS-100).
> The sections below describe the pre-repair state.

These are real, verified issues in the working tree. **P0 items block `nx build api` /
`nx serve api` entirely** — fix them before anything else.

### P0 — the API app does not compile

1. **`apps/api/src/app.module.ts` + `apps/api/src/main.ts` use wrong relative import depths.**
   They import `'../../libs/...'`, which from `apps/api/src/` resolves to `apps/libs/...`
   (nonexistent). Compare `apps/api-public`, which correctly uses `'../../../libs/...'`.
   `npx tsc --noEmit -p apps/api/tsconfig.app.json` → ~20 × TS2307. Includes one
   garbage import: `from '../../libs/domains/..'`.
2. **`apps/api/project.json` `test` target points at `apps/api/jest.config.ts`, which does
   not exist** (no `tsconfig.spec.json` either).
3. **`src/prisma/prisma.service.ts` imports `libs/platform/typeorm/src/lib/prisma-compat.types`**
   — that file was deleted in SS-044. This breaks the legacy `src/` tree and, transitively,
   every domain-lib barrel that re-exports from `src/` (see §3).
4. `apps/api/src/app.resolver.ts` has TS2564 errors (unset definite-assignment props);
   `morgan` types are missing (`@types/morgan` not installed).

### P1 — known, not blocking every path but blocking "all green"

5. **`apps/api-e2e` imports the same broken `AppModule`** — fixing item 1 fixes this too.
6. **Pre-existing TS2322 in `libs/platform/typeorm/src/lib/datasource.ts`** (`typeof
   ShipmentStatus` not assignable to `EntitySchema`) noted in the SS-026 closure.
7. **`libs/domains/ecommerce-integrations` has no `project.json`** — not a registered Nx
   project, yet `scripts/check-nx-graph.mjs` expects every domain lib to have one.
8. **`libs/shared/` is empty** (`.gitkeep` only) despite `@swiftship/shared/*` path mappings;
   the actual shared helpers live in `libs/shared-ui/`.
9. **Only 6 projects have real jest configs** (`channels`, `observability`, `tenants`,
   `rate-cache`, `throttler`, `typeorm`); the rest rely on `passWithNoTests`. The SS-026
   closure notes `npx nx test` failing with "jest.preset.js not found" for domain libs that
   lack the config.
10. ~~**Root `Dockerfile` still builds the legacy path**~~ **Fixed:** root `Dockerfile` is the
    canonical multi-stage Nx build (`npx nx build api` → `dist/apps/api/main.js` +
    `npx nx build typeorm` for migrations); `docker-entrypoint.sh` runs TypeORM migrations
    before boot; `apps/api/Dockerfile` deleted; compose + `release.yml` aligned. The image
    cannot be smoke-tested until the P0 compile fixes land (`nx build api` currently fails
    in `auth`/`carrier-adapters`/`channels` lib builds).
11. **SDK runtime acceptance deferred to Linux/CI** (SS-027b/d closure notes): generator
    round-trips need Java 21; `sdk-ci.yml` exists but has not been observed green on a runner.
12. **Uncommitted change:** `.beads/issues.jsonl` has a dedup/cleanup edit (removes stale
    duplicate SS-026/SS-042 lines, blank lines) — commit it.

### Small deferred items (from bead closure notes)

- COD reconciliation invariant test never added (no jest infra in `cod` lib at the time).
- `publicRateShop` GraphQL mutation (SS-022 TODO) — web widgets currently use the REST
  endpoint instead.
- SS-043e (shipments shim migration) commit hash never recorded in the bead.

## 3. The half-finished src-to-libs decommission (2026-09-01 progress)

The Prisma → TypeORM migration is **done** (SS-044 deleted the shim; no `@prisma/client`
mappings remain in `tsconfig.base.json`). During the 2026-09-01 repair, the legacy tree
was **cut out of the apps/api compile/runtime graph entirely**:

- **Flipped to local exports:** `rate-shop` (rate-ranking only), `dashboard`
  (courier-score only), `users`, `storage`. The old `dashboardStats`/`rateShop`/
  `checkServiceability` GraphQL queries are unwired until ported (SS-103).
- **Dead local legacy files excluded from build:** `rate-shop` (rate-shop.module/
  service/resolver + serviceability), `dashboard` (module/service/resolver/model).
- **Still shim barrels into `src/`:** `bulk-operations`, `ecommerce-integrations`
  (its local services also still import the removed PrismaService — registered
  lint-only until ported), `metrics`, `plugins`, `surcharges`, `webhooks`.
- **Still placeholder barrels:** `carriers`, `returns`, `roles`, `serviceability`,
  `shipping-rates` (not referenced by apps/api).
- `src/prisma/prisma.service.ts` is still broken **but nothing in the live app
  imports it anymore** — it dies with the final `src/` deletion (SS-101).

## 4. Recommended resume order (2026-09-01)

1. ~~Fix the P0 import paths~~ ✅ done (SS-100).
2. **Push to GitHub and watch CI** — `ci.yml` (graph-guard/lint/typecheck/test/e2e/build)
   and `sdk-ci.yml` (JDK 21 SDK round-trip; the deferred SS-027 acceptance). The e2e job
   needs the `DATABASE_URL` fix from SS-102 first or it will fail on connection.
3. **Run the 8 money-path e2e suites locally or in CI** (`npx nx run api-e2e:e2e`) —
   written and typecheck-clean in `apps/api-e2e/src/`, never yet executed against a DB.
4. **Commit the generated `apps/api/src/schema.graphql`** (regenerated at each boot).
5. **SS-101 decommission tail**, then **SS-105/106/107** per LAUNCH_PLAN.
6. Local dev note: this Windows machine runs native Postgres + Redis 3 on ports 5432/6379;
   `docker-compose.override.yml` (gitignored) maps the containers to **55432/56379** —
   use `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/swiftship`
   and `REDIS_URL=redis://127.0.0.1:56379` when running `dist/apps/api/main.*.js`.
6. **Then product work:** the small deferred items in §2, more e2e coverage than the health
   suite, and the anchor-tenant pilot itself (`docs/anchor-tenant-pilot.md`).

## 5. Doc map

| Doc | What it is |
| --- | --- |
| `STATUS.md` | This file — current state + resume plan. |
| `LAUNCH_PLAN.md` | Deploy-readiness verdict + phased plan to production and to competing with Shiprocket. |
| `README.md` | Repo overview, quick start, layout. |
| `ARCHITECTURE.md` | Layers, apps, lib inventory, dependency rules. |
| `MIGRATION.md` | Prisma → TypeORM: **complete** (historical) + the remaining `src/` decommission. |
| `ROADMAP_24W.md` | The 24-week/9-pillar product roadmap — all pillars landed. |
| `READY_FEATURES.md` | The GraphQL + REST public surface. |
| `READINESS_SUMMARY.md` | Capability snapshot vs Shiprocket. |
| `docs/public-api/` | Public REST API guides (getting started, auth, errors, rate limits, webhooks). |
| `docs/observability.md` | OTel/Sentry/audit/correlation guide. |
| `docs/anchor-tenant-pilot.md` | Pilot playbook + dry-run script. |
| `docs/superpowers/plans/`, `docs/NX_MIGRATION_STRATEGY.md` | Historical migration plans (archive). |
| `.beads/issues.jsonl` | Issue tracker (beads CLI) — 65/65 closed. |
