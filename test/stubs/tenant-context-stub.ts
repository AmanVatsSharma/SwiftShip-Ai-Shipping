// Test-only stub for @swiftship/domains-tenants/lib/tenant.context.
// The real barrel transitively pulls in onboarding.service which
// depends on UserEntity and other platform-typeorm entities that
// crash at module-load time. Tests get a lightweight TenantContext.

export class TenantContext {
  private current: number | null = null;

  setTenant(id: number | null): void {
    this.current = id;
  }

  getTenantId(): number | null {
    return this.current;
  }

  requireTenantId(): number {
    if (this.current == null) {
      throw new Error('Tenant context is not set');
    }
    return this.current;
  }

  run<T>(tenantId: number, fn: () => Promise<T> | T): Promise<T> | T {
    const previous = this.current;
    this.current = tenantId;
    try {
      return fn();
    } finally {
      this.current = previous;
    }
  }
}
