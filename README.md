# SwiftShip AI

SwiftShip AI is an AI-powered Indian logistics and shipping SaaS backend — a
Shiprocket competitor built on NestJS, GraphQL, and PostgreSQL. It exposes a
single GraphQL API for managing orders, multi-carrier shipments, returns,
pickups, NDR, COD remittance, billing, payments (Stripe + Razorpay),
warehouses, e-commerce integrations (Shopify, WooCommerce), webhooks,
notifications, and an admin/owner panel, and is currently mid-flight on a
Prisma → TypeORM migration tracked in [`MIGRATION.md`](./MIGRATION.md).

## Architecture

```
apps/         ← api, admin-portal, web
libs/domains/ ← one lib per bounded context (orders, shipments, billing, …)
libs/platform/← auth, typeorm, queues, carriers, graphql, config
libs/shared/  ← cross-cutting types and utils
libs/observability/ ← logger, metrics, tracing
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full lib layer diagram, the
dependency rules, and the rationale.

## Quick start

```bash
# 1. Install
npm install

# 2. Start Postgres + Redis (the API talks to both)
docker compose up -d postgres redis

# 3. Run the API in dev mode (watches, regenerates the GraphQL schema)
npx nx serve api
```

The API listens on `http://localhost:3000` by default. GraphQL Playground is
mounted at `/graphql` and the auto-generated SDL lives at
`apps/api/src/schema.graphql`.

### Other useful commands

```bash
npx nx serve web               # merchant storefront (apps/web)
npx nx serve admin-portal      # owner panel (apps/admin-portal)
npx nx run-many -t build --all # build everything
npx nx run-many -t test  --all # run every unit suite
npx nx run-many -t lint  --all # lint every project
npx nx graph                   # visualize the lib dependency graph
```

A full list of root-level scripts is in `package.json`; the most common ones
are also exposed as `npm run serve:api`, `npm run test:all`, `npm run lint:all`,
`npm run typecheck:all`, and `npm run graph`.

## Lib directory map

```
apps/
  api/             NestJS GraphQL + REST API (the backend)
  admin-portal/    Next.js owner/operator panel
  web/             Next.js merchant storefront

libs/
  platform/
    auth/          Passport JWT, refresh tokens, @CurrentUser / @Roles
    typeorm/       TypeOrmModule, entities, DataSource, PrismaCompat shim
    queues/        BullMQ wrapper on ioredis
    carriers/      CarrierAdapter interface + adapter registry
    graphql/       Apollo driver, code-first schema, throttler
    config/        Joi-validated ConfigModule
  domains/         (18+ bounded contexts — see ARCHITECTURE.md)
  shared/          Cross-cutting types, DTO fragments, money helpers
  observability/   Logger, metrics, tracing
```

The complete list of domain libs, with one-line descriptions, is in
[`ARCHITECTURE.md`](./ARCHITECTURE.md#the-18-domain-libs-libsdomains).

## Contributing

- **Architecture & layering rules** — read
  [`ARCHITECTURE.md`](./ARCHITECTURE.md) before adding a new lib or
  changing an import direction. The Nx boundary rule in `eslint.config.mjs`
  will reject illegal imports at lint time.
- **Prisma → TypeORM migration** — every service is somewhere on the
  migration track documented in
  [`MIGRATION.md`](./MIGRATION.md). Check the per-domain status table
  there before opening a PR against a domain lib, and follow the "How to
  migrate a service" runbook if you are taking a module off
  `PrismaCompat`.
- **Conventions for a new module** — see `CLAUDE.md` at the repo root.

## License

TBD — proprietary, all rights reserved. Contact the maintainers before
redistributing.
