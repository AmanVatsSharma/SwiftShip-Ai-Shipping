import { Injectable, Scope } from '@nestjs/common';
import type { TenantTier } from './enums';

/**
 * Request-scoped holder for the tenant identity that the current HTTP / GraphQL
 * request is acting on behalf of.
 *
 * Populated by `TenantMiddleware` (which resolves `tenantId` from either the
 * `x-swiftship-api-key` header or the JWT `tenantId` claim) and read by
 * downstream guards and services that need to know whose context they're in
 * — including the per-tenant throttler (`TenantThrottlerGuard`).
 *
 * The throttler stays agnostic of the tenant lib: it reads `req.tenantId`
 * (set on the request by `TenantMiddleware`) but, if a future resolver wants
 * an explicit injected handle, `TenantContext` is the contract.
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  private tenantIdValue: number | string | null = null;
  private tierValue: TenantTier | null = null;

  /**
   * Bind this request to a tenant. Called by `TenantMiddleware` after the
   * tenant is resolved.
   */
  setTenant(tenantId: number | string, tier?: TenantTier): void {
    this.tenantIdValue = tenantId;
    if (tier) this.tierValue = tier;
  }

  /**
   * Explicit tier override (e.g. set by a GraphQL `@Context` decorator that
   * already knows the tier from a database lookup).
   */
  setTier(tier: TenantTier): void {
    this.tierValue = tier;
  }

  getTenantId(): number | string | null {
    return this.tenantIdValue;
  }

  getTier(): TenantTier | null {
    return this.tierValue;
  }

  hasTenant(): boolean {
    return this.tenantIdValue !== null && this.tenantIdValue !== undefined;
  }
}
