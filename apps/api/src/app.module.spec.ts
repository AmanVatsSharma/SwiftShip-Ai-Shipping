import { TenantThrottlerGuard } from '@swiftship/platform-throttler';
import { TenantContext } from '@swiftship/domains-tenants';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerModuleOptions } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';

/**
 * SS-003b smoke test: asserts that the wiring in `app.module.ts` is
 * actually meaningful — i.e. that the `TenantThrottlerGuard` is
 * instantiable, that the `TenantContext` request-scoped provider is
 * constructable, and that the guard's `getTracker` returns a
 * `tenant:<id>` tracker (not the IP fallback) when either the request
 * or the request-scoped `TenantContext` carries an id.
 *
 * We don't boot the full Nest container here — the Postgres-throttler
 * module would require a live DB connection. The full integration is
 * covered by the e2e suite; this test is the unit-level guard wiring
 * guarantee.
 */
describe('AppModule throttler wiring (SS-003b)', () => {
  const options: ThrottlerModuleOptions = {
    throttlers: [{ name: 'tenant', ttl: 60_000, limit: 60 }],
  };

  function buildGuard(): TenantThrottlerGuard {
    const storage = {} as ThrottlerStorage;
    const reflector = {} as Reflector;
    return new TenantThrottlerGuard(options, storage, reflector);
  }

  it('instantiates TenantThrottlerGuard without error', () => {
    const guard = buildGuard();
    expect(guard).toBeInstanceOf(TenantThrottlerGuard);
  });

  it('uses the IP/anonymous fallback when no tenant identity is on the request', async () => {
    const guard = buildGuard();
    const tracker = await (guard as any).getTracker({});
    expect(tracker).toBe('tenant:anonymous');
  });

  it('returns tenant:<id> when req.tenantId is set by TenantMiddleware', async () => {
    const guard = buildGuard();
    const tracker = await (guard as any).getTracker({ tenantId: 42 });
    expect(tracker).toBe('tenant:42');
  });

  it('prefers req.user.tenantId (set by JwtStrategy) over a raw userId', async () => {
    const guard = buildGuard();
    const tracker = await (guard as any).getTracker({
      user: { userId: 7, tenantId: 99 },
    });
    expect(tracker).toBe('tenant:99');
  });

  it('prefers TenantContext.getTenantId() when the request-scoped context is reachable on the request', async () => {
    const ctx = new TenantContext();
    ctx.setTenant(123, 'PRO');
    const guard = buildGuard();
    const tracker = await (guard as any).getTracker({
      tenantContext: ctx,
      // Even with a conflicting property, the TenantContext wins.
      tenantId: 999,
    });
    expect(tracker).toBe('tenant:123');
  });

  it('falls back gracefully if the TenantContext has no tenant set', async () => {
    const ctx = new TenantContext();
    const guard = buildGuard();
    const tracker = await (guard as any).getTracker({
      tenantContext: ctx,
    });
    expect(tracker).toBe('tenant:anonymous');
  });

  it('exposes a request-scoped TenantContext that the middleware can populate', () => {
    const ctx = new TenantContext();
    expect(ctx.hasTenant()).toBe(false);
    expect(ctx.getTenantId()).toBeNull();
    expect(ctx.getTier()).toBeNull();

    ctx.setTenant(7, 'GROWTH');
    expect(ctx.hasTenant()).toBe(true);
    expect(ctx.getTenantId()).toBe(7);
    expect(ctx.getTier()).toBe('GROWTH');

    ctx.setTier('ENTERPRISE');
    expect(ctx.getTier()).toBe('ENTERPRISE');
  });
});
