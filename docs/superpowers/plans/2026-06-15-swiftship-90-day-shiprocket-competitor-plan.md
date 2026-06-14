# SwiftShip AI — 90-day Shiprocket-Competitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gap between the current technical foundation and a production-ready SaaS that can credibly compete with Shiprocket — finish the Prisma shim, add compliance/RMA/COD/mobile, harden for production load, and run an anchor-tenant pilot.

**Architecture:** Three new pillars layered on top of the existing Pillars 1-6. Pillars 7-8 close the **product gap** (what Shiprocket does that we don't yet). Pillar 9 closes the **operational gap** (what production SLA + customer trust require). The Prisma shim removal (the highest-leverage cross-cutting work) is its own track running in parallel as a fixed-cadence factory.

**Tech Stack:** NestJS 11, TypeORM 0.3, BullMQ, GraphQL + REST, Next.js 14, Postgres 16, Redis 7, k6 (load test), Lit (web components), React Native (mobile), WATI/Exotel (WhatsApp/voice), CKYC/Setu (KYC), ClearTax/IRIS (GST+E-way).

---

## Scope, sequencing, and why

### Why this ordering
1. **Track A — Prisma shim removal (P-FINAL)** runs continuously: 10 libs queued, 1/week. This is the **architectural debt with the worst compounding drag**. Removing the shim unlocks TypeORM-native features (raw joins, transactions, query builders) and reduces the onboarding cliff.
2. **Pillar 7 (Compliance, GST, KYC, COD reconciliation, RMA, Mobile)** — these are the **ship-blockers for real merchants**. A merchant without GST+E-way+KYC+mobile cannot be onboarded. RMA + COD reconciliation are the top-2 support ticket generators.
3. **Pillar 8 (Reliability & Trust)** — load test, chaos test, status page, public docs, postman collection. Without this, every anchor-tenant conversation stalls.
4. **Pillar 9 (Differentiation & Growth)** — public REST API + SDKs (P6 already covers this), NDR analytics (cross-sell), explainable AI (moat), WhatsApp/SMS/email fallback reliability (retention), and the anchor-tenant pilot itself.

### What's in each new bead
Each bead has: scope, files to create/modify, tests, acceptance, and an explicit dependency on the prerequisite. The "prerequisite" field is the cross-check that prevents out-of-order work from creating throwaway code.

---

## Track A — Prisma shim removal (P-FINAL, 10 weeks)

These 10 beads are children of SS-029 (which currently says "1 lib/week"). They unblock the deletion of `prisma-compat.types.ts`, `@prisma/client/index.d.ts`, and `@prisma/client/runtime.d.ts` in `libs/platform/typeorm/`.

### Task A.0 — Pragma gate audit (Day 1)

**Files:**
- Modify: `.beads/issues.jsonl`
- Create: `scripts/audit-prisma-compat.mjs`

**Steps:**
- [ ] **Step 1:** Run the audit script and capture the current `grep` of `PrismaCompat`/`@prisma/client` across `libs/domains/*/src/`. Save to `docs/superpowers/plans/2026-06-15-prisma-audit.md` (counts per lib).
- [ ] **Step 2:** Add `npm run audit:prisma` to root `package.json` so the audit runs in CI on every PR and on the `graph` job.
- [ ] **Step 3:** Verify the audit job fails the build when any new import of `@prisma/client` (outside `prisma-compat.types.ts`) lands. Wire it as a fast-fail pre-lint step.

**Why this matters:** The "1 lib/week" cadence is meaningless without a guardrail. A single new `@prisma/client` import reopens the door. The audit script + CI step is the tripwire.

**Acceptance:** `npm run audit:prisma` exits 0 today and exits 1 if any new `@prisma/client` import is added.

**Commit:** `chore(prisma): add audit script and CI guard`

---

### Task A.1 — Migrate `domains/billing` off PrismaCompat

**Files (estimated):**
- Modify: `libs/domains/billing/src/lib/*.service.ts` (each)
- Modify: `libs/domains/billing/src/lib/billing.module.ts`
- Create: `libs/domains/billing/src/lib/__tests__/*.spec.ts` (refresh)

**Steps (per service file, repeated):**
- [ ] **Step 1:** Identify every `prisma.x.findMany/findUnique/create/update/...` call in the service. Catalog: count, where-clause complexity, `include`/`orderBy` usage, transactions.
- [ ] **Step 2:** Add `TypeOrmModule.forFeature([InvoiceEntity, InvoiceLineEntity, ...])` to `billing.module.ts`.
- [ ] **Step 3:** Replace each `prisma.x` call with the equivalent `@InjectRepository(Entity) repository.find/findOne/save/...` call. Use the MIGRATION.md §7 call-site mapping.
- [ ] **Step 4:** Remove `registerPrismaCompat(...)` and the `PrismaCompat` import from the module.
- [ ] **Step 5:** Run `npx nx test billing --coverage`. Expect: 100% of billing specs pass; coverage unchanged or better.
- [ ] **Step 6:** Run `npx nx typecheck billing`. Expect: 0 errors.
- [ ] **Step 7:** `git commit -m "refactor(billing): migrate from PrismaCompat to @InjectRepository (SS-029.1)"`

**Acceptance:** `grep -r "PrismaCompat\|@prisma/client" libs/domains/billing/src` returns 0 matches. All tests green.

**Why this matters:** Billing is the most-tested lib (wallet + ledger + idempotency) and the place where double-entry correctness lives. Getting the migration template right here informs every other lib.

---

### Task A.2-A.9 — Same template, applied to remaining 9 libs

The template above applies to each of: `cod`, `manifests`, `onboarding`, `orders`, `payments`, `pickups`, `shipments`, `users`, plus `shared/identity` (or whichever order makes the dependency graph happy — run the dep graph first).

**Special cases:**
- **`orders` and `shipments`** — these are the high-traffic services. Use query builders (`createQueryBuilder`) for any join-heavy calls; the shim was hiding N+1s. Add an explicit N+1 test that fails if a 100-item list does >5 queries.
- **`cod`** — COD reconciliation has money. Migration must include a **reconciliation invariant test** that asserts the ledger sum equals the available balance for every tenant, on every test run.
- **`payments`** — Stripe + Razorpay webhooks land here. The migration must preserve raw-body capture for signature verification (already in `main.ts` for Shopify, mirror the pattern).
- **`users` / `shared/identity`** — the auth path. TenantContext dependencies must keep working in middleware. Add a test that asserts the request-scoped tenantId propagates through `@InjectRepository` lookups correctly.

**Acceptance per lib:** zero PrismaCompat refs + 100% tests green + coverage delta ≥ 0.

---

### Task A.10 — Delete the shim (Day 70, the big day)

**Files:**
- Delete: `libs/platform/typeorm/src/lib/prisma-compat.types.ts`
- Delete: `libs/platform/typeorm/src/lib/@prisma/client/index.d.ts`
- Delete: `libs/platform/typeorm/src/lib/@prisma/client/runtime.d.ts`
- Modify: `libs/platform/typeorm/src/lib/typeorm.module.ts` (drop `registerPrismaCompat` export)
- Modify: `tsconfig.base.json` (drop the two `@prisma/client` path mappings)
- Modify: `eslint.config.mjs` (drop the `no-restricted-imports` rule for `@prisma/client`)

**Steps:**
- [ ] **Step 1:** Confirm `grep -r "PrismaCompat\|registerPrismaCompat" libs/` returns 0.
- [ ] **Step 2:** Run the full monorepo build, test, lint, typecheck. Expect: all green.
- [ ] **Step 3:** Run the e2e suite (`npx nx run api-e2e:e2e`). Expect: 100% pass.
- [ ] **Step 4:** Delete the shim files. Update the `no-restricted-imports` rule to be a no-op or replace with a "no shim reintroduction" rule.
- [ ] **Step 5:** Re-run build, test, lint, typecheck, e2e. All must still pass.
- [ ] **Step 6:** `git commit -m "refactor(typeorm): delete PrismaCompat shim (Plan 5 complete)"`
- [ ] **Step 7:** Update `MIGRATION.md`: change "Plan 5 in flight" → "Plan 5 complete — shim removed `<date>`."

**Acceptance:** No file in the repo imports `@prisma/client` (grep returns 0). Build + test + lint + typecheck + e2e all green. MIGRATION.md reflects the new state.

---

## Pillar 7 — Compliance, RMA, COD reconciliation, Mobile (10 weeks)

### Task 7.1 — KYC + onboarding compliance

**Bead:** `SS-031` — KYC (PAN, GSTIN, bank account verification) + onboarding
**Files:**
- Create: `libs/domains/onboarding/src/lib/kyc/`
- Modify: `libs/domains/onboarding/src/lib/onboarding.service.ts`
- Create: `libs/domains/onboarding/src/lib/kyc/pan-validator.ts`
- Create: `libs/domains/onboarding/src/lib/kyc/gstin-validator.ts`
- Create: `libs/domains/onboarding/src/lib/kyc/bank-verifier.service.ts` (CKYC/Setu)
- Create: `libs/domains/onboarding/src/lib/kyc/kyc.entity.ts` (KycEntity, KycDocumentEntity)
- Create: `libs/domains/onboarding/src/lib/kyc/kyc.service.ts`
- Create: `libs/domains/onboarding/src/lib/kyc/kyc.resolver.ts`
- Create: `libs/domains/onboarding/src/lib/kyc/kyc.input.ts`
- Create: `libs/domains/onboarding/src/lib/kyc/kyc.model.ts`
- Create: `libs/domains/onboarding/src/lib/kyc/__tests__/kyc.service.spec.ts`
- Migration: `libs/platform/typeorm/src/lib/migrations/1718160000010-AddKycTables.ts`

**Steps:**
- [ ] **Step 1:** Write the entity test (TDD): given a PAN `ABCDE1234F`, the validator returns `{ valid: true, name: '...', type: 'individual' }`. (Use a stub for the CKYC call in tests.)
- [ ] **Step 2:** Implement `PanValidatorService` (regex + checksum). Verify the test passes.
- [ ] **Step 3:** Write the GSTIN entity test: valid 15-char GSTIN → returns state code, PAN embedded, registration type.
- [ ] **Step 4:** Implement `GstinValidatorService` (regex + checksum + state lookup table).
- [ ] **Step 5:** Write the bank-verifier test: given a fake account+IFSC, the service returns `{ valid: true, name: '...', upiHandles: [...] }`.
- [ ] **Step 6:** Implement `BankVerifierService` behind an adapter interface. Default: Setu sandbox. Real CKYC provider swap is config.
- [ ] **Step 7:** Write the KycService test: `submitKyc(tenantId, input)` creates a `KycEntity` row in `PENDING`, enqueues a BullMQ job to verify, transitions to `VERIFIED` on success.
- [ ] **Step 8:** Implement `KycService` with the BullMQ job + retry policy (3 attempts, exp backoff, dead-letter).
- [ ] **Step 9:** Write the resolver test: `submitKyc(input)` requires `TenantGuard`. `kycStatus(tenantId)` returns the current state.
- [ ] **Step 10:** Implement the GraphQL resolver.
- [ ] **Step 11:** Write the migration: 2 new tables (`kyc_records`, `kyc_documents`), FKs to `tenants`, NOT VALID first then VALIDATE.
- [ ] **Step 12:** Wire `KycModule` into `AppModule.imports`.
- [ ] **Step 13:** Run `npx nx test onboarding --coverage` and `npx nx typecheck onboarding`. Both green.
- [ ] **Step 14:** `git commit -m "feat(onboarding): KYC verification (PAN + GSTIN + bank) with BullMQ async flow"`

**Acceptance:** `submitKyc` works end-to-end against the Setu sandbox. A merchant cannot place a COD order without a `VERIFIED` KYC state (enforce in `OrdersService`).

**Why this matters:** Indian logistics is **regulated**. GSTIN + PAN verification is required for tax invoicing. Bank account verification is required for COD remittance. This is the difference between "cool demo" and "I can sign up an actual merchant."

---

### Task 7.2 — GST + E-way bill integration

**Bead:** `SS-032` — GST invoicing + E-way bill generation
**Files:**
- Create: `libs/domains/billing/src/lib/gst/`
- Modify: `libs/domains/billing/src/lib/billing.module.ts`
- Create: `libs/domains/billing/src/lib/gst/gst-invoice.service.ts`
- Create: `libs/domains/billing/src/lib/gst/gst-rate-table.ts` (HSN code → rate lookup)
- Create: `libs/domains/billing/src/lib/gst/gst-invoice.entity.ts`
- Create: `libs/domains/billing/src/lib/gst/gst-eway-bill.service.ts` (ClearTax/IRIS adapter)
- Create: `libs/domains/billing/src/lib/gst/__tests__/gst-invoice.service.spec.ts`
- Create: `libs/domains/billing/src/lib/gst/__tests__/gst-eway-bill.service.spec.ts`
- Migration: `libs/platform/typeorm/src/lib/migrations/1718160000011-AddGstInvoiceTables.ts`

**Steps:**
- [ ] **Step 1:** Write `GstInvoiceService` test: `generateInvoice(tenantId, orderId)` returns a GST-compliant `InvoiceEntity` with HSN code, CGST/SGST/IGST split, supply state, place-of-supply.
- [ ] **Step 2:** Implement the service: HSN rate table (load from JSON, 5%, 12%, 18%, 28% slabs for common shipping HSN codes), state→state→IGST vs intra-state CGST+SGST logic.
- [ ] **Step 3:** Write the E-way bill test: given a shipment with `invoiceValue > ₹50,000`, the service generates an E-way bill via the adapter. Below threshold: returns `null`.
- [ ] **Step 4:** Implement `GstEwayBillService` behind the `GstEwayProviderAdapter` interface. Default: ClearTax sandbox. Adapter pattern means we can swap to IRIS, Cygnet, etc.
- [ ] **Step 5:** Write the migration: `gst_invoices` (FK to invoices), `gst_eway_bills` (FK to shipments), with ewb_no UNIQUE.
- [ ] **Step 6:** Wire into `AppModule`.
- [ ] **Step 7:** Test: `npx nx test billing --testPathPattern=gst`. Green.
- [ ] **Step 8:** `git commit -m "feat(billing): GST invoicing + E-way bill (ClearTax adapter)"`

**Acceptance:** A `VERIFIED` KYC merchant with a non-trivial order gets a real GST invoice (with HSN, tax split) and an E-way bill when the value crosses the threshold.

---

### Task 7.3 — RMA lifecycle (return state machine + photo upload + refund-method picker)

**Bead:** `SS-021` (already exists, expand scope) — End-customer return portal
**Files:**
- Modify: `libs/domains/returns/src/lib/` (entire lib)
- Create: `libs/domains/returns/src/lib/rma/rma.entity.ts`
- Create: `libs/domains/returns/src/lib/rma/rma-event.entity.ts` (audit trail)
- Create: `libs/domains/returns/src/lib/rma/rma.service.ts`
- Create: `libs/domains/returns/src/lib/rma/rma.resolver.ts`
- Create: `libs/domains/returns/src/lib/rma/rma.input.ts`
- Create: `libs/domains/returns/src/lib/rma/rma.model.ts`
- Create: `libs/domains/returns/src/lib/rma/rma-state-machine.ts`
- Create: `libs/domains/returns/src/lib/rma/__tests__/rma.service.spec.ts`
- Create: `libs/domains/returns/src/lib/rma/__tests__/rma-state-machine.spec.ts`
- Create: `apps/web/app/return/[token]/page.tsx` (public return portal, no auth)
- Create: `apps/web/app/api/return/photo/route.ts` (presigned S3 upload)
- Migration: `libs/platform/typeorm/src/lib/migrations/1718160000012-AddRmaTables.ts`

**State machine:**
```
REQUESTED → APPROVED → IN_TRANSIT → RECEIVED → QC_PASSED → REFUND_INITIATED → CLOSED
                              ↘ QC_FAILED → DISPUTE → CLOSED
              ↘ REJECTED (no return)
```

**Steps:**
- [ ] **Step 1:** Write the state machine test: every transition is a unit test, with valid + invalid transitions.
- [ ] **Step 2:** Implement the state machine.
- [ ] **Step 3:** Write the service test: `createRma(tenantId, orderId, items, reason)` creates a `RmaEntity` + first event, returns a public tracking token.
- [ ] **Step 4:** Implement `RmaService` with the event sourcing pattern (every transition writes an `RmaEventEntity` row).
- [ ] **Step 5:** Write the resolver test: `createRma`, `approveRma`, `rejectRma`, `markReceived`, `markQcResult`, `initiateRefund` — all tenant-scoped, all with role checks.
- [ ] **Step 6:** Implement the resolver.
- [ ] **Step 7:** Write the public return portal page test: visiting `/return/<token>` shows order items, reason picker, photo upload, refund method (wallet / original payment / bank transfer).
- [ ] **Step 8:** Build the public return portal (Next.js, no auth — token in URL).
- [ ] **Step 9:** Wire the photo upload to a presigned S3 URL (use existing `STORAGE_DRIVER=s3` config).
- [ ] **Step 10:** Wire refund initiation: wallet credit (existing wallet ledger) OR original payment (Stripe/Razorpay refund) OR bank transfer (NEFT — queue for ops).
- [ ] **Step 11:** Migration: `rma_requests`, `rma_events`, `rma_photos` (S3 key + metadata).
- [ ] **Step 12:** Wire into `AppModule`.
- [ ] **Step 13:** Tests: `npx nx test returns --coverage`. Green.
- [ ] **Step 14:** `git commit -m "feat(returns): full RMA lifecycle with public portal + state machine + photo upload"`

**Acceptance:** A customer can request a return without logging in (token-based), the merchant can approve/reject, QC happens with photo evidence, and refund lands in the right place. Every transition is auditable.

---

### Task 7.4 — COD reconciliation with banks

**Bead:** `SS-033` — COD remittance + reconciliation
**Files:**
- Modify: `libs/domains/billing/src/lib/`
- Create: `libs/domains/billing/src/lib/cod-remittance/cod-remittance.entity.ts`
- Create: `libs/domains/billing/src/lib/cod-remittance/cod-remittance.service.ts`
- Create: `libs/domains/billing/src/lib/cod-remittance/cod-bank-statement-parser.ts` (CSV/Excel parsers per bank format)
- Create: `libs/domains/billing/src/lib/cod-remittance/cod-reconciliation.service.ts`
- Create: `libs/domains/billing/src/lib/cod-remittance/cod-dispute.service.ts`
- Create: `libs/domains/billing/src/lib/cod-remittance/__tests__/cod-reconciliation.service.spec.ts`
- Create: `libs/domains/billing/src/lib/cod-remittance/cron/cod-remittance-cron.service.ts` (daily reconciliation trigger)
- Migration: `libs/platform/typeorm/src/lib/migrations/1718160000013-AddCodRemittanceTables.ts`

**Steps:**
- [ ] **Step 1:** Write the entity: `CodRemittanceEntity` (one row per courier COD deposit: courier, period, amount, deposit_date, status: PENDING/RECEIVED/RECONCILED/DISPUTED).
- [ ] **Step 2:** Write the bank statement parser test: given an HDFC CSV, return normalized records (date, amount, ref, narration).
- [ ] **Step 3:** Implement parsers for top-5 Indian banks (HDFC, ICICI, SBI, Axis, Kotak) — format adapters in a registry.
- [ ] **Step 4:** Write the reconciliation test: given a courier remittance list + a bank statement, match within ±3 days and ±₹0 amount, return matched/unmatched with reasons.
- [ ] **Step 5:** Implement the reconciliation engine (fuzzy match on ref + amount, exact match on date).
- [ ] **Step 6:** Write the dispute test: unmatched rows create `CodDisputeEntity` rows for ops review.
- [ ] **Step 7:** Implement `CodDisputeService` (status: OPEN/UNDER_REVIEW/RESOLVED, comments, evidence).
- [ ] **Step 8:** Write the cron service test: triggers daily at 06:00 IST, runs reconciliation, emails the ops team a summary.
- [ ] **Step 9:** Implement the cron.
- [ ] **Step 10:** Migration: `cod_remittances`, `cod_disputes` with proper indexes (courier_id, deposit_date).
- [ ] **Step 11:** Wire into `AppModule`.
- [ ] **Step 12:** Tests: green.
- [ ] **Step 13:** `git commit -m "feat(billing): COD reconciliation engine with dispute queue"`

**Acceptance:** A courier sends a COD remittance; the system matches it against bank statement; discrepancies create a dispute ticket; ops can resolve and credit the wallet.

---

### Task 7.5 — Mobile PWA + native shell (Phase 1: PWA, Phase 2: React Native)

**Bead:** `SS-034` — Mobile app (PWA → React Native)
**Phase 1 (weeks 1-2):** PWA in `apps/admin-portal/`
**Phase 2 (weeks 3-4):** React Native in `apps/mobile/`

**Files (Phase 1):**
- Modify: `apps/admin-portal/next.config.js` (PWA plugin)
- Create: `apps/admin-portal/public/manifest.json`
- Create: `apps/admin-portal/public/icons/` (192px, 512px, maskable)
- Create: `apps/admin-portal/public/sw.js` (service worker)
- Modify: `apps/admin-portal/app/layout.tsx` (PWA meta tags)

**Steps (Phase 1):**
- [ ] **Step 1:** Add `@ducanh2912/next-pwa` to `apps/admin-portal/package.json`.
- [ ] **Step 2:** Create `manifest.json` with name, short_name, icons, theme_color, start_url.
- [ ] **Step 3:** Generate icon set (192px, 512px, maskable 512px).
- [ ] **Step 4:** Configure PWA in `next.config.js` with proper cache strategies (stale-while-revalidate for assets, network-first for API).
- [ ] **Step 5:** Test install on Chrome DevTools (Lighthouse PWA audit ≥ 90).
- [ ] **Step 6:** `git commit -m "feat(admin-portal): PWA install + offline support"`

**Files (Phase 2):**
- Create: `apps/mobile/` (new Nx app)
- Files: `package.json`, `tsconfig.json`, `app.json`, `App.tsx`, `screens/Dashboard.tsx`, `screens/Orders.tsx`, `screens/Tracking.tsx`

**Steps (Phase 2):**
- [ ] **Step 1:** Scaffold Expo app in `apps/mobile/`.
- [ ] **Step 2:** Add Apollo Client + auth (JWT in secure storage).
- [ ] **Step 3:** Build the 3 screens: dashboard, orders list, tracking detail.
- [ ] **Step 4:** Add push notifications (Expo push).
- [ ] **Step 5:** Add biometric auth (FaceID / fingerprint).
- [ ] **Step 6:** EAS build config for iOS + Android.
- [ ] **Step 7:** TestFlight internal beta + Google Play internal track.
- [ ] **Step 8:** `git commit -m "feat(mobile): Expo app with dashboard + orders + tracking"`

**Acceptance:** A merchant installs the PWA from Chrome on Android, gets a home-screen icon, opens the app, and sees their dashboard. On iOS they can add to home screen the same way. The native app is in TestFlight for anchor-tenant beta.

---

## Pillar 8 — Reliability & Trust (4 weeks)

### Task 8.1 — Load test (k6, 10K req/s target)

**Bead:** `SS-035` — Load testing
**Files:**
- Create: `loadtest/k6/scenarios/order-create.js`
- Create: `loadtest/k6/scenarios/rate-shop.js`
- Create: `loadtest/k6/scenarios/graphql-rps.js`
- Create: `loadtest/k6/lib/seed.js` (test data seeding)
- Create: `loadtest/README.md`

**Scenarios:**
1. `order-create.js` — 1K RPS, ramp 0→1000 over 60s, sustain 5 min. Target p99 < 500ms.
2. `rate-shop.js` — 5K RPS, sustain 10 min. Target p99 < 200ms (rate cache hits should dominate).
3. `graphql-rps.js` — mixed queries at 10K RPS. Target p99 < 300ms.

**Steps:**
- [ ] **Step 1:** Write the seed script: creates 100 test tenants, 10K test orders, 100K tracking events.
- [ ] **Step 2:** Write `order-create.js` with proper auth (tenant JWT), payload reuse, k6 checks.
- [ ] **Step 3:** Write `rate-shop.js` (use the public endpoint, no auth).
- [ ] **Step 4:** Write `graphql-rps.js` with a mix of queries matching real distribution (rate-shop 40%, order-list 30%, tracking 20%, other 10%).
- [ ] **Step 5:** Run each scenario, capture JSON output to `loadtest/results/`.
- [ ] **Step 6:** Document the findings in `loadtest/README.md`: which queries blow p99, which saturate Postgres, which saturate Redis.
- [ ] **Step 7:** Add `npm run loadtest:order-create` etc. to root `package.json`.
- [ ] **Step 8:** `git commit -m "test(load): k6 scenarios for order-create / rate-shop / graphql at 10K RPS"`

**Acceptance:** Baseline numbers captured. The bottleneck (Postgres connection pool, GraphQL resolver, Redis throughput) is identified with evidence, and a follow-up backlog item is filed.

---

### Task 8.2 — Chaos test (Redis down, Postgres failover, carrier timeouts)

**Bead:** `SS-036` — Chaos engineering
**Files:**
- Create: `chaos/scenarios/redis-down.js` (uses ioredis-mock + manual disconnect)
- Create: `chaos/scenarios/postgres-failover.js` (uses testcontainers restart)
- Create: `chaos/scenarios/carrier-timeout.js` (proxy-mock that delays 30s)
- Create: `chaos/README.md`

**Steps:**
- [ ] **Step 1:** Write `redis-down.js`: kill Redis, watch the app for 60s. Expected: rate-shop falls back to in-memory LRU + 503 on writes; health check flips to `/healthz` returns 503.
- [ ] **Step 2:** Write `postgres-failover.js`: restart Postgres primary, watch replica promotion. Expected: connection drops retry with backoff; after promotion, writes resume within 30s.
- [ ] **Step 3:** Write `carrier-timeout.js`: stub a 30s delay in Delhivery adapter. Expected: circuit breaker trips, rate-shop returns 3 quotes (the other carriers), label generation fails with explicit error.
- [ ] **Step 4:** Document expected vs actual in `chaos/README.md`. File follow-up beads for every gap.
- [ ] **Step 5:** `git commit -m "test(chaos): redis / postgres / carrier timeout scenarios"`

**Acceptance:** The system has a known failure mode for every chaos scenario, and the runbook (`/docs/runbooks/`) has the response procedure.

---

### Task 8.3 — Status page + Sentry + audit log + correlation IDs

**Bead:** `SS-028` (already exists) — observability polish
**Files:**
- Modify: `libs/observability/src/lib/logger.service.ts` (add correlation ID injection)
- Modify: `apps/api/src/main.ts` (request ID middleware)
- Create: `libs/observability/src/lib/audit-log.service.ts`
- Create: `libs/observability/src/lib/audit-log.interceptor.ts`
- Create: `apps/api/src/health/health.controller.ts` (existing? add if not)
- Create: `apps/status-page/` (new Nx app — public status page)

**Steps:**
- [ ] **Step 1:** Add `nestjs-request-context` or build a small AsyncLocalStorage wrapper. Inject `X-Request-Id` from inbound headers, generate one if absent.
- [ ] **Step 2:** Modify `StructuredLogger` to log `requestId` on every line.
- [ ] **Step 3:** Write the audit log service test: every state-changing GraphQL mutation writes an `AuditLogEntity` row with `actorId`, `tenantId`, `action`, `resourceType`, `resourceId`, `before`, `after`, `ipAddress`.
- [ ] **Step 4:** Implement `AuditLogService` + interceptor (apply globally to all `@Mutation` resolvers).
- [ ] **Step 5:** Sentry SDK init in `main.ts` with `environment`, `release`, `tracesSampleRate=0.1`, `profilesSampleRate=0.1`.
- [ ] **Step 6:** Status page: status.swiftship.ai — minimal Next.js page that hits `/healthz` and `/readyz` on the API, shows green/yellow/red. Deploy to a separate Fly.io / Railway / Vercel instance.
- [ ] **Step 7:** Tests: `npx nx test observability --coverage`. Green.
- [ ] **Step 8:** `git commit -m "feat(observability): correlation IDs, audit log, Sentry, status page"`

**Acceptance:** Every mutation is auditable with who/when/what-changed. Every log line carries a request ID. Sentry catches unhandled errors. The status page is live.

---

### Task 8.4 — Public API documentation (Postman + OpenAPI + getting-started)

**Bead:** `SS-037` — Public docs
**Files:**
- Create: `docs/public-api/` (Markdown getting-started, auth, rate-limits, errors)
- Create: `docs/openapi/swagger.yaml` (regenerated from GraphQL + REST)
- Create: `postman/SwiftShip.postman_collection.json`
- Create: `postman/SwiftShip.postman_environment.json`

**Steps:**
- [ ] **Step 1:** Generate OpenAPI from the existing REST controllers (use `@nestjs/swagger` if not already; or tsoa).
- [ ] **Step 2:** Manually author GraphQL schema reference (do not hand-edit the auto-generated `apps/api/src/schema.graphql` — use that as source of truth).
- [ ] **Step 3:** Author `docs/public-api/getting-started.md`, `docs/public-api/authentication.md`, `docs/public-api/rate-limits.md`, `docs/public-api/errors.md`, `docs/public-api/webhooks.md`.
- [ ] **Step 4:** Build the Postman collection: order-create, rate-shop, tracking, label generation, RMA, wallet top-up — all with example payloads + tests.
- [ ] **Step 5:** `git commit -m "docs(public-api): OpenAPI spec + Postman collection + getting-started"`

**Acceptance:** A new integrator can sign up, get an API key, hit the Postman "Run collection" button, and ship in <30 min. The OpenAPI spec is hosted at `/api/v1/openapi.json` and viewable at `/api/v1/docs`.

---

## Pillar 9 — Differentiation & Growth (6 weeks)

### Task 9.1 — NDR analytics dashboard

**Bead:** `SS-038` — NDR analytics
**Files:**
- Modify: `libs/domains/ndr/src/lib/`
- Create: `libs/domains/ndr/src/lib/analytics/ndr-analytics.service.ts`
- Create: `libs/domains/ndr/src/lib/analytics/ndr-analytics.resolver.ts`
- Create: `libs/domains/ndr/src/lib/analytics/__tests__/ndr-analytics.service.spec.ts`
- Modify: `apps/admin-portal/app/dashboard/ndr-analytics/page.tsx`

**Steps:**
- [ ] **Step 1:** Write the service test: `getNdrBreakdown(tenantId, range)` returns top N reasons with `{ reason, count, recoveryRate, avgAttempts }`.
- [ ] **Step 2:** Implement the service — query `ndr_events` table with `where: { tenantId, createdAt: between(...) }`, group by reason.
- [ ] **Step 3:** Write the resolver: `ndrAnalytics(tenantId, range)`, `ndrByPincode`, `ndrByCourier`, `ndrByTimeOfDay` — the 4 dashboards a merchant wants.
- [ ] **Step 4:** Build the admin portal dashboard with recharts.
- [ ] **Step 5:** `git commit -m "feat(ndr): analytics dashboard — breakdown by reason / pincode / courier / time"`

**Acceptance:** A merchant can see "I'm losing 8% of orders to NDR reason X with courier Y in pincode Z" and act on it.

---

### Task 9.2 — WhatsApp + SMS + email fallback reliability

**Bead:** `SS-018` (already exists) — expand scope
**Files:**
- Modify: `libs/domains/notifications/src/lib/`
- Create: `libs/domains/notifications/src/lib/channels/whatsapp.service.ts` (WATI adapter)
- Create: `libs/domains/notifications/src/lib/channels/sms.service.ts` (existing + retry)
- Create: `libs/domains/notifications/src/lib/channels/email.service.ts` (existing + retry)
- Create: `libs/domains/notifications/src/lib/notification-router.service.ts` (channel preference + fallback)
- Create: `libs/domains/notifications/src/lib/notification-delivery.entity.ts`
- Migration: `libs/platform/typeorm/src/lib/migrations/1718160000014-AddNotificationDeliveryTable.ts`

**Steps:**
- [ ] **Step 1:** Write the WATI adapter test: given a phone + template, the service sends and returns `messageId`.
- [ ] **Step 2:** Implement WATI (and a `WhatsAppProviderAdapter` interface so we can swap to Gupshup, Karix, etc.).
- [ ] **Step 3:** Write the router test: `send(trackingUpdate, tenantId)` — tries WhatsApp first (tenant preference), falls back to SMS, falls back to email. Each fallback on the previous one's failure (with retry budget).
- [ ] **Step 4:** Implement the router with retry + dead-letter.
- [ ] **Step 5:** Wire all shipment status changes through the router.
- [ ] **Step 6:** Tests: green.
- [ ] **Step 7:** `git commit -m "feat(notifications): WATI + SMS + email fallback with retry + delivery log"`

**Acceptance:** A tracking update delivers on the best available channel. If WhatsApp is down, SMS gets it within 2 min. Delivery status is auditable.

---

### Task 9.3 — Anchor tenant pilot (the 5K-orders/day merchant)

**Bead:** `SS-039` — Anchor tenant pilot
**Files:**
- Create: `docs/anchor-tenant-pilot.md` (the playbook)
- Create: `scripts/tenant-onboarding-dryrun.sh`

**Steps:**
- [ ] **Step 1:** Identify 3 candidate anchor tenants (D2C brands doing 3K-10K orders/day, currently on Shiprocket, willing to migrate).
- [ ] **Step 2:** Build the dry-run script: provisions the tenant, creates API key, runs the Postman collection, generates a fake GST invoice, fires a fake tracking event, simulates a COD remittance.
- [ ] **Step 3:** Document the migration playbook: data import (orders, products, customers), DNS setup (branded tracking), webhook validation, billing setup, KYC submission.
- [ ] **Step 4:** Pick tenant #1, run them through dry-run in staging.
- [ ] **Step 5:** Go-live, on-call rotation for 2 weeks.
- [ ] **Step 6:** Post-mortem every incident, file follow-up beads.
- [ ] **Step 7:** `git commit -m "docs(pilot): anchor-tenant playbook + dry-run script"`

**Acceptance:** One tenant is live, doing ≥5K orders/day, and we've measured our actual uptime, p99, and support-ticket rate for 2 weeks.

---

## Cross-cutting: parallel work schedule

The 90-day schedule assumes **parallel execution** (the same pattern that closed 26/30 beads in 5 days).

| Week | Track A (shim) | Pillar 7 | Pillar 8 | Pillar 9 |
|---|---|---|---|---|
| 1 | A.0 + A.1 (billing) | 7.1 KYC | — | — |
| 2 | A.2 (cod) | 7.1 KYC (continue) | — | — |
| 3 | A.3 (manifests) | 7.2 GST | — | — |
| 4 | A.4 (onboarding) | 7.2 GST (continue) | 8.1 load test | — |
| 5 | A.5 (orders) | 7.3 RMA start | 8.1 load test (continue) | 9.1 NDR analytics |
| 6 | A.6 (payments) | 7.3 RMA (continue) | 8.2 chaos test | 9.1 NDR analytics (continue) |
| 7 | A.7 (pickups) | 7.4 COD recon | 8.3 status page + Sentry | 9.2 WhatsApp/SMS/email |
| 8 | A.8 (shipments) | 7.4 COD recon (continue) | 8.3 (continue) | 9.2 (continue) |
| 9 | A.9 (users + identity) | 7.5 Mobile PWA | 8.4 public docs | 9.2 (continue) |
| 10 | A.10 delete shim | 7.5 Mobile (Expo) | 8.4 (continue) | 9.3 anchor tenant pilot |
| 11-12 | — | — | — | 9.3 anchor tenant (continue) |

---

## Acceptance criteria for the whole plan

1. **Track A complete:** `grep -r "@prisma/client" libs/` returns 0. Build + test + lint + typecheck + e2e all green.
2. **Pillar 7 complete:** KYC + GST + E-way + RMA + COD reconciliation + Mobile PWA all shipped behind feature flags. A test merchant can sign up → verify KYC → place COD order → receive GST invoice → request return → receive refund.
3. **Pillar 8 complete:** Load test baseline captured. Chaos test runbook documented. Sentry catching errors. Status page live. Public docs (Postman + OpenAPI) published.
4. **Pillar 9 complete:** NDR analytics dashboard live. WhatsApp/SMS/email fallback reliable. One anchor tenant in production doing 5K+ orders/day for 2+ weeks.

**Strategic outcome:** SwiftShip is at feature parity with Shiprocket on the seller-facing surface, with 3-5 moats Shiprocket doesn't have (explainable courier scoring, public rate-shop widget, GST+E-way+KYC done right, RMA flow, and a tenant-aware architecture that's structurally cheaper to maintain). The remaining differentiator is operational excellence — uptime, support, brand — which is what the 90 days after this 90-day plan are for.

---

## Bead IDs and their new home

This plan adds the following beads to `.beads/issues.jsonl`:

- **Track A (Prisma shim):** `SS-040` through `SS-049` (10 beads, one per lib + the delete-shim gate)
- **Pillar 7:** `SS-031` (KYC), `SS-032` (GST+E-way), `SS-033` (COD recon), `SS-034` (Mobile)
- **Pillar 8:** `SS-035` (Load test), `SS-036` (Chaos test), `SS-037` (Public docs)
- **Pillar 9:** `SS-038` (NDR analytics), `SS-039` (Anchor pilot)

Total new beads: **13** (4 existing-open are expanded, not duplicated). These slot into Pillars 7-9 of the roadmap and run in parallel with the 4 existing open beads (SS-018, SS-019, SS-020, SS-021, SS-022, SS-026, SS-027, SS-028).
