# Webhooks

SwiftShip sends four kinds of webhooks. The first three are **incoming** (a third party calls us); the last is **outgoing** (we call you). All incoming webhooks are signed; verifying the signature is mandatory for production traffic.

## 1. Incoming: Shopify webhooks

Shopify POSTs to `https://api.swiftship.ai/shopify/webhook` for `orders/create`, `orders/paid`, `orders/cancelled`, `app/uninstalled`, and product update events. The body is the raw JSON Shopify sends (we register a raw-body parser on this path so the HMAC matches).

### Verification

Shopify uses an HMAC-SHA256 of the **raw** body, base64-encoded, in the `X-Shopify-Hmac-Sha256` header.

```js
import crypto from 'node:crypto';

function verifyShopify(rawBody, hmacHeader, apiSecret) {
  if (!hmacHeader) return false;
  const expected = crypto
    .createHmac('sha256', apiSecret)
    .update(rawBody, 'utf8')
    .digest('base64');
  // timing-safe compare
  return crypto.timingSafeEqual(
    Buffer.from(hmacHeader, 'base64'),
    Buffer.from(expected, 'base64'),
  );
}
```

We accept and process a webhook if and only if the HMAC matches. Failed verifications return `400 invalid HMAC`.

### Sample payload — `orders/create`

```json
{
  "id": 820982911946154508,
  "email": "bob@biller.com",
  "created_at": "2026-06-15T15:31:00+05:30",
  "line_items": [{
    "id": 1, "sku": "TSHIRT-M-BLK", "title": "Classic T-Shirt",
    "quantity": 2, "price": "499.00"
  }],
  "shipping_address": {
    "address1": "1 Infinite Loop",
    "city": "Bengaluru", "province": "Karnataka",
    "zip": "560001", "country": "India"
  }
}
```

## 2. Incoming: WooCommerce webhooks

WooCommerce POSTs to a per-tenant URL of the form `https://api.swiftship.ai/api/v1/webhooks/woocommerce/<tenantId>`. WooCommerce signs requests with `X-WC-Webhook-Signature` (base64 HMAC-SHA256) using a per-webhook secret you set in the admin portal.

```js
const expected = crypto
  .createHmac('sha256', secret)
  .update(rawBody, 'utf8')
  .digest('base64');

if (sig !== expected) return res.status(401).send('invalid signature');
```

## 3. Incoming: Carrier tracking callbacks

Carriers (Delhivery, BlueDart, Xpressbees, Shadowfax) POST tracking events to `https://api.swiftship.ai/carrier-webhook/tracking`. Most carriers sign with `X-Delhivery-Signature` or `X-Hub-Signature` (hex HMAC-SHA256 of the raw body). Verification is wired in `libs/domains/webhooks/src/lib/webhooks.controller.ts`; if the configured secret rejects the signature, the endpoint returns `401`.

Sample body:

```json
{
  "shipment_id": 12345,
  "awb": "SWFT1234567890",
  "status": "OutForDelivery",
  "scan_date": "2026-06-15T10:21:00+05:30",
  "location": "Mumbai hub",
  "remarks": "Out for delivery",
  "event_id": "evt_8c4f9a2c"
}
```

The `event_id` is used as an idempotency key — re-delivery of the same event is a no-op.

## 4. Outgoing: webhooks SwiftShip sends to you

Set the URL in **Settings → Webhooks** in the admin portal. Pick the event topics you want to subscribe to. Every request is HMAC-SHA256 signed; the signature is in the `X-SwiftShip-Signature` header as `sha256=<hex>`. See [authentication.md](./authentication.md#3-webhook-signatures-verifying-webhooks-from-swiftship) for the exact verification snippet.

### Headers

```
Content-Type: application/json
X-SwiftShip-Signature: sha256=<hex_hmac>
X-SwiftShip-Event-Id: evt_8c4f9a2c
X-SwiftShip-Event-Type: shipment.tracking_update
X-SwiftShip-Delivery-Attempt: 1
User-Agent: SwiftShip-Webhooks/1.0
```

### Topics

| Topic | When |
|---|---|
| `shipment.tracking_update` | Any scan from the carrier (in-transit, OFD, delivered) |
| `shipment.delivered` | Final delivery scan |
| `shipment.rto_initiated` | Return-to-origin started |
| `ndr.raised` | Non-delivery report created |
| `ndr.action_required` | Customer must reattempt / change address / cancel |
| `order.created` | Order created via any channel |
| `order.cancelled` | Order cancelled |
| `wallet.low_balance` | Wallet balance < threshold |
| `kyc.approved` / `kyc.rejected` | KYC review complete |

### Sample payload — `shipment.tracking_update`

```json
{
  "id": "evt_8c4f9a2c",
  "type": "shipment.tracking_update",
  "createdAt": "2026-06-15T10:21:00.000Z",
  "tenantId": "tnt_5d8c9a",
  "data": {
    "shipmentId": "shp_3a8c1f",
    "awb": "SWFT1234567890",
    "orderId": "ord_5e7b21",
    "status": "OutForDelivery",
    "location": "Mumbai hub",
    "description": "Out for delivery",
    "occurredAt": "2026-06-15T10:21:00+05:30",
    "courierCode": "delhivery"
  }
}
```

### Retry policy

- We retry up to 6 times with exponential backoff (1m, 5m, 30m, 2h, 12h, 24h).
- A response of `2xx` is success. Anything else is a retry.
- After 6 failed attempts, the event goes to the dead-letter queue. You can re-drive it from **Settings → Webhooks → Dead-letter** in the admin portal.
- We never send the same `eventId` twice for a successful delivery.

## 5. Testing webhooks locally

Use ngrok or a similar tunnel to expose localhost:

```bash
ngrok http 3000
# Copy the https://<id>.ngrok-free.app URL into Settings → Webhooks
```

The [Postman collection](../../postman/SwiftShip.postman_collection.json) has a "Webhooks" folder with example verification scripts you can paste into your service.
