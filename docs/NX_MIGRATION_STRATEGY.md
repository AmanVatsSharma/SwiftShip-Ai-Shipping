# NX Migration Strategy

This document describes how the legacy `src/`-tree NestJS app is being migrated
to a proper Nx workspace (libs/ + apps/). The migration is incremental — at no
point does the API go offline, and at every commit the build is expected to pass.

## Phases (status)

| Phase | Status | Notes |
|-------|--------|-------|
| 1. Workspace setup        | ✅ done  | Nx 22 installed, `nx.json`, `tsconfig.base.json` paths, `workspace.json` summary. |
| 2A. Platform libs         | ✅ done  | `libs/platform/{config,auth,queues,carriers,graphql,typeorm}`. New code in libs. |
| 2B. Pilot domains         | 🟡 next  | `libs/domains/{warehouses,notifications,serviceability}`. |
| 3.  Bulk domain migration | ⏳ pending | 17+ remaining domains (`orders`, `shipments`, `billing`, …). |
| 4.  App extraction        | ⏳ pending | `apps/api`, `apps/admin-portal` (Next.js), `apps/web` (Next.js). |
| 5.  Cleanup + enforcement | ⏳ pending | Dep constraints, lint rules, `prisma/` removal, `dist/` strict. |
| 6.  CI/CD + observability | ⏳ pending | Affected graph, Nx Cloud, Datadog, Sentry. |

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
