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
 * Real generated API classes (e.g. `OrdersApi`) live under
 * `./generated/apis/` and are exercised by the `dist/` build's
 * downstream consumers — the test runner here is just the smoke bar.
 */

import { Configuration, createClient } from './index';

describe('@swiftship/node', () => {
  it('exports Configuration', () => {
    expect(typeof Configuration).toBe('function');
  });

  it('createClient() returns a Configuration with the right basePath', () => {
    const c = createClient({ basePath: 'https://example.test' });
    expect(c).toBeInstanceOf(Configuration);
    expect(c.basePath).toBe('https://example.test');
  });

  it('createClient() defaults to the production basePath', () => {
    const c = createClient();
    expect(c).toBeInstanceOf(Configuration);
    expect(c.basePath).toBe('https://api.swiftship.ai');
  });

  it('createClient() attaches a bearer token when one is provided', () => {
    const c = createClient({ token: 'test-jwt' });
    expect(c).toBeInstanceOf(Configuration);
    // Generated config exposes accessToken; withInterfaces=true gives us
    // the typed shape. Cast to `any` so we don't fight the d.ts file.
    expect((c as unknown as { accessToken?: string }).accessToken).toBe('test-jwt');
  });
});
