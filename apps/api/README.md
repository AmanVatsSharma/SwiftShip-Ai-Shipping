# apps/api — SwiftShip AI NestJS API

The GraphQL + REST surface. Wires together every `@swiftship/platform-*` and
`@swiftship/domains-*` lib into a runnable NestJS application.

## Run

```bash
# from the repo root
nx serve api
# or
cd apps/api && npm run start:dev
```

## Build

```bash
nx build api
```

## Env

See `tsconfig.app.json` and the inline Joi schema in `src/app.module.ts` for
the full list. Required: `DATABASE_URL`, `JWT_SECRET`. Recommended for local
dev: `DATABASE_URL=postgres://swiftship:swiftship@localhost:5432/swiftship`
and `REDIS_URL=redis://localhost:6379`.

## Health

- Liveness: `GET /health`
- Readiness: `GET /health/ready`
- GraphQL playground (dev only): `GET /graphql`
