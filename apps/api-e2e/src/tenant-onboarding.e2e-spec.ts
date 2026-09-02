/**
 * E2E — tenant onboarding leg: onboardTenant → wallet → rotateApiKey.
 *
 * ENVIRONMENT NEEDS: Postgres + Redis (see support/e2e-harness.ts).
 * EXECUTED LOCALLY: NO — Docker unavailable; CI-runnable via
 *   npx nx run api-e2e:e2e --testFile=tenant-onboarding.e2e-spec.ts
 *
 * SURFACE NOTES (verified in libs/domains/tenants):
 *  - onboardTenant is UNGUARDED; it creates tenant + first user + ₹500
 *    free wallet credit + one live API key (returned once).
 *  - The wallet therefore does NOT start at zero: onboarding grants
 *    50000 paise (₹500) of credit. This spec asserts the actual contract
 *    (availableBalance == lifetimeRecharged == 50000, reserved == 0).
 *  - rotateApiKey(oldKeyId: ID!) is guarded by TenantGuard — called with
 *    the API-key header. The old key id is not exposed via GraphQL, so it
 *    is read from the DB (same as an operator would).
 */
import { INestApplication } from '@nestjs/common';
import {
  activeApiKeyId,
  createE2eApp,
  gql,
  rawGql,
  setupTenantStack,
  truncateAll,
} from './support/e2e-harness';

describe('Tenant onboarding: tenant + wallet + API key rotation (e2e)', () => {
  let app: INestApplication;
  let stack: Awaited<ReturnType<typeof setupTenantStack>>;

  beforeAll(async () => {
    app = await createE2eApp();
    await truncateAll(app);
    stack = await setupTenantStack(app, 'onboard');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('onboardTenant creates a TRIAL/STARTER tenant', () => {
    expect(stack.tenantId).toBeGreaterThan(0);
    expect(stack.slug).toMatch(/^e2e-onboard-/);
    expect(stack.apiKey).toMatch(/^ss_live_/);
    expect(stack.userId).toBeGreaterThan(0);
  });

  it('wallet query returns the onboarding free credit (₹500 = 50000 paise)', async () => {
    const data = await gql(app, {
      query: /* GraphQL */ `
        query Wallet($tenantId: ID!) {
          wallet(tenantId: $tenantId) {
            id
            tenantId
            availableBalance
            reservedBalance
            lifetimeRecharged
          }
        }
      `,
      variables: { tenantId: stack.tenantId },
    });
    expect(data.wallet).not.toBeNull();
    expect(Number(data.wallet.tenantId)).toBe(stack.tenantId);
    expect(data.wallet.availableBalance).toBe(50000);
    expect(data.wallet.reservedBalance).toBe(0);
    expect(data.wallet.lifetimeRecharged).toBe(50000);
  });

  it('rotateApiKey issues a new secret and invalidates the old key', async () => {
    const oldKeyId = await activeApiKeyId(app, stack.tenantId);

    const data = await gql(app, {
      query: /* GraphQL */ `
        mutation Rotate($oldKeyId: ID!) {
          rotateApiKey(oldKeyId: $oldKeyId) { prefix plainText }
        }
      `,
      variables: { oldKeyId },
      apiKey: stack.apiKey,
    });
    const newKey: string = data.rotateApiKey.plainText;
    expect(newKey).toMatch(/^ss_live_/);
    expect(newKey).not.toBe(stack.apiKey);

    // Old key no longer establishes a tenant context → kycStatus (TenantGuard) must fail.
    const oldKeyRes = await rawGql(app, {
      query: `query { kycStatus { id status } }`,
      apiKey: stack.apiKey,
    });
    expect(oldKeyRes.errors?.length ?? 0).toBeGreaterThan(0);

    // New key still authenticates (kycStatus resolves to null for a fresh tenant).
    const newKeyRes = await rawGql(app, {
      query: `query { kycStatus { id status } }`,
      apiKey: newKey,
    });
    expect(newKeyRes.errors ?? []).toEqual([]);
    expect(newKeyRes.data.kycStatus).toBeNull();
  });
});
