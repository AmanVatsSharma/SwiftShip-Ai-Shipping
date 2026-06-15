# Authentication

SwiftShip supports three authentication mechanisms, picked by the endpoint:

| Mechanism | Header | Used by | Lifetime |
|---|---|---|---|
| **API key** | `X-Swiftship-Api-Key: <key>` | REST (`/api/v1/*`) + GraphQL server-to-server | Until you revoke it |
| **JWT bearer** | `Authorization: Bearer <jwt>` | GraphQL queries from the admin portal | 15 minutes |
| **JWT refresh** | `Authorization: Bearer <refresh>` | `POST /api/v1/auth/refresh` | 7 days |
| **Webhook signature** | `X-SwiftShip-Signature: sha256=<hmac>` | Outgoing webhooks to your server | Per-request |

Pick the API key for server-to-server, the JWT for browser-based admin work, and verify the HMAC on every incoming webhook.

## 1. API key (server-to-server)

1. Sign in to the admin portal and go to **Settings → API keys**.
2. Click **Create API key**, name it, and pick scopes.
3. **Copy the value now** — we show it once. Format: `sk_live_3f9a7c...` (live) or `sk_test_...` (sandbox).
4. Send it on every request:

```bash
curl https://api.swiftship.ai/api/v1/rate-shop/rank \
  -H "X-Swiftship-Api-Key: sk_live_3f9a7c..." \
  -H "Content-Type: application/json" \
  -d '{ "originPincode": "560001", "destinationPincode": "400001", "weightGrams": 500 }'
```

GraphQL uses the same header:

```bash
curl https://api.swiftship.ai/graphql \
  -H "X-Swiftship-Api-Key: sk_live_3f9a7c..." \
  -H "Content-Type: application/json" \
  -d '{"query":"{ me { id email } }"}'
```

**Key management rules**

- Keys are hashed (bcrypt) at rest. We cannot recover a key — only rotate it.
- Rotate at least every 90 days. The admin portal shows the last-used timestamp.
- Scope keys narrowly: a checkout widget only needs `rates:read`; a fulfillment worker needs `shipments:write`.
- Add a CIDR allowlist for keys that hit from a known IP range.
- If a key leaks, click **Revoke** — revocation is instant and propagates to all API instances within 5 seconds (the per-tenant throttler and the auth middleware both cache the revocation list in Redis).

## 2. JWT bearer (admin portal)

When you sign in to the admin portal, the API issues a short-lived access JWT and a long-lived refresh token. The admin portal's Apollo client auto-refreshes the access token before it expires.

For your own browser app that talks to the SwiftShip API on behalf of a user, use the same flow:

```bash
# 1) Sign in
curl -X POST https://api.swiftship.ai/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "you@brand.in", "password": "..." }'

# Response:
# {
#   "accessToken": "eyJhbGciOi...",   // 15-minute JWT
#   "refreshToken": "rt_8c4f9a...",   // 7-day opaque token, hashed in DB
#   "expiresIn": 900
# }

# 2) Call GraphQL with the access token
curl https://api.swiftship.ai/graphql \
  -H "Authorization: Bearer eyJhbGciOi..." \
  -H "Content-Type: application/json" \
  -d '{"query":"{ me { id email tenantId } }"}'

# 3) Refresh before expiry
curl -X POST https://api.swiftship.ai/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{ "refreshToken": "rt_8c4f9a..." }'
```

Refresh tokens are single-use — every successful refresh issues a new refresh token and revokes the old one. If you see a `401 refresh_revoked` error, the user has to sign in again.

## 3. Webhook signatures (verifying webhooks from SwiftShip)

Every webhook we send to your server carries a `X-SwiftShip-Signature` header of the form `sha256=<hex_hmac>`. Compute it the same way and reject any request where it doesn't match.

```js
// Node.js example
import crypto from 'node:crypto';

function verify(rawBody, header, secret) {
  const [scheme, sig] = header.split('=');
  if (scheme !== 'sha256' || !sig) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');
  // constant-time compare
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
}

// Express — rawBody is required, JSON.parse is NOT done yet
app.post('/swift-webhook', express.raw({ type: '*/*' }), (req, res) => {
  if (!verify(req.body, req.headers['x-swiftship-signature'], process.env.SWIFTSHIP_WEBHOOK_SECRET)) {
    return res.status(401).send('invalid signature');
  }
  const event = JSON.parse(req.body);
  // ...handle event...
  res.status(200).send('ok');
});
```

You can find / rotate the secret in **Settings → Webhooks → Signing secret** in the admin portal.

The same verification shape applies to:

- Carrier tracking callbacks (`X-Delhivery-Signature` / `X-Hub-Signature`)
- Shopify webhooks (`X-Shopify-Hmac-Sha256` — base64, not hex; see [webhooks.md](./webhooks.md))

## 4. Common pitfalls

- **API key in URL**: never put the key in the query string — it ends up in access logs. Header only.
- **JWT in a server-to-server caller**: don't. The JWT is bound to a user session and has a 15-minute TTL. Use the API key.
- **Skipping the raw body for HMAC verification**: signing is over the raw bytes. If you `express.json()` first, the HMAC won't match.
- **Rotating a key without a grace period**: do an overlap. Create the new key, deploy code that accepts both, then revoke the old one. The throttler and auth middleware both honour revoked keys within 5 seconds.
- **Logging the API key**: we hash the key in our DB and we redact the `X-Swiftship-Api-Key` header from our access logs — do the same in yours.
