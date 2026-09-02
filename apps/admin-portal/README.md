# apps/admin-portal — SwiftShip AI Admin Console

Next.js 14 (App Router) console for owners, staff, and sellers, shipped as a
PWA (manifest + service worker + icons). Talks to the NestJS API at `apps/api`
over GraphQL via Apollo Client. Has its own `Dockerfile`.

## Run

```bash
# from the repo root
nx serve admin-portal
# or directly
cd apps/admin-portal
npm install
NEXT_PUBLIC_API_URL=http://localhost:3000/graphql npm run dev
```

The portal starts on http://localhost:4200.

## Pages

- `/` — landing tiles
- `/dashboard` — revenue + SLA charts
- `/dashboard/ndr-analytics` — NDR breakdown by reason / pincode / courier /
  time-of-day (SS-038)
- `/orders` — list of all orders (GraphQL `orders` query)
- `/channels` — channel connections overview (SS-026)
- `/channels/new` — connect a new channel (Shopify, WooCommerce, Amazon,
  Flipkart, Myntra, Meesho)
- `/channels/[id]` — channel detail + sync jobs + disconnect
- `/rate-shop-widget` — embeddable rate-shop widget preview

## Auth

The Apollo client reads the JWT from `localStorage` under `swiftship.jwt` and
attaches it as `Authorization: Bearer …`. Use the API's `login` mutation
(the REST equivalent is `apps/api-public` `/v1` with `X-Swiftship-Api-Key`)
to obtain a token.
