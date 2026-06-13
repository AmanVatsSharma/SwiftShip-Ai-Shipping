# apps/admin-portal — SwiftShip AI Admin Console

Next.js 14 (App Router) console for owners, staff, and sellers. Talks to the
NestJS API at `apps/api` over GraphQL via Apollo Client.

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
- `/orders` — list of all orders (GraphQL `orders` query)
- `/dashboard` — revenue + SLA charts

## Auth

The Apollo client reads the JWT from `localStorage` under `swiftship.jwt` and
attaches it as `Authorization: Bearer …`. Use the API's `/auth/login` mutation
to obtain a token.
