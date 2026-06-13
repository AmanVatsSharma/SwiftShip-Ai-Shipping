# apps/api-e2e — SwiftShip API end-to-end tests

Boots the full `AppModule` from `apps/api` against a real Postgres + Redis
and exercises the public surface (HTTP and GraphQL) over Supertest.

## Run

```bash
# from the repo root
nx run api-e2e:e2e
# or
npx jest --config apps/api-e2e/jest.config.ts
```

## Pre-reqs

- Postgres reachable at `DATABASE_URL` (defaults to
  `postgres://swiftship:swiftship@localhost:5432/swiftship_test`).
- Redis reachable at `REDIS_URL` (defaults to `redis://localhost:6379`).
- The global setup will try `docker compose up -d postgres redis` once
  if these aren't already running. Skip with `SKIP_LOCAL_DB=1`.

## Conventions

- `*.e2e-spec.ts` files only.
- Reset DB state with `TRUNCATE … CASCADE` between tests in domain suites
  (see `health.e2e-spec.ts` for a template).
- Use Supertest against the NestJS app instance — don't use Apollo
  Client; we want the HTTP path to mirror production.
