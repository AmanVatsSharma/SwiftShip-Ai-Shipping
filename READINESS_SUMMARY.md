# SwiftShip AI — Backend Readiness Summary

> Rewritten 2026-06 (docs-sync audit) — the previous version predated the Nx
> migration and the 24-week roadmap build-out. For day-to-day resume info see
> [`STATUS.md`](./STATUS.md); for the operation-level surface see
> [`READY_FEATURES.md`](./READY_FEATURES.md).

## 📊 Quick stats

- **Nx projects**: ~46 (5 apps, 39 libs, 3 SDK packages, chaos + loadtest)
- **Domain lib dirs**: 29 (plus observability, shared-ui)
- **Carrier adapters**: 13 + sandbox
- **TypeORM migrations**: 16
- **Unit test files**: ~96 across libs and apps
- **Tracker**: 65/65 beads closed — all roadmap pillars complete
- **ORM**: TypeORM only (Prisma fully removed)

## ✅ Ready (verified in code)

### Core shipping
Orders (full CRUD + lifecycle), shipments (labels, tracking, WebSocket
`trackingUpdates`), returns/RMA (incl. public token return portal), pickups,
manifests, NDR (state machine + ingestion + analytics), COD (remittance +
bank-statement reconciliation across HDFC/ICICI/Axis/SBI/Kotak + dispute queue),
warehouses, serviceability, shipping rates + surcharges engine (weight-break,
zones, fuel/ODA/COD).

### Rate engine
Multi-carrier rate shop, Redis rate cache + per-carrier circuit breaker,
ranking engine with 5 strategies (cheapest/fastest/best_value/balanced/
reliability_first), A/B rate simulator (`simulateRateShopBatch`), courier
scorecards.

### Multi-tenancy
Tenant model + context/guard/middleware, per-tenant-tier Postgres-backed
throttling with quota headers, wallet + double-entry ledger + statements,
sub-accounts, API keys + rotation, feature flags, onboarding mutations.

### Compliance & billing
KYC (PAN/GSTIN/bank validators, BullMQ async verify), GST invoicing + E-way
bill (ClearTax sandbox adapter), invoices/wallet/credit notes, payments
(Stripe + Razorpay gateways, payment intents, refunds).

### Channels & integrations
Channel-agnostic `ChannelSyncService` (Shopify, WooCommerce sync adapters;
Amazon, Flipkart, Myntra, Meesho direct adapters; encrypted credentials;
BullMQ schedulers), webhook subscriptions + queued delivery + HMAC signing,
notifications (email/SMS/WhatsApp — Exotel + WATI).

### Frontends
`apps/web` (branded tracking page, end-customer return portal, embeddable CDN
widgets: tracking/returns/rate-shop), `apps/admin-portal` (dashboard, NDR
analytics, orders, channel management, rate-shop widget, PWA).

### Public platform
`apps/api-public` REST v1 (8 controllers, API-key auth, per-tenant throttling,
Swagger UI `/docs/v1/`), OpenAPI spec, Postman collection + newman runner,
3 generated SDKs (Node/Python/PHP) with CI regeneration (`sdk-ci.yml`).

### Ops
OTel + Sentry + correlation IDs + audit log + Prometheus `/metrics`, full
observability compose stack (collector, Prometheus, Loki, Promtail, Grafana) +
Grafana dashboard, k8s manifests + HPAs, GitHub Actions CI (graph-guard, lint,
typecheck, test w/ services, e2e, build, release), k6 load tests (order-create,
rate-shop, graphql-rps), chaos scenarios + runbooks (redis-down,
postgres-failover, carrier-timeout), pilot onboarding dry-run script + playbook.

## ⚠️ Known gaps / debt (details in STATUS.md §2)

1. **`apps/api` does not currently typecheck** — broken relative import depths
   (`../../libs` should be `../../../libs`), missing `apps/api/jest.config.ts`,
   `app.resolver.ts` TS2564, missing `@types/morgan`. Fix first.
2. **Legacy `src/` half-decommissioned** — 10 domain-lib barrels still re-export
   root `src/`; 5 more are placeholder barrels; `src/prisma/prisma.service.ts`
   imports a deleted file. (MIGRATION.md §9.)
3. **E2E suite is thin** — only the health suite; roadmap called for one e2e
   per public mutation.
4. **SDK runtime acceptance not yet observed on CI** — generator round-trips
   need Java 21 on a Linux runner (`sdk-ci.yml` exists, deferred from SS-027).
5. Small deferred items: COD reconciliation invariant test, `publicRateShop`
   GraphQL mutation (widgets use REST today), `ecommerce-integrations` not
   Nx-registered, `libs/shared/` empty, legacy root `Dockerfile`/`nest-cli.json`.

## 🎯 Comparison with Shiprocket

### ✅ At or above parity
- **13 carriers** incl. regional (India Post, Professional Couriers, Gati)
- **GraphQL + REST + WebSocket** (Shiprocket: REST + webhooks)
- **AI-ranked rate shopping + A/B simulator** (Shiprocket: basic comparison)
- **Channel coverage**: Shopify, WooCommerce, Amazon, Flipkart, Meesho, Myntra
- **COD reconciliation** with 5-bank parsing + dispute queue
- **KYC + GST/E-way compliance** built in
- **NDR analytics** (reason/pincode/courier/time-of-day)
- **Branded customer surfaces** + embeddable widgets
- **3 official SDKs** + Postman + OpenAPI + Swagger UI
- **Multi-tenant** billing wallet, throttling, feature flags

### ⚠️ Not yet real
- No production deployment evidence yet (pilot playbook exists, dry-run script
  only — `docs/anchor-tenant-pilot.md`)
- AI fraud detection, white-label branding, support chatbot — still unbuilt
  (carried over from the original `project_overview.md` vision)

## 📈 Readiness by category

| Category | Score | Notes |
|----------|-------|-------|
| Core shipping | 95% | all flows implemented; production hardening pending |
| Rate engine | 95% | ranking + simulator + cache + breaker |
| Multi-tenancy | 90% | wallet/throttle/flags live; sub-account UI thin |
| Compliance | 90% | KYC + GST/E-way + COD recon |
| Channels | 85% | 6 channel adapters; billing reconciliation basic |
| Public API + SDKs | 85% | shipped; CI runtime acceptance pending |
| Observability | 90% | OTel/Sentry/audit/metrics + dashboards |
| Customer surfaces | 85% | tracking/return/widgets live |
| Test coverage | 60% | ~96 unit specs but e2e thin, some libs `passWithNoTests` |
| Build health | ❌ | apps/api compile breakage — P0, see STATUS.md |

**Overall: feature-complete for the 24-week plan; engineering-debt cleanup and
the pilot are the remaining work.**
