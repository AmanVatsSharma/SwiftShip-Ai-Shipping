# SwiftShip AI — feature readiness (post-Nx refactor)

This file lists what the GraphQL surface can serve today, after the
monorepo + TypeORM migration. The `Query` / `Mutation` names are the
public contract — use the Postman `API Readiness Analyzer` against
`http://localhost:3000/graphql` (after `nx serve api`).

## Auth (`apps/api/src/graphql/Auth`)

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

- `GET /metrics` — process_uptime, heap, rss
