# NX Migration Strategy

> **Status (2026-06 docs-sync): complete.** All phases below landed. The
> follow-up Prisma → TypeORM migration also completed (SS-044 deleted the
> shim — see [`MIGRATION.md`](../MIGRATION.md)). The one remaining tail is the
> legacy `src/` decommission (~10 domain-lib barrels still re-export root
> `src/`) — see MIGRATION.md §9 and [`STATUS.md`](../STATUS.md) §3.

This document describes how the legacy `src/`-tree NestJS app was migrated
to a proper Nx workspace (libs/ + apps/). The migration was incremental — at no
point did the API go offline, and at every commit the build was expected to pass.

## Phases (final status)

| Phase | Status | Notes |
|-------|--------|-------|
| 1. Workspace setup        | ✅ done | Nx 22 installed, `nx.json`, `tsconfig.base.json` paths, `workspace.json` summary. |
| 2A. Platform libs         | ✅ done | `libs/platform/{config,auth,queues,carriers,graphql,typeorm,rate-cache,rate-math,throttler}`. |
| 2B. Pilot domains         | ✅ done | `libs/domains/{warehouses,notifications,serviceability}` + the rest. |
| 3.  Bulk domain migration | ✅ done | All 29 domain dirs created (`orders`, `shipments`, `billing`, `channels`, `tenants`, …). Barrels for ~10 of them still re-export `src/` — final flip pending. |
| 4.  App extraction        | ✅ done | `apps/api`, `apps/api-public`, `apps/api-e2e`, `apps/admin-portal`, `apps/web`. ⚠️ `apps/api` currently has broken import depths — STATUS.md §2. |
| 5.  Cleanup + enforcement | ✅ mostly | Dep constraints + `scripts/check-nx-graph.mjs` CI guard live; `prisma/` reference copy + root `Dockerfile`/`nest-cli.json` legacy flow still pending removal. |
| 6.  CI/CD + observability | ✅ done | `ci.yml` (affected graph), `sdk-ci.yml`, `release.yml`; OTel/Sentry/Grafana stack (`docker-compose.observability.yml`, `docs/observability.md`). |

## Architecture rules (post-migration)

1. **Each domain is a single Nx library** under `libs/domains/<name>`. The lib
   owns its GraphQL model, resolver, service, input DTOs, and entity access.
2. **Cross-cutting infra lives in `libs/platform/*`** — TypeORM datasource,
   auth (JWT/refresh), queues, carrier adapters, GraphQL root config, and the
   `ConfigService` Joi schema.
3. **Apps compose libs** — `apps/api` wires modules; `apps/admin-portal` and
   `apps/web` import from `libs/shared/*` for GraphQL clients and types.
4. **Path mappings** — `@swiftship/platform-*` and `@swiftship/domains-*` for
   ergonomic imports. Internal aliasing (`prisma`, `auth`, …) is removed.
5. **Module boundaries** — enforced by Nx tags + the `@nx/enforce-module-boundaries`
   ESLint rule (Phase 5).

## ORM migration: Prisma → TypeORM

The new `libs/platform/typeorm` lib is the long-term home for DB access. It
ships with:

- A `DataSource` config (Postgres via `pg` driver).
- All entities as `@Entity()`-decorated classes (`UserEntity`, `OrderEntity`,
  `CarrierEntity`, `ShippingRateEntity`, `ShipmentEntity`, `ShippingLabelEntity`,
  `TrackingEventEntity`, `PincodeZoneEntity`, `WarehouseEntity`, `WarehouseStockEntity`,
  `WarehouseCoverageEntity`, `WarehouseSellerProfileEntity`, `RateSurchargeEntity`,
  `ReturnEntity`, `PickupEntity`, `ManifestEntity`, `ManifestItemEntity`, `NdrCaseEntity`,
  `CodRemittanceEntity`, `WebhookSubscriptionEntity`, `IdempotencyKeyEntity`, `EwayBillEntity`,
  `ShopifyStoreEntity`, `ShopifyOrderEntity`, `ShopifyWebhookEventEntity`, `WooCommerceStoreEntity`,
  `WooCommerceOrderEntity`, `RoleEntity`, `OnboardingStateEntity`, `PaymentEntity`,
  `RefundEntity`, `SubscriptionEntity`, `InvoiceEntity`, `InvoiceItemEntity`, `InvoiceSequenceEntity`,
  `RefreshTokenEntity`).
- Enum types matching the Prisma enums (`OrderStatus`, `ShipmentStatus`, …).
- A `TypeormModule.forRoot()` for `AppModule.imports`.

**Migration order per feature module**:
1. Copy the feature from `src/<feature>/` to `libs/domains/<feature>/src/lib/`.
2. Rewrite service code: `prisma.x.findMany({ where })` → `repo.find({ where })`.
3. Add `@InjectRepository(<Entity>)` constructor injection.
4. Update imports from `prisma` to `@swiftship/platform-typeorm`.
5. Add the new lib to `app.module.ts` `imports` (or wire it in `apps/api/src/app/`).
6. Remove the old `src/<feature>/` files (only when `nx run-many -t build` passes).
7. Update any consumer `import { … } from '../<feature>'` paths.

## Why Nx over a custom monorepo

- **Task graph** — `nx affected` only runs projects touched by a PR.
- **Generators** — `@nx/nest` and `@nx/next` generate boilerplate with the
  correct project.json, tsconfig, jest config, and lint rules.
- **Constraint checking** — ESLint plugin enforces that `domains/*` libs do not
  import from `apps/*` and that only `platform/typeorm` touches entities.
- **Cloud** — Nx Cloud gives us remote caching and distribution for CI.

## What's intentionally NOT in Nx today

- Schema generation for GraphQL still happens in `apps/api` (NestJS code-first
  reads decorators from libs/domains/* at boot). Centralising it would require
  a build step before `nest start`.
- The Prisma schema in `prisma/schema.prisma` is kept around as a **reference**
  for TypeORM entity migration. We do not run `prisma generate` anymore.
- The Dockerfile still builds from the repo root. It will move to `apps/api/Dockerfile`
  in Phase 4.
