/**
 * Shared e2e harness for the SwiftShip money-path suites.
 *
 * ENVIRONMENT NEEDS: Postgres + Redis must be reachable
 *   - DATABASE_URL (or DATABASE_URL_TEST) — defaults to
 *     postgres://swiftship:swiftship@localhost:5432/swiftship_test
 *   - REDIS_URL — defaults to redis://localhost:6379 (BullMQ queues)
 *
 * NOTES ON THE SURFACE (verified against the resolvers in libs/):
 *  - There is no `me` GraphQL query. The closest authenticated read is
 *    `user(id: Int!)` (libs/domains/users/src/lib/users.resolver.ts).
 *  - Login JWTs do NOT carry a tenantId claim, so they do not establish a
 *    tenant context. Tenant-scoped operations are driven either with the
 *    `x-swiftship-api-key` header (resolved by TenantMiddleware) or with a
 *    JWT minted with a `tenantId` claim — this harness does the latter for
 *    resolvers guarded by GqlAuthGuard + RolesGuard.
 *  - Order/shipment resolvers require roles ADMIN/STAFF(/SELLER), so the
 *    minted JWT carries `roles: ['ADMIN']`.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ContextIdFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../../../api/src/app.module';
import { TenantContext, TenantApiKeyEntity } from '@swiftship/domains-tenants';
import {
  CarrierEntity,
  UserEntity,
  WarehouseEntity,
} from '@swiftship/platform-typeorm';

/** Configure env before the AppModule compiles (Joi validates DATABASE_URL). */
export function configureE2eEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-test-secret';
  process.env.STORAGE_DRIVER = 'stub';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL_TEST ||
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/swiftship_test';
}

/** Boot the full AppModule (same shape as health.e2e-spec.ts). */
export async function createE2eApp(): Promise<INestApplication> {
  configureE2eEnv();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  // NOTE: no whitelist:true here — main.ts dropped it (it strips GraphQL
  // input fields without class-validator decorators; SS-102). transform-only
  // pipe mirrors the production bootstrap's coercion behavior.
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();
  return app;
}

export interface GqlOptions {
  query: string;
  variables?: Record<string, unknown>;
  /** Plain-text SwiftShip API key (x-swiftship-api-key header). */
  apiKey?: string;
  /** Bearer JWT (must carry `roles` for role-guarded resolvers). */
  token?: string;
}

/** POST /graphql and return the raw supertest response body. */
export async function rawGql(app: INestApplication, opts: GqlOptions) {
  const headers: Record<string, string> = {};
  if (opts.apiKey) headers['x-swiftship-api-key'] = opts.apiKey;
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await request(app.getHttpServer())
    .post('/graphql')
    .set(headers)
    .send({ query: opts.query, variables: opts.variables });
  if (res.status !== 200) {
    throw new Error(
      `GraphQL HTTP ${res.status} for operation starting with: ${opts.query
        .trim()
        .slice(0, 80)}\nbody: ${JSON.stringify(res.body).slice(0, 500)}`,
    );
  }
  return res.body as { data?: any; errors?: any[] };
}

/**
 * POST /graphql, failing fast with a readable message on GraphQL errors.
 * Use rawGql() when a spec intentionally exercises an error path.
 */
export async function gql<T = any>(
  app: INestApplication,
  opts: GqlOptions,
): Promise<T> {
  const body = await rawGql(app, opts);
  if (body.errors?.length) {
    throw new Error(
      `GraphQL errors for operation starting with: ${opts.query
        .trim()
        .slice(0, 80)}\n${JSON.stringify(body.errors, null, 2).slice(0, 1000)}`,
    );
  }
  return body.data as T;
}

/**
 * TRUNCATE every registered entity table in one statement.
 * Run in beforeAll of each suite so suites are order-independent.
 */
export async function truncateAll(app: INestApplication): Promise<void> {
  const ds = app.get(DataSource);
  const tables = ds.entityMetadatas
    .map((m) => m.tableName)
    .filter((t, i, arr) => arr.indexOf(t) === i);
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t}"`).join(', ');
  await ds.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export interface TenantStack {
  tenantId: number;
  slug: string;
  userId: number;
  email: string;
  /** Plain-text API key — returned exactly once by onboardTenant. */
  apiKey: string;
  /** JWT carrying sub/email/roles + tenantId (for role-guarded resolvers). */
  token: string;
  carrierId: number;
  warehouseId: number;
}

const ONBOARD_MUTATION = /* GraphQL */ `
  mutation Onboard($input: OnboardTenantInput!) {
    onboardTenant(input: $input) {
      tenant { id slug name status tier }
      user { id email name }
      apiKey { prefix plainText }
    }
  }
`;

/**
 * Create a fresh tenant via the public onboardTenant mutation, then seed
 * the minimum rows the order/shipment legs need:
 *  - an active warehouse (createOrder always allocates one)
 *  - a `SANDBOX` carriers row (matches the always-registered sandbox
 *    adapter, so generateShippingLabel finds an adapter)
 * Returns the stack incl. a minted ADMIN JWT bound to the tenant.
 */
export async function setupTenantStack(
  app: INestApplication,
  label: string,
): Promise<TenantStack> {
  const email = `owner-${label}-${Date.now()}-${Math.floor(
    Math.random() * 1e6,
  )}@e2e.test`;
  const name = `E2E ${label} ${Date.now()}`;
  const data = await gql(app, {
    query: ONBOARD_MUTATION,
    variables: {
      input: { name, email, password: 'e2e-Passw0rd!', contactPhone: '9999999999' },
    },
  });
  const tenantId = Number(data.onboardTenant.tenant.id);
  const userId = Number(data.onboardTenant.user.id);
  const apiKey = data.onboardTenant.apiKey.plainText as string;

  const warehouse = await seedWarehouse(app, tenantId, label);
  const carrier = await seedSandboxCarrier(app, tenantId);
  const token = mintTenantJwt(app, { userId, email, tenantId });
  return {
    tenantId,
    slug: data.onboardTenant.tenant.slug,
    userId,
    email,
    apiKey,
    token,
    carrierId: carrier.id,
    warehouseId: warehouse.id,
  };
}

export async function seedWarehouse(
  app: INestApplication,
  tenantId: number,
  label: string,
): Promise<WarehouseEntity> {
  const ds = app.get(DataSource);
  const repo = ds.getRepository(WarehouseEntity);
  return repo.save(
    repo.create({
      name: `E2E Warehouse ${label}`,
      code: `E2E${label.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)}`,
      addressLine1: '1 Test Street',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
      country: 'India',
      isActive: true,
      tenantId,
    }),
  );
}

export async function seedSandboxCarrier(
  app: INestApplication,
  tenantId: number,
): Promise<CarrierEntity> {
  const ds = app.get(DataSource);
  const repo = ds.getRepository(CarrierEntity);
  return repo.save(
    repo.create({
      // `name` must equal the adapter code the CarrierAdapterService
      // registers (libs/platform/carriers — SANDBOX is always available).
      name: 'SANDBOX',
      apiKey: 'sandbox-not-a-real-key',
      tenantId,
    }),
  );
}

export function mintTenantJwt(
  app: INestApplication,
  payload: { userId: number; email: string; tenantId: number; roles?: string[] },
): string {
  return app.get(JwtService).sign({
    sub: payload.userId,
    email: payload.email,
    roles: payload.roles ?? ['ADMIN'],
    // Read by TenantMiddleware to bind the tenant context (SS-002c).
    tenantId: payload.tenantId,
  });
}

/**
 * Insert a plain user row (tenantId 1, matching the column default).
 * When `password` is given it is bcrypt-hashed exactly like
 * AuthService.register/onboardTenant do, so the login mutation works.
 */
export async function seedUser(
  app: INestApplication,
  email: string,
  password?: string,
): Promise<UserEntity> {
  const ds = app.get(DataSource);
  const repo = ds.getRepository(UserEntity);
  const passwordHash = password ? await bcrypt.hash(password, 4) : undefined;
  return repo.save(
    repo.create({
      email,
      name: 'E2E User',
      tenantId: 1,
      ...(passwordHash ? { password: passwordHash } : {}),
    }),
  );
}

/** Look up the active API-key row for a tenant (for rotateApiKey). */
export async function activeApiKeyId(
  app: INestApplication,
  tenantId: number,
): Promise<number> {
  const repo = app.get(DataSource).getRepository(TenantApiKeyEntity);
  const row = await repo.findOne({
    where: { tenantId, isActive: true },
    order: { id: 'DESC' },
  });
  if (!row) throw new Error(`No active API key found for tenant ${tenantId}`);
  return row.id;
}

/**
 * Resolve a REQUEST-scoped service (anything injecting TenantContext) with
 * the tenant pre-bound — the programmatic equivalent of an authenticated
 * request. Returns a resolver for the given contextId.
 *
 * Needed because TenantContext is @Injectable({ scope: REQUEST }); services
 * like CodRemittanceService/NdrService/KycService cannot be app.get()'d.
 */
export function scopedTenantResolver(
  app: INestApplication,
  tenantId: number,
): <T>(cls: new (...args: any[]) => T) => Promise<T> {
  const contextId = ContextIdFactory.create();
  let bound = false;
  return async <T>(cls: new (...args: any[]) => T): Promise<T> => {
    if (!bound) {
      const ctx = await app.resolve<TenantContext>(TenantContext, contextId, {
        strict: false,
      });
      ctx?.setTenant(tenantId);
      bound = true;
    }
    return app.resolve<T>(cls, contextId, { strict: false });
  };
}

const GSTIN_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * GSTN checksum (same algorithm as
 * libs/domains/onboarding/src/lib/kyc/gstin-validator.ts): weighted
 * Luhn-like sum over the first 14 chars; the 15th char brings the total
 * mod 36 to 0. Used to build a format-valid GSTIN embedding a given PAN.
 */
export function gstinChecksum(gstin14: string): string {
  if (gstin14.length !== 14) throw new Error('GSTIN prefix must be 14 chars');
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = GSTIN_ALPHABET.indexOf(gstin14.charAt(i));
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 10) + (product % 10);
  }
  return GSTIN_ALPHABET[(36 - (sum % 36)) % 36];
}

/** Build a checksum-valid GSTIN (state 27 = Maharashtra) for a PAN. */
export function validGstinForPan(pan: string): string {
  const prefix = `27${pan}1Z`;
  return prefix + gstinChecksum(prefix);
}
