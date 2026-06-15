# Prisma → TypeORM Migration

> Status: **In flight** — Plan 1 through Plan 4 of the staged migration are landed; Plan 5 (shim removal) is the final exit gate.
> Audience: anyone touching a service, entity, or test that still goes through `@prisma/client`.

This guide explains where the Prisma → TypeORM migration currently stands, what the
`PrismaCompat` shim is for, and how to move a service from Prisma to TypeORM
end-to-end. It is the source of truth for the migration, and it is the first
thing to read before opening a PR against a domain lib.

---

## 1. The new `@swiftship/platform-typeorm` lib

All TypeORM surface area lives in `libs/platform/typeorm/`. The lib exposes:

| Path | What it is |
| --- | --- |
| `libs/platform/typeorm/src/index.ts` | Public barrel — re-exports the module, entities, datasource, and the `PrismaCompat` types. |
| `libs/platform/typeorm/src/lib/typeorm.module.ts` | `TypeOrmModule` configured from `DATABASE_URL` / `DB_*` env. Registered once in `AppModule`. |
| `libs/platform/typeorm/src/lib/datasource.ts` | Standalone `DataSource` used by migrations and by tests that spin up a Postgres testcontainer. |
| `libs/platform/typeorm/src/lib/entities/` | One file per domain area: `billing.entities.ts`, `commerce.entities.ts`, `ecom.entities.ts`, `identity.entities.ts`, `shipping.entities.ts`, `warehouse.entities.ts`, plus `index.ts`. |
| `libs/platform/typeorm/src/lib/enums.ts` | String-union enums re-exported from `@prisma/client` (see section 3). |
| `libs/platform/typeorm/src/lib/prisma-compat.types.ts` | The `PrismaCompat` shim — see section 2. |
| `libs/platform/typeorm/src/lib/@prisma/client/index.d.ts` | Minimal type shim that re-exports the Prisma enums and a placeholder `PrismaClient` so the shim can compile. |
| `libs/platform/typeorm/src/lib/@prisma/client/runtime.d.ts` | Companion shim for `@prisma/client/runtime/library` (used by some legacy helpers). |

Import the public surface from a single place:

```ts
import { TypeOrmModule, Order, PrismaCompat } from '@swiftship/platform-typeorm';
```

---

## 2. The `PrismaCompat` shim

`libs/platform/typeorm/src/lib/prisma-compat.types.ts` exports a `PrismaCompat`
namespace whose goal is to let legacy services keep their `prisma.x.findMany({
where, include, orderBy })` call sites compiling while the actual data access
migrates to TypeORM repositories.

What it gives you today:

- A `PrismaCompatClient` facade with method signatures that mirror the
  `PrismaClient` surface (`findMany`, `findUnique`, `create`, `update`,
  `delete`, `count`, `groupBy`).
- Translators from Prisma-shaped `where` / `include` / `orderBy` into
  TypeORM `FindOptionsWhere`, `relations`, and `OrderCondition` so a service can
  call `prismaCompat.orders.findMany({ where: { id }, include: { items: true } })`
  and have it executed against a TypeORM `Repository<Order>`.
- A `registerPrismaCompat()` helper that wires a `PrismaCompat` instance to the
  request-scoped repositories from `TypeOrmModule.forFeature(...)`.

What it deliberately does **not** do:

- It does not call the real `@prisma/client` at runtime. The whole point is to
  break the runtime dependency on Prisma while call sites are in transition.
- It does not cover every Prisma feature. Anything exotic (raw SQL, `select`
  projections, complex aggregations) should be moved to a real TypeORM
  repository, not extended in the shim.

If you are tempted to add a new translator to `prisma-compat.types.ts`, do
not. Migrate the service instead. The shim is scheduled for deletion in Plan 5.

---

## 3. The `@prisma/client` enum re-export

Some modules import Prisma **enums** (e.g. `OrderStatus`, `ShipmentMode`,
`PaymentStatus`) and re-use them in DTOs and GraphQL models. To keep those
imports working without pulling in the real Prisma client, the lib ships a
declaration-only shim at
`libs/platform/typeorm/src/lib/@prisma/client/index.d.ts`. It re-exports every
enum that `@prisma/client` previously exposed, sourced from `enums.ts`.

The matching `tsconfig.base.json` path mapping points `@prisma/client` and
`@prisma/client/runtime/library` straight at these `.d.ts` files:

```jsonc
"@prisma/client": [
  "./libs/platform/typeorm/src/lib/@prisma/client/index.d.ts"
],
"@prisma/client/runtime/library": [
  "./libs/platform/typeorm/src/lib/@prisma/client/runtime.d.ts"
]
```

In other words: **enum imports are the only Prisma-flavored imports still
allowed in app code, and they only work because of the shim.** The next step is
to flip those enums onto TypeORM-native string unions and delete both shim
files.

---

## 4. Module-by-module status

Domain libs are split into two groups. "Fully TypeORM" means every service
injects `@InjectRepository(Entity)` and the `prisma` / `PrismaCompat` import
has been removed from `src/`. "Through PrismaCompat" means the service still
imports the shim and the next migration PR is welcome.

### 4a. Fully TypeORM

- `domains/orders`
- `domains/shipments`
- `domains/billing`
- `domains/warehouses`
- `domains/notifications`
- `domains/serviceability`
- `domains/rate-shop`
- `domains/ecommerce-integrations`

### 4b. Still on PrismaCompat

The following domain libs still call into `PrismaCompat`. They are the
remaining work for Plan 4 and the precondition for Plan 5:

- `domains/carriers`
- `domains/cod`
- `domains/ndr`
- `domains/manifests`
- `domains/pickups`
- `domains/returns`
- `domains/shipping-rates`
- `domains/users`
- `domains/roles`
- `domains/webhooks`
- `domains/plugins`
- `domains/surcharges`
- `domains/dashboard`
- `domains/storage`
- `domains/metrics`
- `domains/onboarding`
- `domains/payments`
- `domains/bulk-operations`

> `domains/roles` is included above for completeness; it has not been listed
> separately in `tsconfig.base.json` (only `domains/users` is wired through
> the path mapping). File a small follow-up PR to add the role lib to the
> path map the first time you migrate it.

---

## 5. `tsconfig.base.json` path mappings

The relevant entries, copy-pasted from `tsconfig.base.json`:

```jsonc
"@swiftship/platform-typeorm": [
  "libs/platform/typeorm/src/index.ts"
],
"@swiftship/platform-auth":    ["libs/platform/auth/src/index.ts"],
"@swiftship/platform-queues":   ["libs/platform/queues/src/index.ts"],
"@swiftship/platform-carriers": ["libs/platform/carriers/src/index.ts"],
"@swiftship/platform-graphql":  ["libs/platform/graphql/src/index.ts"],
"@swiftship/platform-config":   ["libs/platform/config/src/index.ts"],

"@swiftship/domains/*":         ["libs/domains/*"],
"@swiftship/domains-orders":    ["libs/domains/orders/src/index.ts"],
"@swiftship/domains-shipments": ["libs/domains/shipments/src/index.ts"],
"@swiftship/domains-billing":   ["libs/domains/billing/src/index.ts"],
"@swiftship/domains-warehouses":   ["libs/domains/warehouses/src/index.ts"],
"@swiftship/domains-notifications": ["libs/domains/notifications/src/index.ts"],
"@swiftship/domains-serviceability": ["libs/domains/serviceability/src/index.ts"],
"@swiftship/domains-rate-shop": ["libs/domains/rate-shop/src/index.ts"],
"@swiftship/domains-ecommerce-integrations": ["libs/domains/ecommerce-integrations/src/index.ts"],
// ... plus the rest of the @swiftship/domains-* entries

"@swiftship/shared/*": ["libs/shared/*"],
"@swiftship/observability": ["libs/observability/src/index.ts"],

"@prisma/client": ["./libs/platform/typeorm/src/lib/@prisma/client/index.d.ts"],
"@prisma/client/runtime/library": [
  "./libs/platform/typeorm/src/lib/@prisma/client/runtime.d.ts"
]
```

When you add a new domain lib, also add a `@swiftship/domains-<name>` entry.

---

## 6. ESLint rule that bans direct `@prisma/client` imports

`eslint.config.cjs` ships with a `no-restricted-imports` rule that fires
whenever code outside the shim tries to import from `@prisma/client` or
`@prisma/client/runtime/library`:

```js
'no-restricted-imports': [
  'error',
  {
    patterns: [
      {
        group: ['@prisma/client', '@prisma/client/runtime/library'],
        message:
          'Do not import from @prisma/client — use @swiftship/platform-typeorm or the entities/enums re-exports.',
      },
    ],
  },
],
// ...
{
  files: [
    'libs/platform/typeorm/src/lib/@prisma/**/*',
    'src/prisma/**/*',
  ],
  rules: {
    'no-restricted-imports': 'off',
  },
},
```

Net effect: the shim is the **only** place that may import `@prisma/client`,
and the lint rule will block any new leak. If the rule fires on your PR, do
not silence it — migrate the import.

---

## 7. How to migrate a service

A worked runbook for moving one service from `PrismaCompat` to a real
TypeORM repository.

1. **Pick the entity.** Open the matching file in
   `libs/platform/typeorm/src/lib/entities/`. If the table is missing, add
   the entity there first (decorators, relations, indices) and re-export
   from `index.ts`.

2. **Inject the repository.** Replace the `PrismaCompat` import with a
   TypeORM repository injection:

   ```ts
   // before
   constructor(private readonly prisma: PrismaCompat) {}

   // after
   constructor(
     @InjectRepository(Order)
     private readonly orders: Repository<Order>,
   ) {}
   ```

   Add `TypeOrmModule.forFeature([Order])` to the module that owns the
   service.

3. **Rewrite the queries.** The shape of the call changes but the meaning
   does not:

   ```ts
   // before
   const list = await this.prisma.orders.findMany({
     where: { id, status: OrderStatus.OPEN },
     include: { items: true },
     orderBy: { createdAt: 'desc' },
   });

   // after
   const list = await this.orders.find({
     where: { id, status: OrderStatus.OPEN },
     relations: { items: true },
     order: { createdAt: 'DESC' },
   });
   ```

   Common mapping gotchas:

   | Prisma | TypeORM |
   | --- | --- |
   | `include: { x: true }` | `relations: { x: true }` |
   | `orderBy: { createdAt: 'desc' }` | `order: { createdAt: 'DESC' }` |
   | `select: { id: true }` | build a `SelectQueryBuilder` |
   | `findUnique({ where: { id } })` | `findOne({ where: { id } })` (and a unique index) |
   | `groupBy` / `aggregate` | `createQueryBuilder().select(...).groupBy()` |
   | `createMany` | `save([...])` or `insert(...).values([...]).execute()` |

4. **Translate Prisma enums.** If you were importing `OrderStatus` from
   `@prisma/client`, switch the import to `@swiftship/platform-typeorm`:

   ```ts
   import { OrderStatus } from '@swiftship/platform-typeorm';
   ```

5. **Write a unit test against Postgres testcontainer.** The test must
   stand up a real Postgres (the datasource in `datasource.ts` already
   supports `synchronize: true` for test runs) and exercise at least one
   read path and one write path. The goal is to prove the service works
   without the shim.

6. **Delete the shim call.** Drop the `PrismaCompat` import and constructor
   parameter, and remove the `registerPrismaCompat(...)` call from the
   module. The lint rule should now be happy.

7. **Run the full test matrix.**

   ```bash
   npx nx run-many --target=test --all
   npx nx run-many --target=lint --all
   npx nx run-many --target=typecheck --all
   ```

   If any of those fail, fix them before opening the PR. The bar is "all
   three green, with the new test added in step 5 in the pass list."

8. **Update `MIGRATION.md`.** Move the lib from the
   "Still on PrismaCompat" list to the "Fully TypeORM" list in section 4.

---

## 8. When to delete the shim (Plan 5 exit criteria)

The shim and the `@prisma/client` path mapping are deleted in Plan 5.
That plan is unblocked when **all** of the following are true:

- Every domain lib in section 4b has been moved off `PrismaCompat`.
- Every service in the repo passes its unit tests **without** importing
  `PrismaCompat` (verified by `npx nx run-many --target=test --all`).
- The `@prisma/client` and `@prisma/client/runtime/library` entries have
  been removed from `tsconfig.base.json`.
- The shim files themselves
  (`libs/platform/typeorm/src/lib/prisma-compat.types.ts` and the
  `libs/platform/typeorm/src/lib/@prisma/` directory) have been deleted.
- The ESLint `no-restricted-imports` rule has been removed from
  `eslint.config.mjs` because there is nothing left to ban.

Once those gates are met, open the "Plan 5: delete the shim" PR. That PR
removes the shim, the path mappings, and the lint rule as a single
atomic change. After it lands, `@prisma/client` is no longer a dependency
of this repo and the migration is done.
