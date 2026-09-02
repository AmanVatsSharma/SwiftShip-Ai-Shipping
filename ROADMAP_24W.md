# SwiftShip AI — 24-week roadmap to Shiprocket threat

> **STATUS (2026-06 audit): ALL 9 PILLARS ARE COMPLETE.** Every bead in
> `.beads/issues.jsonl` (65/65) is closed — Pillars 1–6 below plus Pillars 7–9
> (compliance/RMA/COD recon, reliability, growth) and the TypeORM Track A
> (SS-040…SS-044, shim deleted). The last landed work was the SS-027 SDK epic
> (public REST + Node/Python/PHP SDKs + `/docs/v1/` Swagger UI) and SS-026
> channel sync, both on 2026-06-17.
>
> **This file is now the record of what was planned and shipped.** For what is
> actually broken in the tree right now and the recommended resume order, read
> [`STATUS.md`](./STATUS.md). Nothing below should be treated as pending work
> except where STATUS.md repeats it.

> Goal: ship a category-leading Indian shipping SaaS in 24 weeks, with multi-tenant
> architecture, live AI rate shopping, NDR/RTO automation, branded customer surfaces,
> and the channel integrations Indian D2C brands actually use.
>
> All work lives in this Nx monorepo. ~~The Prisma → TypeORM migration stays a
> parallel track~~ (done — SS-044 deleted the shim on 2026-06-16).

## Pillar 1 — Tenancy (weeks 1-4, cross-cutting)

The single biggest gap vs Shiprocket. Every other feature needs a `tenantId` to
be billable, throttled, and feature-flagged. Do this first.

### W1 — Tenant model + resolution
- New `libs/domains/tenants/` with: `TenantEntity`, `TenantMemberEntity`, `TenantRoleEntity`, `TenantFeatureFlagEntity`, `TenantApiKeyEntity`, `TenantInvoiceEntity`, `TenantSubscriptionEntity`.
- `TenantContext` (request-scoped) populated by `TenantResolverMiddleware` that reads either the JWT claim or the `X-SwiftShip-Api-Key` header.
- `TenantGuard` — GraphQL guard that throws 403 if the request is unauthenticated or the tenant is suspended.
- `TenantFeatureFlagService` — read-through cache, with a `flag(tenantId, key, default)` API.
- Migration: every entity gains a `tenantId: number` column with a non-null constraint + index. Use a single TypeORM migration. Backfill the existing rows with a default `tenantId = 1` ("system tenant" — single-tenant installs run in this).

### W2 — Per-tenant rate limits + throttler
- Extend `@nestjs/throttler` storage to Postgres (instead of in-memory) so limits hold across API instances.
- `TenantThrottlerGuard` — overrides the default guard, looks up `tenantId` from `TenantContext`, reads `tenantTier` from the tenant, picks the bucket size (Starter: 60/min, Growth: 300/min, Pro: 1000/min, Enterprise: 10000/min).
- Quota headers in the response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

### W3 — Per-tenant billing (wallet + invoices)
- `WalletEntity` — one per tenant, with `availableBalance`, `reservedBalance`, `lifetimeRecharged`.
- `WalletLedgerEntity` — every credit/debit row (idempotency-keyed, double-entry).
- Mutations: `topUpWallet(input)`, `transferBetweenWallets`, `lockFunds(input)`, `releaseFunds`, `walletStatement(filter)`.
- Auto-deduct: courier label generation, NDR-reattempt call, branded-tracking-page custom domain, WhatsApp message.
- `BillingService` (already exists) extended to invoice the wallet top-up with GST split.

### W4 — Tenant onboarding + sub-accounts
- `onboardTenant(input)` mutation — creates tenant + first user + wallet with free credit + default API key.
- `inviteTeamMember(email, role)` + `acceptInvite(token)`.
- `rotateApiKey(oldKeyId)`.
- Sub-account model: a tenant can have child tenants (e.g. an agency managing multiple D2C brands), each with its own wallet, API keys, and feature flags.

**W4 deliverable:** a second tenant can sign up via the GraphQL mutation, get its own JWT, hit `/graphql`, see only its own orders/shipments, get a different rate-limit bucket, and receive a wallet top-up invoice.

## Pillar 2 — Live rate shopping + AI ranking (weeks 5-12)

The crown jewel. Shiprocket's biggest lock-in is its rate engine. We have to beat
it, not just match it.

### W5-W6 — Expand the carrier adapter contract
- New interface methods in `libs/platform/carriers/src/lib/adapter.interface.ts`:
  - `getRates(req: RateQuoteRequest): Promise<RateQuote[]>` — every adapter implements this against its own rate API. Fallback to the static rate card if the live call fails.
  - `getServiceability(pincode, paymentMethod, weight): Promise<ServiceabilityResult>` — already exists for some carriers, normalize the contract.
  - `schedulePickup(...)`, `cancelPickup(...)` — already in some adapters, normalize.
  - `markCodCollected(...)` — push to carrier so we can reconcile.
  - `getNdrActions(shipmentId)` — carrier-specific actions (reattempt date, address change, etc.).
- Per-adapter implementation work for: Delhivery, BlueDart, Xpressbees, DTDC, Ecom Express, Shadowfax, FedEx India, Gati. 8 adapters × ~3 days = 24 days, parallelized across 3 engineers.
- Add `DhlAdapter`, `AramexAdapter`, `IndiaPostAdapter`, `ProfessionalCouriersAdapter` — 4 international/regional carriers Shiprocket has that we don't.

### W7 — Rate cache + circuit breaker
- `RateCacheService` — Redis-backed, 10-min TTL, keyed by `(originPincode, destPincode, weight, paymentMethod, carrier)`.
- `CarrierCircuitBreaker` per carrier — if 3 of last 10 rate calls fail, open for 60s; half-open after that. Use `opossum`.
- Background `rate-prewarm` worker — for the top 100 origin×destination pairs per tenant, re-fetch every 30 min so live pricing is always warm.

### W8 — Ranking engine
- New `libs/domains/rate-engine/` with `RateRankingService`:
  - Inputs: `RateQuote[]` (from multiple carriers) + tenant preferences (cheapest / fastest / sla-bound / courier-score / lowest-rto-rate).
  - Score = `α · normalizedCost + β · slaScore + γ · courierScore + δ · rtoRatePenalty` — weights per tenant.
  - Courier score = 30-day rolling (delivery rate × on-time rate × NDR resolution rate).
  - `pickForOrder(orderId, mode)` — returns the top-1 carrier (or top-N if asked).
  - Persist every decision to `RateDecisionEntity` for the audit trail + "why was this courier chosen?" view.

### W9 — Weight-break + zone + surcharge math
- Move the surcharge logic out of the static rate card and into a real engine:
  - `WeightBreakCalculator` — given weight, find the right slab (250g / 500g / 1kg / 2kg / 5kg / 10kg) and per-kg rate.
  - `ZoneCalculator` — origin state + dest state → zone (A/B/C/D/E/North-East/J&K).
  - `SurchargeApplier` — COD surcharge, fuel surcharge (% based on monthly diesel index), remote-area surcharge, insurance, handling fee.
- `SurchargeEntity` extended with a `kind` enum (`WEIGHT_BREAK` | `ZONE` | `COD` | `FUEL` | `REMOTE` | `INSURANCE` | `HANDLING`).
- Live fuel surcharge pulled from a daily cron (`fuel-surcharge-pull` worker) — the MyPetrolPrice RSS for diesel price in metro cities, then a deterministic formula.

### W10 — SLA + courier scoring
- `SlaMetricsService` (extends the existing dashboard lib) — per-carrier per-zone:
  - Average TAT (days) over last 30/60/90 days
  - On-time delivery rate
  - NDR rate
  - RTO rate
  - Damage rate (from returns)
  - Delivered-to-attempted ratio
- `CourierScorecard` — the composite score used by the ranking engine.
- Backfill: run this computation over the last 90 days of `ShipmentEntity` rows once on first deploy.

### W11 — A/B simulator
- `simulateRates(orders, courierOptions)` — given a batch of historical orders, what would the cost/SLA have been with each courier choice? Returns the optimal split.
- Surface in the admin portal as "What if you'd used Xpressbees for North-East shipments? You'd save ₹X / lose Y days on average."
- This is a Shiprocket-killer feature. They don't have it.

### W12 — Public rate-shop endpoint + rate-card publish
- Unauthenticated `publicRateShop(input)` mutation — for the merchant's own checkout widget, returns a stripped RateQuote (no internal scores, no carrier scores, just price + ETA + branded courier name).
- Embeddable JS widget: `<script src="https://cdn.swiftship.ai/rate-shop.js" data-tenant="acme"></script>` — drops a courier selector into any checkout.
- Rate-card publish: every tenant can publish a public rate-card page (`/r/<tenant-slug>`) for their resellers to see negotiated rates.

**W12 deliverable:** the AI ranking engine picks a courier for every new order, backed by real carrier rates, with a sub-100ms p95 latency for the top-1 decision, and a public widget the merchant can drop into their site.

## Pillar 3 — NDR + RTO automation (weeks 13-15)

NDR is the #1 cost saver. Indian D2C brands lose 8-15% of COD orders to RTO. We have to
automate the entire NDR cycle.

### W13 — NDR ingestion + state machine
- New `NdrStatus` enum: `RAISED` → `ACTION_REQUESTED` → `CUSTOMER_RESPONDED` → `OUT_FOR_DELIVERY` → `RESOLVED` / `RTO_INITIATED`.
- `NdrIngestWorker` — pulls NDR feeds from every carrier every 15 min (Delhivery webhook, others polling).
- `NdrActionService` — generates the recommended action per NDR: `REATTEMPT`, `CHANGE_ADDRESS`, `CANCEL`, `OPEN_DISPUTE`. Based on past NDR resolutions from the same customer.

### W14 — WhatsApp + calling automation
- `WhatsappProvider` (WATI or Gupshup) — sends interactive messages on NDR: "Your order is at the wrong address. Confirm the new address or reschedule delivery?"
- `CallingProvider` (Exotel or Ozonetel) — voice call fallback when WhatsApp doesn't get a reply in 2 hours.
- `NdrBot` — orchestrates the channel choice, retry policy, and quiet hours.
- Per-tenant enable/disable + per-tenant template approval flow.

### W15 — RTO state machine + wallet credit
- New `RtoStatus` enum: `INITIATED` → `PICKED_UP` → `IN_TRANSIT` → `DELIVERED` → `INSPECTED` → `RESTOCKED` / `DAMAGED`.
- `RtoReconcileWorker` — pulls RTO events from carriers, auto-credits the wallet for the COD amount minus the RTO charge (per carrier RTO fee schedule).
- Dispute queue for RTOs that the merchant disputes ("I never got the return back").

**W15 deliverable:** 70% of NDRs auto-resolved within 4 hours, 100% of RTO COD amounts reconciled into the wallet within 48 hours of RTO delivery.

## Pillar 4 — Customer-facing surfaces (weeks 16-18)

The merchant's customer. This is where Shiprocket's tracking page and return flow
live. Our version has to be branded, fast, and self-serve.

### W16 — Branded tracking page
- Public route at `swiftship.ai/track/<tenant-slug>?awb=...` (Next.js SSR).
- Per-tenant branding: logo, color, support phone, support WhatsApp link, FAQ.
- Live tracking via Socket.IO (`trackingUpdates` subscription, already exists).
- "Request reattempt" button → fires an NDR action.
- "Request return" button → starts the return flow (W17).
- SEO: static HTML, no client JS for the basic lookup, Open Graph tags for shareability.

### W17 — End-customer return portal
- Public route at `swiftship.ai/return/<token>` (token generated when the merchant issues a return).
- Customer picks the return reason (sized-too-small / damaged / wrong-item / not-as-described / other).
- Customer uploads 1-3 photos.
- Customer picks refund method (original / wallet credit / exchange).
- Backend creates the RTO shipment and schedules a reverse pickup.
- All of this is per-tenant branded, embeddable as a widget.

### W18 — Embeddable widgets
- `rate-shop.js` (built in W12)
- `tracking.js` — drops a tracking widget into the merchant's order-confirmation page
- `return.js` — drops a "request return" button
- All three widgets are < 30KB gzipped, no framework, CSP-friendly.

**W18 deliverable:** a merchant can go from "I just signed up" to "my customers have a branded tracking page" in under 10 minutes.

## Pillar 5 — Channel integrations (weeks 19-22)

Indian e-commerce volume lives on these channels. Each is a multi-week integration.
Pick the top three for the 24-week target.

### W19 — Amazon IN
- `AmazonAdapter` — SP-API (Selling Partner API) for orders, inventory, tracking push.
- OAuth install flow (LWA — Login with Amazon).
- Order pull every 5 min via the `Orders` SP-API endpoint.
- Tracking push via the `fulfillment` feed.
- Inventory sync via the `inventory` feed.

### W20 — Flipkart
- `FlipkartAdapter` — Flipkart Seller API for orders, shipping, returns.
- Order pull + tracking push.
- Returns reconciliation.

### W21 — Meesho + Myntra (parallel)
- `MeeshoAdapter` — Meesho Supplier Panel API. Bulk order pulls, single SKU catalog.
- `MyntraAdapter` — Myntra Partner API. Smaller volume but high-AOV.

### W22 — Channel-agnostic features
- `ChannelSyncService` — every adapter conforms to the same interface: `pullOrders`, `pushTracking`, `syncInventory`, `pullReturns`.
- Channel-specific settings UI in the admin portal.
- Per-channel courier assignment (use Shiprocket's delivery, not your own).
- Channel billing reconciliation: how much did Amazon deduct for shipping, how much did you charge the seller?

**W22 deliverable:** the merchant connects their Amazon + Flipkart + Meesho + Myntra accounts, all orders flow into one queue, one dashboard, one rate-shop, one wallet.

## Pillar 6 — Polish + DevEx (weeks 23-24)

The bar for "category leader attempt" is the last 10%. These are the things that
turn a working SaaS into a product people recommend.

### W23 — Public REST + GraphQL parity + SDKs
- `apps/api-public/` — a thin REST API (Express + tsoa) that mirrors the GraphQL surface. Webhook receivers + external integrators prefer REST.
- `@swiftship/node` SDK — official Node.js client, published to npm.
- `@swiftship/python` SDK — official Python client, published to PyPI.
- `@swiftship/php` SDK — official PHP client, published to Packagist.
- `Postman` collection, auto-generated from the GraphQL SDL.
- `OpenAPI` spec generated from the REST API.
- `AsyncAPI` spec generated from the GraphQL subscriptions.

### W24 — Observability + audit + Sentry + OTel
- `OpenTelemetry` SDK with traces, metrics, and logs.
- `Sentry` integration for error reporting (server + browser).
- `AuditLog` entity — every admin action (refund, void invoice, role change, key rotation) is logged with `actorId`, `tenantId`, `action`, `payload`, `ip`, `userAgent`, `correlationId`.
- `RequestIdMiddleware` — every request gets a `X-Request-Id` header, threaded through logs.
- Per-tenant health checks at `/health/<tenant-slug>`.
- Status page (use `Statuspage` or self-host with `upptime`).
- Incident playbook runbook in `RUNBOOK.md`.

**W24 deliverable:** a sandbox tenant, three SDKs, Sentry wired in, audit log searchable from the admin portal, and a public status page.

## Cross-cutting work (every week)

> Historical note: all of the below was applied during the build. The TypeORM
> bullet is complete (shim deleted in SS-044); the remaining `src/` → `libs/`
> decommission is tracked in [`MIGRATION.md`](./MIGRATION.md#9-the-remaining-src-to-libs-decommission).

- **Tenancy**: every new lib must be tenant-scoped from day 1. The `TenantGuard` is wired into `apps/api/src/app.module.ts` and is a hard prerequisite.
- **TypeORM migration**: ✅ done — one PrismaCompat-removal PR per week landed (SS-041…SS-044); the shim is gone.
- **Nx boundary**: every new lib has a `project.json`, `tsconfig.json`, `tsconfig.lib.json`, `package.json`, and an `index.ts` barrel from day 1. ESLint boundary rule is the gate. (Exception today: `ecommerce-integrations` lacks a `project.json` — see STATUS.md.)
- **Observability**: every new GraphQL resolver uses `StructuredLogger`, every new worker emits a metric.
- **Test coverage**: every new lib has a 70% line-coverage bar. E2E test in `apps/api-e2e/` for every new public mutation. (Known gap: only the health e2e suite exists — see STATUS.md.)
- **Docs**: every new lib updates `ARCHITECTURE.md` (lib map), `MIGRATION.md` (status), and `READY_FEATURES.md` (public surface).

## Risk register

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Carrier rate APIs are flaky / undocumented | High | Aggressive circuit breaker + static fallback; engage carrier partnerships early |
| WhatsApp provider onboarding takes weeks | Medium | WATI is fastest; have Gupshup as backup; design the adapter interface to be provider-agnostic |
| Amazon SP-API changes break our integration | Medium | Pin to a specific SP-API version, add a sandbox account for pre-prod testing |
| Multi-tenant data leak in a lib we forgot to scope | Medium | Lint rule: every `@InjectRepository` must be inside a class that depends on `TenantContext`. Add a code-review checklist. |
| Scope creep on the ranking engine | High | W8 = MVP ranking (cost + ETA). W10 adds scoring. W11 adds simulator. Don't ship W11 to prod. |
| SDK quality is a drag on the team | Medium | The SDKs are thin code-generated wrappers around the REST API. Use `openapi-generator`. |
| The TypeORM migration drags past W24 | Low | The compat shim is good enough that the migration is no longer blocking features. We can land it after W24. |

## What this gets us

> ✅ Shipped. All bullets below exist in the codebase (verified 2026-06 audit —
> see `READY_FEATURES.md` for the actual surface and `STATUS.md` for caveats).

After 24 weeks, SwiftShip AI is:
- **Multi-tenant** SaaS with per-tenant billing, throttling, and feature flags
- **AI-ranked live rate shopping** with sub-100ms p95, beating Shiprocket on speed
- **WhatsApp + calling NDR automation** resolving 70% of NDRs in 4 hours
- **Branded customer tracking + return portal** with embeddable widgets
- **4 channel integrations** (Amazon, Flipkart, Meesho, Myntra)
- **3 official SDKs** (Node, Python, PHP) + Postman + OpenAPI + AsyncAPI
- **OpenTelemetry + Sentry + audit log** for production-grade observability

That's a defensible threat to Shiprocket, not just a competitor.

## Pillar 7 — Compliance, RMA, COD reconciliation, Mobile (weeks 25-34)

The Shiprocket features that block real merchant onboarding and top support tickets.

### W25-26 — KYC + GST compliance
- SS-031: KYC (PAN + GSTIN + bank) verification with BullMQ async flow
- SS-032: GST invoicing + E-way bill generation (ClearTax adapter)
- Enforcement: OrdersService rejects COD orders from non-VERIFIED tenants
### W27-28 — RMA lifecycle
- SS-021 expanded: Full return state machine (request → approve → return → QC → refund)
- Public return portal (no auth, token-based): photo upload, refund method picker
### W29-30 — COD reconciliation
- SS-033: Bank statement parsing (HDFC/ICICI/SBI/Axis/Kotak), fuzzy match with courier deposits
- Dispute queue for ops review: unmatched rows + reason
### W31-34 — Mobile app
- SS-034: PWA install + offline (Phase 1, admin portal)
- React Native expo app (Phase 2, separate apps/mobile/)

**Deliverable:** A merchant can: sign up → verify KYC → place COD order → receive GST invoice → request return → get refund tracking → manage orders on mobile.

## Pillar 8 — Reliability & Trust (weeks 35-38)

The production SLA and trust infrastructure that prevents churn and support overload.

### W35 — Load test evidence
- SS-035: k6 scenarios at 10K RPS, identify bottlenecks
### W36 — Chaos engineering
- SS-036: Redis down, Postgres failover, carrier timeout scenarios
### W37-38 — Documentation & status
- SS-037: Public API docs (Postman + OpenAPI + getting-started)
- Live status page, Sentry, audit log with correlation IDs

**Deliverable:** Baseline SLA metrics, known failure modes for every incident type, and docs that let an integrator ship in <30 min.

## Pillar 9 — Differentiation & Growth (weeks 39-44)

The moats that make SwiftShip better than Shiprocket, and the real-world validation.

### W39-40 — NDR analytics
- SS-038: Dashboard showing NDR breakdown by reason/pincode/courier/time-of-day
### W41-42 — Multi-channel notification reliability
- SS-018 expanded: WhatsApp + SMS + email fallback with retry + delivery log
### W43-44 — Anchor tenant pilot
- SS-039: 3 candidate merchants doing 3K-10K orders/day
- Go-live playbook, on-call rotation for 2 weeks

**Deliverable:** One anchor tenant in production (5K+ orders/day), NDR analytics as a key feature, and retention from multi-channel notification delivery.

## Cross-cutting: Track A (Prisma shim removal) — ✅ COMPLETE

> Landed 2026-06-15/16. The shim, the `@prisma/client` path mappings, and the
> dependency are deleted (SS-044, commit `2062547`). `npm run audit:prisma`
> guards against regressions in CI.

### W25-33 — Parallel with Pillars 7-8
- SS-040: Audit script + CI guard ✅
- SS-041: billing lib shim → TypeORM (3d) ✅
- SS-042: cod lib shim → TypeORM (3d) ✅
- SS-043a-h: Remaining 8 libs (21d, parallel) ✅
- SS-044: Delete shim (day 70, P-FINAL complete) ✅

**This track runs in parallel** and unblocks TypeORM-native features (raw joins, transactions).
