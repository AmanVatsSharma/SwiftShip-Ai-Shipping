# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

SwiftShip AI — an AI-powered Indian logistics/shipping SaaS backend (a Shiprocket competitor). It exposes a GraphQL API for managing orders, multi-carrier shipments, returns, pickups, NDR, COD, billing, payments (Stripe + Razorpay), warehouses, e-commerce integrations (Shopify, WooCommerce), webhooks, notifications, and an admin/owner panel. See `project_overview.md` and `ROADMAP.md` for product context.

## Stack

- **NestJS 11** (modular) + **GraphQL** (Apollo, code-first — schema is generated to `src/schema.graphql` from `@ObjectType` / `@InputType` classes)
- **Prisma 6** ORM → PostgreSQL (schema at `prisma/schema.prisma`)
- **BullMQ** on **Redis** (`ioredis`) for background jobs (label generation, webhook dispatch)
- **Passport JWT** auth with refresh tokens (hashed in DB) + **GraphQL Throttler** (120 req/min) + **helmet** + raw-body capture for Shopify webhook signature verification
- **Jest** (unit: `*.spec.ts` in `src/`; e2e: `test/*.e2e-spec.ts`)
- **ESLint 9** flat config (`typescript-eslint` type-checked) + **Prettier** (`singleQuote: true`, `trailingComma: "all"`)
- Dockerised via the multi-stage `Dockerfile` (Node 22-alpine + openssl for Prisma) and `docker-compose.yml` (api + Postgres 16 + Redis 7)

## Common commands

```bash
npm install
npm run start:dev          # nest start --watch
npm run build              # nest build (output: dist/)
npm run start:prod         # node dist/main

npm run lint               # eslint --fix on src/apps/libs/test
npm run format             # prettier --write

npm run test               # jest (rootDir: src, *.spec.ts)
npm run test:watch
npm run test:cov
npm run test:debug         # node --inspect-brk + jest --runInBand
npm run test:e2e           # jest --config ./test/jest-e2e.json

# Run a single test file
npx jest src/orders/orders.service.spec.ts
npx jest --config ./test/jest-e2e.json test/app.e2e-spec.ts

# Prisma
npx prisma migrate dev
npx prisma generate
npx prisma studio

# Full stack locally (Postgres + Redis + API)
docker compose up --build
```

`package.json` notes: unit tests use `ts-jest` with `rootDir: src`; e2e uses `ts-jest` and the config in `test/jest-e2e.json`.

## High-level architecture

### Module layout
Every feature under `src/<feature>/` is a self-contained NestJS module that typically contains:
- `*.module.ts` — wires controllers, resolvers, services, sub-modules
- `*.resolver.ts` — GraphQL `@Query` / `@Mutation` handlers
- `*.service.ts` — business logic + Prisma access
- `*.model.ts` — GraphQL `@ObjectType` classes (drive schema generation)
- `*.input.ts` / `*.dto.ts` — GraphQL `@InputType` / class-validator DTOs
- `*.spec.ts` — Jest unit tests next to source

The root `AppModule` (`src/app.module.ts`) imports ~25 feature modules plus `GraphQLModule`, `ConfigModule` (Joi-validated env), and `ThrottlerModule`. `PrismaService` is registered globally; `ThrottlerGuard` is bound as `APP_GUARD`.

### Cross-cutting subsystems
- **Database** — `src/prisma/prisma.service.ts` extends `PrismaClient`, logs connection, defers DB errors at boot so the API can still start. Prisma client is generated from `prisma/schema.prisma`.
- **Auth** — `src/auth/` (JWT + refresh tokens). `JwtStrategy` reads bearer tokens; `GqlAuthGuard` / `RolesGuard` protect resolvers. `@CurrentUser()` decorator and `@Roles()` decorator live alongside. `FRONTEND_AUTH_INTEGRATION_GUIDE.md` documents the contract.
- **RBAC / Users** — `src/users/` owns roles and users; `RolesModule` exposes GraphQL CRUD for the owner panel (see `ROADMAP.md`).
- **Carriers (adapter pattern)** — `src/carriers/`:
  - `adapter.interface.ts` — `CarrierAdapter` with `generateLabel`, `trackShipment`, optional `cancelShipment` / `voidLabel`
  - `adapters/` — one file per carrier: `sandbox`, `delhivery`, `xpressbees`, `bluedart`, `dtdc`, `ecom-express`, `shadowfax`, `fedex-india`, `gati`
  - `carrier-adapter.service.ts` — registry: auto-initialises adapters from env vars, gracefully skips missing credentials, exposes `getAdapter(code)` and `getAvailableCarriers()`
  - Adapter selection is driven by `process.env` (e.g. `DELHIVERY_TOKEN`, `BLUEDART_API_KEY`, `FEDEX_INDIA_CLIENT_ID`); see `src/carriers/CARRIER_IMPLEMENTATION_SUMMARY.md`
- **Queues** — `src/queues/` (`QueuesService`) wraps BullMQ on `REDIS_URL`. `getQueue()`, `add()`, and `createWorker()` are used by workers in `src/queues/workers/` (`label-generator.ts`, `webhook-dispatcher.ts`).
- **E-commerce integrations** — `src/ecommerce-integrations/platforms/{shopify,woocommerce}/`. Shopify is the primary platform; `main.ts` registers a raw-body parser on `/shopify/webhook` for HMAC verification.
- **Plugins** — `src/plugins/` defines a `Plugin` interface and a `PluginManagerService` for dynamic discovery/loading; `plugins.resolver.ts` exposes a `plugins` GraphQL query (see `ROADMAP.md` for what's wired vs pending).
- **Storage** — `src/storage/` supports `STORAGE_DRIVER` of `s3` or `stub` (AWS SDK v3 S3 client + presigner, see `@aws-sdk/client-s3` in `package.json`).
- **WebSockets** — `@nestjs/platform-socket.io` is available; carrier flows document `labelCreated` / `trackingEvent` socket emissions.

### Entry point (`src/main.ts`)
Bootstraps `AppModule`, installs helmet, registers `bodyParser.raw` for `/shopify/webhook`, morgan logging, CORS from `CORS_ORIGIN`, global `ValidationPipe({ whitelist: true, transform: true })`, and graceful shutdown hooks. Port comes from `PORT` (default 3000).

### Configuration
`ConfigModule` uses a Joi schema in `app.module.ts` to validate env at boot. Notable variables:
- `DATABASE_URL` (required), `REDIS_URL`
- `JWT_SECRET`, `JWT_EXPIRES_IN` (default `15m`)
- `STORAGE_DRIVER` (`s3` | `stub`), plus `S3_*` settings
- Per-carrier tokens (see `CARRIER_IMPLEMENTATION_SUMMARY.md`)
- Payment: `STRIPE_*` / `RAZORPAY_*` / `PAYMENT_DEFAULT_GATEWAY`
- Email: `SENDGRID_API_KEY` or `SMTP_*` + `EMAIL_FROM`
- `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SHOPIFY_SCOPES`
- GSTN fields for compliance (`GSTN_API_URL`, `GSTN_API_KEY`, …)

## Conventions for adding a new module

1. Create `src/<feature>/` with `*.module.ts`, `*.resolver.ts`, `*.service.ts`, `*.model.ts`, `*.input.ts`.
2. Annotate models/inputs with GraphQL decorators (`@ObjectType`, `@Field`, `@InputType`) — schema is auto-generated into `src/schema.graphql` on boot, do not hand-edit.
3. Inject `PrismaService`; map Prisma errors to NestJS HTTP exceptions (`NotFoundException`, `BadRequestException`, `ConflictException`, `UnauthorizedException`).
4. Add the module to the `imports` array of `AppModule`.
5. For a new carrier, implement `CarrierAdapter` in `src/carriers/adapters/<name>.adapter.ts` and register it in `carrier-adapter.service.ts` guarded by env credentials.
6. Use `QueuesService` for any work that should not block the GraphQL request loop (label gen, webhook delivery).
7. Co-locate `*.spec.ts` tests with the code they cover; e2e tests in `test/`.

## Module readiness / architecture references
The repository ships with extensive module-readiness documentation (audit-style markdowns) at the repo root: `MODULE_READINESS_ASSESSMENT.md`, `COMPREHENSIVE_MODULE_READINESS_ASSESSMENT.md`, `EXECUTIVE_SUMMARY_MODULE_READINESS.md`, `FEATURE_COMPARISON_AND_GAP_ANALYSIS.md`, `HEAVY_LIFT_COMPLETE.md`, `IMPLEMENTATION_SUMMARY.md`, `BILLING_AND_BULK_OPERATIONS_IMPLEMENTATION.md`. These describe per-module status, gaps vs Shiprocket, and audit findings — consult them before planning work on a specific module rather than re-deriving its state.
