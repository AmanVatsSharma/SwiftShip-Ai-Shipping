# @swiftship/node

Node.js / TypeScript SDK for the **SwiftShip AI** public REST API. Auto-generated from the OpenAPI 3.0 spec at `apps/api-public/src/generated/openapi.json` using the [`typescript-fetch`](https://openapi-generator.tech/docs/generators/typescript-fetch/) openapi-generator-cli template.

## Status

SS-027b — initial scaffold. The hand-rolled wrapper (`src/index.ts`) survives regeneration; the rest of the package is replaced on every `npm run build`.

## Install

```bash
# from the monorepo root, after SS-027a has emitted the OpenAPI spec:
node scripts/build-sdks.mjs --only=node

# then consume it as a workspace package:
#   pnpm add @swiftship/node@workspace:packages/node
# or:
#   npm install ./packages/node
```

## Usage

```ts
import { Configuration, createClient, OrdersApi } from '@swiftship/node';

const config = createClient({
  basePath: 'https://api.swiftship.ai', // default
  token: process.env.SWIFTSHIP_API_TOKEN,
});

const orders = new OrdersApi(config);
const list = await orders.listOrders(20, 0);
console.log(list);
```

`createClient()` is a thin convenience that constructs a `Configuration` (the openapi-generator-cli runtime class) with the base URL and bearer token pre-wired. If you need fine-grained control (custom fetch impl, middleware, multiple base paths), instantiate `Configuration` directly.

## Regenerate

```bash
cd packages/node
npm run build          # → node ../../scripts/build-sdks.mjs --only=node
```

Idempotent: re-running overwrites everything in `dist/` and `src/generated/` and restores the hand-rolled wrapper.

## Acceptance (from SS-027b)

1. `npx tsc -p packages/node/tsconfig.json --noEmit` exits 0
2. `packages/node/dist/index.d.ts` exports `Configuration`
3. `node -e "require('./packages/node/dist')"` works

## Constraints

- The openapi-generator-cli is a devDep of `apps/api-public`, not the root. If `node_modules/.bin/openapi-generator-cli` is missing, run `npm install` (root) or `npm install --prefix apps/api-public` — do not add it to the root `devDependencies`.
- The generated `dist/` is git-ignored; the source of truth is the OpenAPI spec.
