# Getting started with the SwiftShip API

Welcome to SwiftShip AI — the multi-carrier shipping platform built for Indian D2C brands. This guide walks you from "just signed up" to "shipped my first order" in under 30 minutes.

## 1. Sign up

1. Open the admin portal at <https://app.swiftship.ai/signup>.
2. Enter your work email, business name, mobile number, and pick a password.
3. Verify the OTP we send to your phone and email.
4. You'll land on the onboarding wizard. KYC (PAN + GSTIN + bank) is gated — you can ship with a Starter tier account without KYC up to ₹50,000/month in COD remittance. To remove the cap, finish KYC in step 5.

## 2. Get an API key

1. From the admin portal sidebar, go to **Settings → API keys**.
2. Click **Create API key**, give it a name (e.g. `production-storefront`), and pick the scopes you need:
   - `orders:read` / `orders:write`
   - `shipments:read` / `shipments:write`
   - `rates:read`
   - `webhooks:write`
3. **Copy the key now** — we'll show it once. Store it in your secrets manager.
4. (Optional) Add a CIDR allowlist or an HTTP referrer to lock the key to your infra.

The same key is accepted on both REST and GraphQL endpoints. JWT bearer tokens (see [authentication.md](./authentication.md)) are for browser-based admin-portal sessions — for server-to-server, use the API key in the `X-Swiftship-Api-Key` header.

```bash
export SWIFTSHIP_API_KEY="sk_live_3f9a7c..."
```

## 3. Find your tenant id

Your tenant id is in the URL of the admin portal (`/t/<tenantId>/...`) and is also returned by the `me` GraphQL query. Keep it client-side if you want to log it on your requests — it's not secret, but it lets support trace issues faster.

```bash
curl https://api.swiftship.ai/graphql \
  -H "X-Swiftship-Api-Key: $SWIFTSHIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ me { id tenantId email } }"}'
```

## 4. Make your first call — rank shipping rates

The public rate-shop endpoint is the most useful first call: it answers "given this origin, destination, weight, and payment method, what should I charge my customer and which courier should I use?".

```bash
curl -X POST https://api.swiftship.ai/api/v1/rate-shop/rank \
  -H "X-Swiftship-Api-Key: $SWIFTSHIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "originPincode": "560001",
    "destinationPincode": "400001",
    "weightGrams": 500,
    "paymentMethod": "PREPAID",
    "strategy": "best_value"
  }'
```

You'll get back ranked quotes from Delhivery, BlueDart, EcomExpress, Xpressbees, Shadowfax, DTDC, etc. The first quote is the recommended carrier.

## 5. Create your first order (GraphQL)

```bash
curl https://api.swiftship.ai/graphql \
  -H "X-Swiftship-Api-Key: $SWIFTSHIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation Create($input: CreateOrderInput!) { createOrder(input: $input) { id orderNumber awb trackingUrl } }",
    "variables": {
      "input": {
        "channel": "API",
        "customerName": "Anita Sharma",
        "customerPhone": "+919876543210",
        "customerEmail": "anita@example.com",
        "shippingAddress": {
          "line1": "12 Marine Drive",
          "city": "Mumbai",
          "state": "MH",
          "pincode": "400001",
          "country": "IN"
        },
        "items": [{
          "sku": "TSHIRT-M-BLK",
          "name": "Classic T-Shirt",
          "quantity": 2,
          "unitPricePaise": 49900,
          "weightGrams": 250
        }],
        "paymentMethod": "PREPAID",
        "codAmountPaise": 0
      }
    }
  }'
```

The response includes a tracking URL of the form `https://track.swiftship.ai/<awb>` that you can hand to the customer.

## 6. Generate a shipping label

Once the order is created, call the label-generation mutation. The label is rendered to a 4×6 PDF and uploaded to S3; you get a presigned URL valid for 15 minutes.

```graphql
mutation Generate($orderId: ID!) {
  generateLabel(orderId: $orderId, format: "PDF_4x6") {
    labelUrl
    awb
    carrierCode
    expiresAt
  }
}
```

## 7. Wire up webhooks

The carrier-tracking webhook (`POST /carrier-webhook/tracking`) is where you'll get delivery status changes. Set the URL in **Settings → Webhooks** in the admin portal — we'll HMAC-sign every payload with your per-tenant secret. See [webhooks.md](./webhooks.md).

## 8. Test in sandbox

The sandbox API lives at `https://sandbox.swiftship.ai` and uses the same GraphQL/REST shapes with deterministic fixtures. The [Postman collection](../../postman/SwiftShip.postman_collection.json) is pre-configured to point at sandbox; flip the `baseUrl` env var to switch to production.

## What's next

- [authentication.md](./authentication.md) — how API keys + JWTs + webhook signatures all fit together
- [rate-limits.md](./rate-limits.md) — the per-tier buckets and how to read `X-RateLimit-*` headers
- [errors.md](./errors.md) — every error code with a fix
- [webhooks.md](./webhooks.md) — for tracking, Shopify, WooCommerce, and carrier-callback webhooks
- The [Postman collection](../../postman/SwiftShip.postman_collection.json) has 8 example flows you can run in one click
