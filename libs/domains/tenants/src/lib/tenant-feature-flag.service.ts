import { Injectable } from '@nestjs/common';

/**
 * In-memory feature flag store, scoped per-tenant. Only used by tests / manual
 * usage in W1. Persistence is wired by SS-005.
 */
@Injectable()
export class TenantFeatureFlagService {
  private readonly store = new Map<number, Map<string, unknown>>();

  flag<T = unknown>(tenantId: number, key: string, defaultValue: T): T {
    const tenantFlags = this.store.get(tenantId);
    if (!tenantFlags) return defaultValue;
    const value = tenantFlags.get(key);
    return (value ?? defaultValue) as T;
  }

  setFlag(tenantId: number, key: string, value: unknown): void {
    let tenantFlags = this.store.get(tenantId);
    if (!tenantFlags) {
      tenantFlags = new Map();
      this.store.set(tenantId, tenantFlags);
    }
    tenantFlags.set(key, value);
  }

  clear(tenantId: number): void {
    this.store.delete(tenantId);
  }
}
