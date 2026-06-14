# Plan 5 day-0 baseline — PrismaCompat audit (SS-040)

Captured 2026-06-15 as the day-0 baseline for the `npm run audit:prisma`
guard added in [SS-040](./). This is the audit's *expected* state today:
the guard is intentionally loose on the shim itself but strict everywhere
else, so as each shim-removal bead (SS-041, SS-042, SS-043, SS-044) lands,
the consumer count drops to zero.

The audit script lives at
[`scripts/audit-prisma-compat.mjs`](../../../scripts/audit-prisma-compat.mjs).
It runs `grep`-style over `libs/domains/*/src` and `libs/platform/*/src`,
excluding the three known shim files, and exits non-zero if any consumer
match is found.

## How to read the baseline

- **Consumer matches** = `@prisma/client` or `PrismaCompat` appearing in
  any file in `libs/domains/*/src` or `libs/platform/*/src` that is *not*
  one of the three shim files listed below. These are the matches the
  guard treats as failures.
- **Shim file matches** = matches inside the three shim files. The
  guard does not count these toward the failure check; they are shown
  as a sanity reference so you can see the shim is still in place.
- The "expected" final state (after SS-044 lands) is **0 consumer
  matches** and **0 shim file matches**, with the shim directory
  deleted.

The three excluded shim files are:

- `libs/platform/typeorm/src/lib/prisma-compat.types.ts`
- `libs/platform/typeorm/src/lib/@prisma/client/index.d.ts`
- `libs/platform/typeorm/src/lib/@prisma/client/runtime.d.ts`

## Day-0 baseline (2026-06-15)

Running `node scripts/audit-prisma-compat.mjs` on 2026-06-15 reports:

```
Consumer matches: 42
```

Per-lib consumer counts (sorted by lib):

| Lib | Count | Pattern(s) |
| --- | --- | --- |
| `domains/billing` | 1 | `PrismaCompat` (1, in a comment) |
| `domains/cod` | 1 | `PrismaCompat` (1, in a comment) |
| `domains/manifests` | 1 | `PrismaCompat` (1, in a comment) |
| `domains/onboarding` | 2 | `@prisma/client` (2, real imports) |
| `domains/orders` | 1 | `@prisma/client` (1, in a comment) |
| `domains/payments` | 1 | `PrismaCompat` (1, in a comment) |
| `domains/pickups` | 1 | `PrismaCompat` (1, in a comment) |
| `domains/shipments` | 2 | `PrismaCompat` (2, in a comment) |
| `domains/users` | 3 | `@prisma/client` (3, real imports + spec) |
| `platform/rate-cache` | 1 | `PrismaCompat` (1, in a comment) |
| `platform/typeorm` | 28 | `PrismaCompat` + `@prisma/client` (re-exports, the shim's own test, and the module that wires it) |

### Notes per lib

- **`domains/billing`** — match is in the `typeorm-billing.service.ts`
  doc comment. The lib is otherwise fully TypeORM. SS-041 (the first
  shim-removal bead) is expected to drop this to zero by also cleaning
  the comment.
- **`domains/cod`** — match is in the barrel comment. Cod still
  has the service files going through `PrismaCompat`; SS-042 will
  migrate it and clean the comment.
- **`domains/manifests`, `domains/payments`, `domains/pickups`** —
  matches are in the `src/index.ts` barrel comments. The services
  are still on the shim; these will resolve under SS-043.
- **`domains/onboarding`** — real `@prisma/client` imports
  (`OnboardingStatus` enum, `Prisma` namespace). Onboarding is in
  the SS-043 umbrella. The two imports must be moved to
  `@swiftship/platform-typeorm` (or the enum re-exports from there)
  before the shim is deleted.
- **`domains/orders`** — match is in a comment on the `OrderStatus`
  enum. This is a leftover from the pilot migration; the actual code
  uses the TypeORM-native enum. The comment will be updated as part
  of SS-043 cleanup.
- **`domains/shipments`** — matches are in the service file's header
  comment describing the shim history. Service code itself is fully
  TypeORM. SS-043 should clean the comment.
- **`domains/users`** — three real imports: the `User as PrismaUser`
  type import, plus two `PrismaClientKnownRequestError` references
  (one in the service, one in the spec). These need to be replaced
  with a TypeORM-native error check or removed; tracked under SS-043.
- **`platform/rate-cache`** — match is in a comment describing the
  fallback behavior. The service is otherwise TypeORM. SS-043 cleanup.
- **`platform/typeorm`** — the bulk of the count is the shim's
  internal `prisma-compat.types.ts` and the `__tests__/prisma-compat.types.spec.ts`
  file (the shim's own test suite). `typeorm.module.ts` is included
  because it provides the `PrismaCompat` global and re-exports
  `configurePrismaCompat`. All of these collapse to zero when SS-044
  deletes the shim and the module's `PrismaCompat` provider.

### Per-pattern totals (consumer matches)

| Pattern | Count |
| --- | --- |
| `PrismaCompat` | 35 |
| `@prisma/client` | 7 |

## What "exit 0" looks like at the end of Plan 5

After SS-044 (delete the shim + the `@prisma/client` path mapping +
the `no-restricted-imports` rule) lands, the audit will read:

```
Consumer matches: 0
Shim file matches: 0  (the shim directory no longer exists)
OK: 0 consumer matches. Shim no longer present.
```

The guard is then either deleted or repurposed (e.g. to verify no
service re-introduces a Prisma dependency). The choice is part of
SS-044's atomic PR.

## Cadence

- **SS-041** (week 1): migrate `domains/billing` off `PrismaCompat`.
  Expected delta: `domains/billing: 1 → 0`.
- **SS-042** (week 2): migrate `domains/cod`. Expected delta:
  `domains/cod: 1 → 0` plus a reconciliation invariant test.
- **SS-043** (weeks 3-9): migrate remaining libs
  (`manifests`, `onboarding`, `orders`, `payments`, `pickups`,
  `shipments`, `users`, `identity`, etc.) and clean up the leftover
  comments. Expected delta: consumer matches → 0.
- **SS-044** (week 10): atomic shim delete + path-mapping drop +
  lint-rule drop. Expected delta: all counts → 0; the script returns
  exit 0 with the shim directory gone.

The audit runs on every PR via the `graph` CI job (before `lint`).
If it fails, the only legitimate response is to migrate the offending
service or to remove the match from a comment.

## Reproducing this baseline

```bash
node scripts/audit-prisma-compat.mjs
# or
npm run audit:prisma
```

The output is deterministic; the script does not depend on git state.
