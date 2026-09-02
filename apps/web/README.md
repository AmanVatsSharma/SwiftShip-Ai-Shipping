# apps/web — SwiftShip AI customer-facing surfaces

Next.js 14 (App Router) public site: branded shipment tracking, the
end-customer return portal, and the embeddable widget CDN. Talks to the
NestJS API at `apps/api` over GraphQL (tracking/returns) and REST (widgets).

## Run

```bash
# from the repo root
nx serve web
# or
cd apps/web
npm install
NEXT_PUBLIC_API_URL=http://localhost:3000/graphql npm run dev
```

Starts on http://localhost:4300.

## Pages & surfaces

- `/` — marketing landing
- `/track/[awb]` — branded public AWB tracking (TrackHeader / TrackTimeline;
  per-tenant branding, "request reattempt" / "request return" entry points)
- `/return/[token]` — end-customer return portal (token-based, no auth):
  reason picker, photo uploader, refund-method picker, reverse-pickup toggle

## Embeddable widgets (`public/cdn/`)

Framework-free, CSP-friendly scripts (sources in `widgets/`, test suite included):

- `swiftship-loader.js` — loader
- `tracking.js` — drop-in tracking widget
- `returns.js` — "request return" button
- `rate-shop.js` — courier selector for checkouts (uses the public REST
  rate-shop endpoint, not GraphQL — see TODO(SS-022-backend) in STATUS.md)

## Auth

Same JWT pattern as `apps/admin-portal`; the Apollo client attaches
`Authorization: Bearer <jwt>` from `localStorage['swiftship.jwt']` for the
seller-facing parts. `/track` and `/return` are public.
