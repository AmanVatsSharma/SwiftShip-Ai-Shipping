# Rate limits

All endpoints are rate-limited at the **tenant level**, not globally. Your tier is set at account creation (Starter by default) and can be upgraded from the admin portal.

## Per-tier buckets

| Tier | Requests / 60 s | Cost limit (INR) / 60 s | Burst multiplier |
|---|---|---|---|
| **Starter** | 60 | 5,00,000 | 1× |
| **Growth** | 300 | 25,00,000 | 1× |
| **Pro** | 1,000 | 1,00,00,000 | 1× |
| **Enterprise** | 10,000 | 50,00,00,000 | 1× |

The implementation is a Postgres-backed per-tenant throttler (`libs/platform/throttler/src/lib/postgres-storage.service.ts`) so limits hold across all API instances. The `TenantThrottlerGuard` picks the bucket at request time from the `tenantTier` field on the user record.

## Reading the headers

Every response includes these headers (status `429` responses also include them):

```
X-RateLimit-Limit: 300          # your tier bucket size
X-RateLimit-Remaining: 247      # requests left in the current 60-second window
X-RateLimit-Reset: 1718448000   # Unix timestamp (seconds) when the window resets
```

The `Retry-After` header is present on `429` responses and equals the number of seconds to wait before retrying.

## Example: inspecting rate limits in the shell

```bash
# Check headers on a rate-shop call
curl -s -D - https://api.swiftship.ai/api/v1/rate-shop/rank \
  -H "X-Swiftship-Api-Key: sk_live_3f9a7c..." \
  -H "Content-Type: application/json" \
  -d '{ "originPincode": "560001", "destinationPincode": "400001", "weightGrams": 500 }' \
  -o /dev/null

# Sample response headers:
# HTTP/2 200
# X-RateLimit-Limit: 300
# X-RateLimit-Remaining: 299
# X-RateLimit-Reset: 1718448000
```

## Example: 429 response body

```json
{
  "statusCode": 429,
  "message": "Rate limit exceeded. Retry after 42 seconds.",
  "error": "Too Many Requests",
  "retryAfter": 42
}
```

## Recommended retry pattern

```js
async function callWithRetry(url, body, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Swiftship-Api-Key': process.env.SWIFTSHIP_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (res.status !== 429) return res;
    const { retryAfter = 1 } = await res.json().catch(() => ({}));
    const headerRetry = res.headers.get('Retry-After');
    const delay = Math.max(Number(headerRetry || retryAfter), 1) * 1000;
    await new Promise(r => setTimeout(r, delay));
  }
  throw new Error('Still rate-limited after max retries');
}
```

**Important notes**

- The cost limit is enforced on the *rate-shop* endpoint only (because it does the most carrier API calls). All other endpoints use request-count buckets.
- Tenant tier is set from the `tenant.tier` column in Postgres, populated at sign-up. Upgrade via the admin portal or contact support.
- Webhook calls **do not** count against the rate limit — only caller-originated requests do.
- The `/health` and `/health/ready` endpoints bypass rate limits.
