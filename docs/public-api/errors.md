# Errors

Every error response from the SwiftShip API follows a consistent JSON shape. REST endpoints return it as the response body; GraphQL endpoints return it inside the `errors[]` array of the standard Apollo response.

## Error envelope

```json
{
  "statusCode": 400,
  "message": "weightGrams must be > 0",
  "error": "Bad Request",
  "code": "VALIDATION_FAILED",
  "details": {
    "field": "weightGrams"
  }
}
```

For GraphQL:

```json
{
  "data": { "createOrder": null },
  "errors": [
    {
      "message": "Customer pincode is not serviceable",
      "extensions": {
        "code": "PINCODE_NOT_SERVICEABLE",
        "statusCode": 422,
        "details": { "pincode": "999999" }
      }
    }
  ]
}
```

## HTTP status codes

| Status | When | Example |
|---|---|---|
| **400 Bad Request** | Malformed body, missing required field, or invalid value | `weightGrams must be > 0` |
| **401 Unauthorized** | Missing or invalid `X-Swiftship-Api-Key` / `Authorization` header | `Invalid API key` |
| **403 Forbidden** | API key is valid but lacks the required scope, or tenant is suspended | `Insufficient scope: orders:write required` |
| **404 Not Found** | Resource doesn't exist or doesn't belong to the calling tenant | `Order ORD-12345 not found` |
| **409 Conflict** | State conflict — duplicate idempotency key, can't cancel a delivered shipment, etc. | `Order already shipped; cannot cancel` |
| **422 Unprocessable Entity** | Validation passed but business rules fail | `Pincode 999999 is not serviceable` |
| **429 Too Many Requests** | Per-tenant rate limit hit — see [rate-limits.md](./rate-limits.md) | `Rate limit exceeded. Retry after 42 seconds.` |
| **500 Internal Server Error** | Unhandled server error. Already logged with a request id you can quote to support | `Internal error — request id req_8c4f9a` |
| **502/503/504** | Upstream carrier or payment gateway is down | `Carrier Delhivery is currently unavailable` |

## Common error codes (`code` / `extensions.code`)

| Code | Meaning | Fix |
|---|---|---|
| `VALIDATION_FAILED` | Body / DTO validation failed | Check the `details.field` and re-read the input shape |
| `UNAUTHENTICATED` | No auth header | Add `X-Swiftship-Api-Key` |
| `INVALID_API_KEY` | Key was revoked, wrong env, or malformed | Re-create the key in the admin portal |
| `INSUFFICIENT_SCOPE` | The key doesn't have the scope this resolver requires | Rotate the key with the right scope, or use a different key |
| `TENANT_SUSPENDED` | Tenant is suspended for non-payment or ToS violation | Contact support |
| `NOT_FOUND` | Resource missing or in another tenant | Check the id |
| `PINCODE_NOT_SERVICEABLE` | The destination pincode isn't covered by any carrier you have configured | Try a different pincode or onboard a different carrier |
| `CARRIER_DOWN` | All carriers are timing out for this route | Retry with backoff; this is a real outage |
| `RATE_LIMIT_EXCEEDED` | Per-tenant throttle | See [rate-limits.md](./rate-limits.md) |
| `WALLET_INSUFFICIENT` | Wallet balance < shipment cost | Top up via the wallet top-up mutation |
| `KYC_REQUIRED` | Action requires KYC completion | Submit KYC (see the [Postman collection](../../postman/SwiftShip.postman_collection.json), "KYC submit" flow) |
| `IDEMPOTENCY_KEY_REUSE` | Same `Idempotency-Key` was used with a different body | Generate a fresh key for each unique request |
| `INTERNAL` | Unhandled error | Retry; if it persists, share the `requestId` with support |

## Request id

Every response — success or error — has an `X-Request-Id` header. When you contact support, include it. We use it to look up the exact log line in Loki.

## Example: handling errors in the shell

```bash
# Verbose run with --include so we see headers
curl -i -X POST https://api.swiftship.ai/api/v1/rate-shop/rank \
  -H "X-Swiftship-Api-Key: $SWIFTSHIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "originPincode": "560001", "destinationPincode": "999999", "weightGrams": 500 }'

# HTTP/2 422
# content-type: application/json
# x-request-id: req_8c4f9a2c
#
# {"statusCode":422,"message":"Pincode 999999 is not serviceable","error":"Unprocessable Entity","code":"PINCODE_NOT_SERVICEABLE","details":{"pincode":"999999"}}
```

## Idempotency

POST endpoints (label generation, order create, etc.) accept an `Idempotency-Key` header. We store the response body keyed by your token for 24 hours. Re-sending the same key + body returns the cached response; re-sending the same key with a different body returns `409 IDEMPOTENCY_KEY_REUSE`.

```bash
curl -X POST https://api.swiftship.ai/graphql \
  -H "X-Swiftship-Api-Key: $SWIFTSHIP_API_KEY" \
  -H "Idempotency-Key: 7c4f8a60-..." \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { createOrder(input: { ... }) { id } }"}'
```
