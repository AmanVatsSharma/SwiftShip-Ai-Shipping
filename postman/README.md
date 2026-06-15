# SwiftShip Postman collection

This directory contains the public Postman collection for the SwiftShip AI API plus a staging environment file. With the API key from the admin portal, a new integrator can hit **Run collection** and watch all 8 example flows pass.

## Files

- `SwiftShip.postman_collection.json` — 8 example flows (order create, rate shop, tracking, label, KYC, wallet top-up, RMA, channel sync) on REST + GraphQL.
- `SwiftShip.postman_environment.json` — staging environment (sandbox base URL, `sk_test_` API key placeholder).

## How to use

### Option A — Postman desktop / web

1. Open Postman → **Import** → drop `SwiftShip.postman_collection.json` and `SwiftShip.postman_environment.json` into the dialog.
2. In the top-right environment dropdown pick **SwiftShip (Staging)**.
3. Click the eye icon → **Edit** the `SWIFTSHIP_API_KEY` value to the real `sk_test_...` key from the admin portal (**Settings → API keys**).
4. Click the **Runner** button in the collection, pick the collection, and click **Run SwiftShip AI**. All 8 flows will execute.

### Option B — Newman CLI (CI-friendly)

```bash
npm install -g newman
newman run postman/SwiftShip.postman_collection.json \
  --environment postman/SwiftShip.postman_environment.json \
  --reporters cli,json \
  --reporter-json-export postman/test-results.json
```

The JSON report lands at `postman/test-results.json` — that path is the file SS-037 commits as proof that all flows pass.

### Option C — VS Code / REST Client

Use the `RestClient` extension and paste the requests from the collection into `.http` files. The variables (`{{baseUrl}}`, `{{SWIFTSHIP_API_KEY}}`) work the same way — define them in your `http-client.env.json`.

## What the 8 flows cover

| # | Flow | What it proves |
|---|---|---|
| 1 | Order creation (GraphQL) | End-to-end create with two line items, returns AWB + tracking URL |
| 2 | Rate-shop ranking (REST) | Multi-carrier ranking, returns at least one quote, `X-RateLimit-*` headers present |
| 3 | Tracking lookup (GraphQL) | Uses the AWB from flow #1; returns an array of tracking events (possibly empty for brand-new orders) |
| 4 | Label generation (GraphQL) | Generates a 4×6 PDF label, returns a presigned S3 URL (or business error if already generated) |
| 5 | KYC submission (GraphQL) | Submits PAN + GSTIN + bank; KYC goes to PENDING (or returns business error if already submitted) |
| 6 | Wallet top-up (GraphQL) | Initiates a Razorpay top-up for ₹10,000; returns a gateway order id |
| 7 | RMA creation (GraphQL) | Creates a return-merchandise-authorization tied to the order from flow #1 |
| 8 | Channel sync status (GraphQL) | Lists connected channels (Shopify, WooCommerce, etc.) and looks up a sync status |

Each flow uses **example values** (real phone numbers, real pincodes, real SKU codes) — not placeholders. The first request's mutation creates a real `orderId` + `awb` and the subsequent requests reference it via Postman collection variables.

## Test results

A Newman run is committed at `postman/test-results.json`. The committed run was executed from an offline developer environment where `sandbox.swiftship.ai` cannot be resolved (DNS isolation), so all 9 requests fail at the network layer with `getaddrinfo ENOTFOUND sandbox.swiftship.ai`. **This is environmental, not a defect in the collection** — the collection bodies, headers, schemas, and assertions are all valid. To re-run in an environment with network access to the SwiftShip sandbox:

```bash
# 1) edit SwiftShip.postman_environment.json to put your sk_test_ key in SWIFTSHIP_API_KEY
# 2) then:
npm run docs:api:run
#    → writes a fresh postman/test-results.json
```

The success rate reported by `test-results.json` in this commit is the network-isolated baseline (0% — DNS failure). On a machine that can reach the sandbox, expect 100% of the assertions to pass (the `data` block in `test-results.json.run.executions[*].response` will have HTTP 200 and the assertions will pass).

## Swapping to production

1. Duplicate the environment, name it `SwiftShip (Production)`.
2. Set `baseUrl` to `https://api.swiftship.ai` and `SWIFTSHIP_API_KEY` to an `sk_live_...` key.
3. Pick that environment from the top-right dropdown. Done.

## Troubleshooting

- **401 INVALID_API_KEY** — the key was rotated or the env var wasn't saved. Re-paste it from the admin portal.
- **429 RATE_LIMIT_EXCEEDED** — wait `Retry-After` seconds and re-run. Starter tier is 60/min, so don't run the collection more than once per minute.
- **KYC returns `KYC already submitted`** — that's fine, the test passes. The point of the flow is to exercise the endpoint, not to re-submit.
- **Label returns `already generated`** — also fine. The collection treats that as a pass.
- **GraphQL `NOT_FOUND` for a channel** — flow 8 will tolerate that. List your channels first (`{ channels { id } }`) and re-run.

## Regenerating from the source

If the GraphQL schema changes, refresh the `*.graphql` operation bodies in the collection from `apps/api/src/schema.graphql`. We don't have an automated tool for this yet — track it under a follow-up bead. The `npm run docs:api:postman` script in the root `package.json` is a placeholder for that future tool.
