/**
 * Tenant-context helpers — request-scoped tenantId plumbing shared between
 * the API and the platform libs.
 *
 * The PrismaCompat shim previously owned these helpers. With the shim
 * removed (SS-044), they live here as a minimal AsyncLocalStorage-backed
 * utility. Services that need the current tenantId should prefer the
 * `TenantContext` provider from `@swiftship/domains-tenants` (request-scoped,
 * Nest-idiomatic) — these helpers exist for the few cross-cutting cases
 * that run before any request binds (e.g. a BullMQ worker, a cron job).
 *
 * Usage:
 *   - AppModule.onModuleInit:  `configureTenantContext({ getTenantId: ... })`
 *   - Per-request middleware:  `bindTenantContext(tenantId, () => next())`
 *   - To read:                 `getCurrentTenantId()`
 *
 * `SYSTEM_TENANT_ID` is a sentinel for "act as the system, bypass the
 * tenant filter." It is reserved for jobs / migrations / health checks.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

/** Sentinel that means "system context — bypass tenant filters". */
export const SYSTEM_TENANT_ID = -1;

const tenantAls = new AsyncLocalStorage<number | typeof SYSTEM_TENANT_ID>();

let getTenantIdFn: (() => number | string | null | undefined) | null = null;

/**
 * Configure the tenant resolver. Called once at AppModule boot.
 * `getTenantId` is invoked when a request pipeline needs to resolve the
 * active tenant but the ALS slot is empty (e.g. a worker that processes
 * a single read).
 */
export const configureTenantContext = (opts: {
  getTenantId: () => number | string | null | undefined;
}) => {
  getTenantIdFn = opts.getTenantId;
};

/**
 * Run `fn` as if it were the current request. The shim's tenant lookup
 * uses `als.getStore()` first, then falls back to `getTenantIdFn()`.
 */
export const bindTenantContext = <T>(
  tenantId: number | typeof SYSTEM_TENANT_ID | undefined,
  fn: () => T | Promise<T>,
): T | Promise<T> => {
  return tenantAls.run(tenantId as number, fn);
};

/**
 * Resolve the current tenantId, honouring system overrides.
 */
export const getCurrentTenantId = ():
  | number
  | typeof SYSTEM_TENANT_ID
  | undefined => {
  const override = tenantAls.getStore();
  if (override === SYSTEM_TENANT_ID) return SYSTEM_TENANT_ID;
  if (override !== undefined) return override;
  if (!getTenantIdFn) return undefined;
  const resolved = getTenantIdFn();
  if (resolved === undefined || resolved === null) return undefined;
  return Number(resolved);
};
