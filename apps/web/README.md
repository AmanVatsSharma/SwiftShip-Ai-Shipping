# apps/web — SwiftShip AI marketing + seller portal

Next.js 14 (App Router) public site + lightweight seller self-service
console. Talks to the NestJS API at `apps/api` over GraphQL.

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

## Pages

- `/` — marketing landing
- `/track` — public AWB tracking

## Auth

Same JWT pattern as `apps/admin-portal`; the Apollo client attaches
`Authorization: Bearer <jwt>` from `localStorage['swiftship.jwt']`.
