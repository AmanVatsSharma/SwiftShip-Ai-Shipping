/**
 * @swiftship/node — SwiftShip AI Node.js SDK
 *
 * This file is the public entry point. The real SDK body is generated
 * by `scripts/build-sdks.mjs` (openapi-generator-cli, typescript-fetch
 * template) into `dist/`. This wrapper re-exports the generated
 * `Configuration` class plus a hand-rolled `createClient()` factory
 * that pre-configures the base URL and bearer token.
 *
 * Generation contract (see `scripts/build-sdks.mjs`):
 *   npx @openapitools/openapi-generator-cli generate
 *     -g typescript-fetch
 *     -i ../../apps/api-public/src/generated/openapi.json
 *     -o ..
 *     --additional-properties=npmName=@swiftship/node,supportsES6=true,
 *                            withInterfaces=true,stringEnums=true
 *
 * Re-generate by running `npm run build` from this package directory.
 */

export * from './generated';

// `Configuration` is exported by the generated runtime/api.ts module.
import { Configuration } from './generated/runtime';
export { Configuration };

/**
 * Create a pre-configured SDK client.
 *
 * @param opts - base URL and optional bearer token
 * @returns an `Configuration` instance usable by the generated API classes
 *
 * @example
 *   import { Configuration, OrdersApi } from '@swiftship/node';
 *   const config = createClient({ basePath: 'https://api.swiftship.ai', token: '...' });
 *   const orders = new OrdersApi(config);
 *   const list = await orders.listOrders(20, 0);
 */
export interface ClientOptions {
  /** Base URL of the SwiftShip public API. Defaults to production. */
  basePath?: string;
  /** Bearer token (JWT) to attach as `Authorization: Bearer <token>`. */
  token?: string;
}

export function createClient(opts: ClientOptions = {}): Configuration {
  const basePath = opts.basePath ?? 'https://api.swiftship.ai';
  const token = opts.token;
  return new Configuration({
    basePath,
    ...(token
      ? {
          accessToken: token,
          baseOptions: {
            headers: { Authorization: `Bearer ${token}` },
          },
        }
      : {}),
  });
}
