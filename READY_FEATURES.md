# SwiftShip AI — feature readiness

This file lists what the public surface can serve today, after the monorepo
build-out and the completed TypeORM migration. The `Query` / `Mutation` names
are the public contract — use the Postman `API Readiness Analyzer` against
`http://localhost:3000/graphql` (after `nx serve api`). The REST surface lives
in `apps/api-public` (see the bottom section + `docs/public-api/`).

## Auth (`libs/platform/auth`)

| Operation | Type | Description |
| --- | --- | --- |
| `login` | Mutation | Exchange email + password for a JWT + refresh token. |
| `register` | Mutation | Create a new user. |
| `refreshToken` | Mutation | Rotate access + refresh. |
| `me` | Query | Current user. |

## Orders (`libs/domains/orders`)

- Queries: `orders`, `order(id)`, `myOrders`
- Mutations: `createOrder`, `updateOrder`, `cancelOrder`, `markOrderPaid`
- Fields: `id`, `orderNumber`, `status`, `paymentStatus`, `total`, `destination{*}`, `shipments[]`, `payments[]`

## Shipments (`libs/domains/shipments`)

- Queries: `shipments`, `shipment(id)`, `filterShipments(filter)`
- Mutations: `createShipment`, `updateShipment`, `cancelShipment`, `generateShippingLabel`, `ingestTracking`
- Subscriptions (WebSocket): `trackingUpdates(shipmentId)`

## Warehouses (`libs/domains/warehouses`)

- Queries: `warehouses`, `warehouse(id)`, `warehouseByPincode(pincode)`
- Mutations: `createWarehouse`, `updateWarehouse`, `deleteWarehouse`

## Carriers + shipping rates

- Queries: `carriers`, `shippingRates`, `availableCarriers`
- Mutations: `createCarrier`, `createShippingRate`, `updateShippingRate`

## COD (`libs/domains/cod`)

- Queries: `codRemittances`, `codRemittance(id)`
- Mutations: `recordCodCollection`, `remitCod`

## NDR (`libs/domains/ndr`)

- Queries: `ndrReports`, `ndrReport(id)`
- Mutations: `createNdr`, `resolveNdr`, `reattemptNdr`

## Pickups (`libs/domains/pickups`)

- Queries: `pickups`, `pickup(id)`
- Mutations: `schedulePickup`, `cancelPickup`

## Manifests

- Queries: `manifests`, `manifest(id)`
- Mutations: `generateManifest`, `downloadManifest`

## Returns

- Queries: `returns`, `return(id)`
- Mutations: `createReturn`, `approveReturn`, `rejectReturn`, `markReturned`

## Billing (`libs/domains/billing`)

- Queries: `invoices`, `invoice(id)`, `subscriptions`
- Mutations: `createInvoice`, `markInvoicePaid`, `voidInvoice`, `generateEwayBill`

## Payments

- Queries: `payments`, `payment(id)`, `paymentMethods`
- Mutations: `createPaymentIntent`, `confirmPayment`, `refundPayment`

## Surcharges

- Queries: `rateSurcharges`, `rateSurcharge(id)`
- Mutations: `createRateSurcharge`, `updateRateSurcharge`, `deleteRateSurcharge`

## Rate shop + serviceability

- Queries: `rateShop(request)`, `checkServiceability(params)`
- **Ranking engine (SS-010/SS-013):** `rankedRateShop(input)` — strategy-ranked
  quotes (cheapest / fastest / best_value / balanced / reliability_first) with
  per-quote ranking meta
- **A/B simulator:** `simulateRateShop(baseInput, overrides)`,
  `simulateRateShopBatch(baseInput, scenarios[])`
- REST fallback for widgets: public rate-shop endpoint (see `apps/api` rate-shop
  routes); the `publicRateShop` GraphQL mutation is still a TODO(SS-022-backend)

## Tenancy + wallet (`libs/domains/tenants`) — Pillar 1

- Queries: `tenants`, `tenant`, `wallet`, `walletStatement`
- Mutations: `createTenant`, `updateTenant`, `suspendTenant`, `createSubAccount`,
  `onboardTenant`, `inviteTeamMember`, `acceptInvite`, `rotateApiKey`,
  `topUpWallet`, `transferBetweenWallets`, `lockFunds`, `releaseFunds`, `assignRole`
- Per-tenant-tier throttling with `X-RateLimit-*` quota headers (REST), tenant
  guard + feature flags platform-wide

## Channels (`libs/domains/channels`) — SS-026

- Queries: `channelConnections`, `channelConnection(id)`, `channelSyncJobs`
- Mutations: `connectChannel`, `disconnectChannel`, `triggerChannelSync`
- Adapters: Shopify, WooCommerce (sync) + Amazon, Flipkart, Myntra, Meesho
  (direct); AES-encrypted credentials; BullMQ recurring product/order pulls

## KYC (`libs/domains/onboarding/kyc`) — SS-031

- Mutations: `submitKyc` (PAN + GSTIN + bank; triggers async BullMQ verify)
- Queries: `kycStatus`

## GST / E-way (`libs/domains/billing/gst`) — SS-032

- Mutations: `generateGstInvoice`, `generateEwayBill`, `cancelEwayBill`
- Queries: `gstInvoiceByInvoiceId`, `ewayBillByShipment`, `ewayBillThreshold`,
  `isGstinPayingCustomer`
- ClearTax sandbox adapter

## COD reconciliation (`libs/domains/billing/cod-remittance`) — SS-033

- Bank-statement parsers: HDFC, ICICI, Axis, SBI, Kotak
- Reconciliation service + cron + dispute queue (service-level; surfaced via
  billing/COD remittance queries and the admin portal)

## NDR analytics (`libs/domains/ndr/analytics`) — SS-038

- Queries: `ndrAnalytics` (top reasons + recovery rate), `ndrByPincode`,
  `ndrByCourier`, `ndrByTimeOfDay`

## Audit log (`libs/observability/audit`) — SS-028

- Queries: `auditEvents` (filterable), `resourceHistory`
- `@Auditable()` decorator auto-records decorated mutations

## Dashboard (`libs/domains/dashboard`)

- Queries: `dashboardStats`, `revenueAnalytics`, `carrierPerformance`, `slaMetrics`, `totalSales`

## Bulk operations

- Mutations: `bulkCreateShipments`, `bulkGenerateLabels`, `bulkCancelShipments`

## Webhooks

- Queries: `webhookSubscriptions`
- Mutations: `createWebhookSubscription`, `updateWebhookSubscription`, `deleteWebhookSubscription`
- Webhook endpoint: `POST /webhooks/:subscriptionId` (raw body, HMAC signed)

## E-commerce integrations

- Shopify: `POST /shopify/webhook`, `GET /shopify/connect`, `shopifyStores`, mutations for `createShopifyOrder`
- WooCommerce: `woocommerceStores`, mutations for `createWooCommerceOrder`

## Notifications

- `sendEmail`, `sendSms`, `sendWhatsapp` (admin)
- `notifications`, `markNotificationRead` (user)

## Onboarding

- `onboardingState`, `completeOnboardingStep`

## Users / roles

- `users`, `user(id)`, `roles`, `assignRole`, `removeRole`

## Plugins

- `plugins` (list loaded), `pluginStatus(name)` (per-plugin health)

## Storage

- `STORAGE_DRIVER=s3` (default), `stub` for dev. Helpers via `StorageService` (not exposed in GraphQL).

## Metrics (Prometheus)

- `GET /metrics` — process_uptime, heap, rss + custom counters/histograms

## Public REST API v1 (`apps/api-public`) — SS-027

- Base path `/v1`, auth via `X-Swiftship-Api-Key`, per-tenant throttling
- Controllers: orders, shipments, shipping-rates, carriers, returns, tracking,
  rate-shop, webhooks
- Swagger UI at `/docs/v1/` + quick-start landing page; committed OpenAPI spec
  (`apps/api-public/src/generated/openapi.json`, mirrored to
  `docs/openapi/swagger.yaml` via `npm run docs:api:openapi`)
- Guides: `docs/public-api/{getting-started,authentication,errors,rate-limits,webhooks}.md`

## SDKs (`packages/`) — SS-027b/c/d

- `@swiftship/node` (typescript-fetch + hand wrapper), `swiftship` (Python),
  `swiftship/sdk-php` — generated by `scripts/build-sdks.mjs`, re-generated + 
  tested in CI (`sdk-ci.yml`)

## Health + platform endpoints

- `GET /health` (liveness), `GET /health/ready` (readiness)
- `GET /ping` (echoes `X-Request-Id` correlation header)
- Shopify webhook receiver: `POST /shopify/webhook` (raw body, HMAC verified)
- Outbound webhook endpoint: `POST /webhooks/:subscriptionId` (HMAC signed)
