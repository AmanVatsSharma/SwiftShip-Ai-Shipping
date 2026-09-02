/**
 * Smoke test for @swiftship/node.
 *
 * This file is a placeholder that the openapi-generator-cli will
 * preserve on regeneration (see scripts/build-sdks.mjs, `buildNode`).
 * It exercises the two things the public surface guarantees:
 *
 *   1. `Configuration` is exported (and instantiable).
 *   2. `createClient()` returns a configured `Configuration`.
 *
 * Real generated API classes (e.g. `OrdersApi`) live under `src/apis/`
 * and are re-exported through the same entry point loaded here.
 *
 * The test runs on Node's BUILT-IN runner — `node --test` — against
 * the compiled `dist/index.test.js` (the `test` npm script). No jest,
 * mocha, vitest or any other test dependency is required. It uses
 * `node:test` for describe/it and `node:assert/strict` for assertions.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Configuration, createClient } from './index';

describe('@swiftship/node', () => {
  it('exports Configuration', () => {
    assert.equal(typeof Configuration, 'function');
  });

  it('createClient() returns a Configuration with the right basePath', () => {
    const c = createClient({ basePath: 'https://example.test' });
    assert.ok(c instanceof Configuration);
    assert.equal(c.basePath, 'https://example.test');
  });

  it('createClient() defaults to the production basePath', () => {
    const c = createClient();
    assert.ok(c instanceof Configuration);
    assert.equal(c.basePath, 'https://api.swiftship.ai');
  });

  it('createClient() attaches a bearer token when one is provided', async () => {
    const c = createClient({ token: 'test-jwt' });
    assert.ok(c instanceof Configuration);
    // The generated Configuration exposes `accessToken` through a
    // getter that wraps the stored string in an async function; other
    // shapes are a plain string or Promise. Normalise, then compare.
    const accessToken = (
      c as unknown as {
        accessToken?:
          | string
          | Promise<string>
          | (() => string | Promise<string>);
      }
    ).accessToken;
    const resolved =
      typeof accessToken === 'function' ? await accessToken() : accessToken;
    assert.equal(await resolved, 'test-jwt');
  });
});
