# apps/api-e2e — SwiftShip API end-to-end tests

Boots the full `AppModule` from `apps/api` against a real Postgres + Redis
and exercises the public surface (HTTP and GraphQL) over Supertest.

## Suites (the money paths, one per leg)

| Suite | Leg | Notes |
| --- | --- | --- |
| `health.e2e-spec.ts` | smoke | health endpoints + apiInfo |
| `auth-signup-login.e2e-spec.ts` | signup → login | no `me` query exists — uses `user(id)`; documents two resolver bugs (see header) |
| `tenant-onboarding.e2e-spec.ts` | onboardTenant → wallet → rotateApiKey | wallet starts with the ₹500 onboarding credit (50000 paise), not zero |
| `order-lifecycle.e2e-spec.ts` | createOrder → order(id) → cancel | cancel is `updateOrder(status: CANCELLED)` — no `cancelOrder` mutation; proves tenant isolation with a second tenant |
| `rate-shop-ranking.e2e-spec.ts` | rankedRateShop | runs against the always-registered SANDBOX adapter (no external carrier APIs) |
| `shipment-label-tracking.e2e-spec.ts` | createShipment → generateShippingLabel → ingestTracking | SANDBOX carriers row seeded; asserts derived status + tracking events |
| `ndr-flow.e2e-spec.ts` | NDR open → resolve / escalate | cases are opened via `NdrService.createNdrFromTracking` (no `createNdr` mutation); resolution via `transitionNdr` / `markDelivered` |
| `cod-remittance-recon.e2e-spec.ts` | COD remittance → bank reconciliation | integration-style: HDFC CSV through the production parser into `CodRemittanceCronService.reconcileForTenant`; asserts match/dispute + money invariant |
| `kyc-gst-invoice.e2e-spec.ts` | submitKyc → verify → COD gate → invoice → GST | Setu sandbox bank fixture `1111111111`; GST via `generateGstInvoice` / `gstInvoiceByInvoiceId` |

## Run

```bash
# all suites (from the repo root)
npx nx run api-e2e:e2e

# one suite
npx nx run api-e2e:e2e --testFile=order-lifecycle.e2e-spec.ts

# plain jest
npx jest --config apps/api-e2e/jest.config.ts apps/api-e2e/src/order-lifecycle.e2e-spec.ts
```

## Pre-reqs

- Postgres reachable at `DATABASE_URL` (or `DATABASE_URL_TEST`); defaults to
  `postgres://swiftship:swiftship@localhost:5432/swiftship_test`.
  In CI, set `DATABASE_URL=postgres://postgres:postgres@localhost:5432/swiftship_test`
  to match the service container in `.github/workflows/ci.yml`.
- Redis reachable at `REDIS_URL` (defaults to `redis://localhost:6379`) —
  needed by BullMQ (queues, KYC verify worker, label generator).
- The global setup will try `docker compose up -d postgres redis` once
  if these aren't already running. Skip with `SKIP_LOCAL_DB=1`.
- Tables are auto-synced at app boot (`DB_SYNCHRONIZE` defaults to on in
  non-prod); migrations also exist if you prefer them.

## Conventions

- `*.e2e-spec.ts` files only; shared helpers live in
  `src/support/e2e-harness.ts` (app bootstrap, GraphQL client over
  Supertest, `TRUNCATE … CASCADE` reset, tenant/warehouse/carrier seeding,
  tenant-bound JWT minting, request-scoped service resolver).
- Each suite truncates all entity tables in `beforeAll` and builds its own
  fresh tenant — suites are order-independent and re-runnable.
- Use Supertest against the NestJS app instance — don't use Apollo
  Client; we want the HTTP path to mirror production.
- Tenant-scoped resolvers need either the `x-swiftship-api-key` header or
  a JWT carrying a `tenantId` claim; role-guarded resolvers (orders,
  shipments) additionally need `roles` in the JWT — see
  `setupTenantStack()`/`mintTenantJwt()` in the harness.
- Path aliases (`@swiftship/*`) are mapped for Jest in
  `jest.config.ts` (`moduleNameMapper`) — keep it in sync with
  `tsconfig.base.json` when libs move.

## Known red tests (bugs found while writing this suite)

These tests assert the *intended* contract and will stay red until the
server code is fixed (all fixes are outside `apps/api-e2e/`):

0. **BOOT BLOCKER (all suites)** — `libs/domains/billing/src/lib/billing.model.ts`
   references `EwayBill` (declared line ~199) inside the `Invoice` class
   (line ~186) property metadata. With `emitDecoratorMetadata` (on in
   `tsconfig.base.json`) that reference evaluates at decoration time →
   `ReferenceError: Cannot access 'EwayBill' before initialization` when
   the module loads. The AppModule statically imports the billing lib, so
   **the API cannot finish booting** (jest, `nx serve`, or compiled) until
   the class is moved above `Invoice`. Fix: reorder the declarations.
1. `register` / `refreshTokens` mutations —
   `libs/platform/auth/src/lib/auth.resolver.ts` calls
   `authService.register(email, password, name)` (service expects one
   object) and `authService.refreshTokens(...)` (service method is
   `refresh`).
2. `login` — the service's `user` payload is missing the non-nullable
   `emailVerified`/`createdAt` fields of the `UserAuth` GraphQL type,
   which nulls the whole `AuthPayload`.
3. `createInvoice` GraphQL mutation — the resolver assigns
   `input.userId = user.id`, but the JWT exposes `userId`; every call
   404s ("User with ID undefined not found"). The KYC/GST suite creates
   invoices via `InvoiceService` from DI instead.
4. `InvoiceService.createInvoice` never sets `tenantId` (rows keep the
   column default 1), but the GST queries are tenant-scoped — the
   KYC/GST suite re-homes the row before querying (flagged for fix).
5. Suspected (needs a live DB to confirm):
   `ShipmentsService.getShipment` uses `relations: ['…','labels',…]` but
   the entity relation is `label` (singular) — TypeORM 0.3 may throw
   `FindRelationsNotFoundError` on every shipment read.

