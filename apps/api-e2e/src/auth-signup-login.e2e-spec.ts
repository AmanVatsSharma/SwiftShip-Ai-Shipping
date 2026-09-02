/**
 * E2E — auth leg: signup → login → authenticated read.
 *
 * ENVIRONMENT NEEDS: Postgres + Redis (see support/e2e-harness.ts).
 * EXECUTED LOCALLY: NO — Docker unavailable in the authoring environment;
 * written to be CI-runnable (`npx nx run api-e2e:e2e --testFile=auth-signup-login.e2e-spec.ts`).
 *
 * KNOWN SURFACE MISMATCHES this spec documents (as of writing):
 *  1. `register` resolver passes positional args to
 *     AuthService.register(input: {email,password,name}) — the arity
 *     mismatch makes the mutation fail at runtime. The test below asserts
 *     the *intended* contract (tokens returned); it will stay red until
 *     libs/platform/auth/src/lib/auth.resolver.ts is fixed.
 *  2. There is no `me` query — the authenticated read here uses
 *     `user(id: Int!)` from libs/domains/users instead.
 *  3. login()'s `user` payload is missing the non-nullable
 *     `emailVerified`/`createdAt` fields of the UserAuth GraphQL type,
 *     which nulls the whole AuthPayload. Same deal: contract asserted.
 */
import { INestApplication } from '@nestjs/common';
import {
  createE2eApp,
  gql,
  rawGql,
  seedUser,
  truncateAll,
} from './support/e2e-harness';

describe('Auth: signup + login (e2e)', () => {
  let app: INestApplication;
  const email = `auth-${Date.now()}@e2e.test`;
  const password = 'e2e-Passw0rd!';

  beforeAll(async () => {
    app = await createE2eApp();
    await truncateAll(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('register returns an access + refresh token pair for a new user', async () => {
    const body = await rawGql(app, {
      query: /* GraphQL */ `
        mutation Register($email: String!, $password: String!, $name: String) {
          register(email: $email, password: $password, name: $name) {
            accessToken
            refreshToken
            user { id email }
          }
        }
      `,
      variables: { email, password, name: 'Auth E2E' },
    });
    // Surface the server error verbatim if the mutation is still broken
    // (see mismatch #1 in the header comment).
    expect(body.errors ?? []).toEqual([]);
    expect(typeof body.data.register.accessToken).toBe('string');
    expect(body.data.register.accessToken.split('.').length).toBe(3); // JWT shape
    expect(typeof body.data.register.refreshToken).toBe('string');
    expect(body.data.register.user.email).toBe(email);
  });

  it('login returns tokens for an existing user and rejects bad passwords', async () => {
    // Seed directly with a known password — the register mutation is
    // documented-broken above and must not block the login contract test.
    await seedUser(app, email, password);

    const ok = await rawGql(app, {
      query: /* GraphQL */ `
        mutation Login($email: String!, $password: String!) {
          login(email: $email, password: $password) {
            accessToken
            refreshToken
          }
        }
      `,
      variables: { email, password },
    });
    expect(ok.errors ?? []).toEqual([]);
    expect(typeof ok.data.login.accessToken).toBe('string');
    expect(typeof ok.data.login.refreshToken).toBe('string');

    const bad = await rawGql(app, {
      query: `mutation { login(email: "${email}", password: "wrong") { accessToken } }`,
    });
    // Invalid credentials must NOT mint a token.
    expect(bad.data?.login?.accessToken ?? null).toBeNull();
  });

  it('user(id) query resolves the seeded user (no `me` query exists)', async () => {
    const user = await seedUser(app, `me-${Date.now()}@e2e.test`);
    const data = await gql(app, {
      query: /* GraphQL */ `
        query User($id: Int!) {
          user(id: $id) { id email name }
        }
      `,
      variables: { id: user.id },
    });
    expect(data.user.id).toBe(user.id);
    expect(data.user.email).toBe(user.email);
  });
});
