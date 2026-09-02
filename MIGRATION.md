# Prisma → TypeORM Migration — COMPLETE

> Status: **Done.** All five plans of the staged migration landed
> (SS-029 → SS-044, closed 2026-06-16). The `PrismaCompat` shim, the
> `@prisma/client` path mappings in `tsconfig.base.json`, and the
> `@prisma/client` dependency are all deleted. TypeORM 0.3 is the only ORM.
>
> This document now serves two purposes:
> 1. §1–§6 record **what happened** (historical reference — read if you need
>    to understand why the code looks the way it does).
> 2. §7 is the **TypeORM conventions runbook** (still authoritative for
>    writing new services), and §9 is the **remaining `src/` → `libs/`
>    decommission** — the actual open cleanup, tracked in
>    [`STATUS.md`](./STATUS.md) §3.

---

## 1. Timeline (for the record)

| Plan | What it was | Closed by |
| --- | --- | --- |
| Plan 1 | `libs/platform/typeorm` lib: `TypeOrmModule`, `DataSource`, entity files, enum re-exports | SS-029 |
| Plan 2 | Pilot domain migrations (`orders`, `shipments`, `billing`, `warehouses`, `notifications`, `serviceability`, `rate-shop`, `ecommerce-integrations`) | SS-029/SS-030 |
| Plan 3 | Bulk migration of the remaining domains through the `PrismaCompat` translation shim | SS-041, SS-042, SS-043a–h |
| Plan 4 | Audit + CI guard (`scripts/audit-prisma-compat.mjs`, `npm run audit:prisma`) | SS-040, SS-047 |
| Plan 5 | Delete the shim, the `@prisma/client` path mappings, and the dependency — one atomic PR | SS-044 (commit `2062547`) |

## 2. What the `PrismaCompat` shim was (deleted)

`libs/platform/typeorm/src/lib/prisma-compat.types.ts` (gone) exported a
`PrismaCompat` namespace that let legacy services keep their
`prisma.x.findMany({ where, include, orderBy })` call sites compiling while the
actual data access moved to TypeORM repositories — a facade with
`findUnique`/`findMany`/`create`/`update`/`delete`/`count`/`groupBy` signatures,
translators from Prisma-shaped `where`/`include`/`orderBy` into TypeORM
`FindOptionsWhere`/`relations`/`OrderCondition`, and a `registerPrismaCompat()`
wiring helper. It never called the real `@prisma/client` at runtime. If you see
a reference to it in old code or old commits, that's history — do not recreate it.

## 3. The `@prisma/client` enum re-export (deleted)

A declaration-only shim at
`libs/platform/typeorm/src/lib/@prisma/client/index.d.ts` re-exported the Prisma
enums so DTO/GraphQL imports kept compiling during the transition. Removed in
SS-044 together with the `tsconfig.base.json` mappings:

```jsonc
// DELETED — no longer present:
"@prisma/client": [...],
"@prisma/client/runtime/library": [...]
```

Enums are now TypeORM-native string unions exported from
`@swiftship/platform-typeorm`. There is exactly **one** way to import them:

```ts
import { OrderStatus, ShipmentStatus } from '@swiftship/platform-typeorm';
```

## 4. Module-by-module status — all fully TypeORM

Every domain lib now injects `@InjectRepository(Entity)` repositories:

`orders`, `shipments`, `billing` (incl. GST + COD remittance), `warehouses`,
`notifications`, `serviceability`, `rate-shop`, `ecommerce-integrations`,
`channels`, `tenants`, `onboarding` (incl. KYC), `carriers`, `cod`, `ndr`,
`manifests`, `pickups`, `returns`, `shipping-rates`, `users`, `webhooks`,
`payments`, `plugins`, `surcharges`, `dashboard`, `storage`, `metrics`,
`bulk-operations`.

## 5. `tsconfig.base.json` path mappings (current)

```jsonc
"@swiftship/platform-typeorm": ["libs/platform/typeorm/src/index.ts"],
"@swiftship/platform-auth":    ["libs/platform/auth/src/index.ts"],
"@swiftship/platform-queues":  ["libs/platform/queues/src/index.ts"],
"@swiftship/platform-carriers":["libs/platform/carriers/src/index.ts"],
"@swiftship/platform-graphql": ["libs/platform/graphql/src/index.ts"],
"@swiftship/platform-config":  ["libs/platform/config/src/index.ts"],
"@swiftship/platform-rate-cache": ["libs/platform/rate-cache/src/index.ts"],
"@swiftship/platform-rate-math":  ["libs/platform/rate-math/src/index.ts"],
"@swiftship/platform-throttler":  ["libs/platform/throttler/src/index.ts"],

"@swiftship/domains/*":        ["libs/domains/*"],
"@swiftship/domains-orders":   ["libs/domains/orders/src/index.ts"],
// ... one @swiftship/domains-<name> entry per lib

"@swiftship/shared/*":         ["libs/shared/*"],   // ⚠️ dir is empty — see STATUS.md
"@swiftship/observability":    ["libs/observability/src/index.ts"]
```

When you add a new domain lib, also add a `@swiftship/domains-<name>` entry.

## 6. ESLint / CI guard (still active)

`eslint.config.cjs` bans `@prisma/client` imports via `no-restricted-imports`,
and `scripts/audit-prisma-compat.mjs` (run as `npm run audit:prisma`, wired as
the CI `graph-guard` job) rejects any new Prisma reference in `libs/` — with
tests for the regex (SS-047). Keep it that way: Prisma must not come back.

## 7. How to migrate a service (historical runbook)

The worked example of moving one service to a real TypeORM repository. Follow
it whenever you add or rewrite a service:

1. **Pick the entity.** Open the matching file in
   `libs/platform/typeorm/src/lib/entities/`. If the table is missing, add
   the entity there first (decorators, relations, indices), re-export from
   `index.ts`, and add a migration under
   `libs/platform/typeorm/src/lib/migrations/`.

2. **Inject the repository.**

   ```ts
   constructor(
     @InjectRepository(Order)
     private readonly orders: Repository<Order>,
   ) {}
   ```

   Add `TypeOrmModule.forFeature([Order])` to the module that owns the service.

3. **Write the queries** — the call-site mapping that was used throughout the
   migration:

   | Prisma (old) | TypeORM (now) |
   | --- | --- |
   | `include: { x: true }` | `relations: { x: true }` |
   | `orderBy: { createdAt: 'desc' }` | `order: { createdAt: 'DESC' }` |
   | `select: { id: true }` | build a `SelectQueryBuilder` |
   | `findUnique({ where: { id } })` | `findOne({ where: { id } })` (and a unique index) |
   | `groupBy` / `aggregate` | `createQueryBuilder().select(...).groupBy()` |
   | `createMany` | `save([...])` or `insert(...).values([...]).execute()` |

4. **Enums** come from `@swiftship/platform-typeorm` (see §3).

5. **Write a unit test.** The datasource in `datasource.ts` supports
   `synchronize: true` for test runs — stand up a real Postgres and exercise
   at least one read path and one write path.

6. **Run the full matrix before opening the PR:**

   ```bash
   npx nx run-many --target=test --all
   npx nx run-many --target=lint --all
   npx nx run-many --target=typecheck --all
   ```

   The bar is "all three green, with the new test in the pass list."

## 8. Plan 5 exit criteria (all met ✅)

- Every domain lib off `PrismaCompat` ✅ (SS-043a–h)
- All tests passing without importing `PrismaCompat` ✅
- `@prisma/client` entries removed from `tsconfig.base.json` ✅
- Shim files deleted ✅ (`prisma-compat.types.ts`, `lib/@prisma/`)
- ESLint rule kept as a regression guard (intentional) ✅
- `@prisma/client` no longer a dependency ✅

## 9. The remaining src-to-libs decommission

The ORM migration is done, but the **legacy root `src/` tree is still half-alive**.
This is the actual open cleanup (tracked in STATUS.md §3):

- **10 domain libs still re-export root `src/` through their barrels:**
  `bulk-operations`, `dashboard`, `ecommerce-integrations`, `metrics`, `plugins`,
  `rate-shop` (partial), `storage`, `surcharges`, `users`, `webhooks`.
  `scripts/write-barrels.sh` regenerates those shims — the end state is to
  delete both the script and the shims.
- **5 domain libs are placeholder barrels only** (source of truth in `src/`):
  `carriers`, `returns`, `roles`, `serviceability`, `shipping-rates`.
- For `bulk-operations`, `dashboard`, `metrics`, `plugins`, `storage`,
  `surcharges` there are **local lib implementations that are currently dead
  code**, shadowed by the `src/`-re-exporting barrels — flip the barrel to the
  local exports as part of the decommission.
- `src/prisma/prisma.service.ts` imports the deleted
  `prisma-compat.types.ts` — it breaks the whole legacy tree; delete it (and
  its module wiring) or finish migrating its consumers first.
- Root `nest-cli.json`, the legacy `Dockerfile` (`nest build` → `dist/main.js`
  + `prisma/` copy), and root jest config (`rootDir: src`) all target the
  legacy flow and should be removed once the last `src/` consumer is gone.
  `prisma/schema.prisma` is kept only as a historical reference for the entity
  migration — nothing generates from it.

**Per-lib recipe:** move the code from `src/<name>/` into
`libs/domains/<name>/src/lib/`, rewrite imports to `@swiftship/*` aliases,
flip the barrel from `../../../../src/<name>` re-exports to local exports,
delete the legacy folder, then `npx nx run-many -t lint typecheck test --all`.
