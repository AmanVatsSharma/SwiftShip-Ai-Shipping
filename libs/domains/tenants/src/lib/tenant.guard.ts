import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
// NOTE: value import, NOT `import type` — Nest DI relies on
// emitDecoratorMetadata reflecting constructor param types; a type-only
// import erases the type, the param reflects as `Object`, and the
// container cannot resolve it (found by the first live boot test).
import { TenantService } from './tenant.service';

export interface RequestWithTenant {
  tenantId?: number;
  user?: { tenantId?: number };
}

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly tenants: TenantService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const httpReq = context.switchToHttp?.().getRequest?.() as
      | RequestWithTenant
      | undefined;
    const gqlReq = context.getArgByIndex?.(0) as
      | { req?: RequestWithTenant }
      | undefined;
    const req = httpReq ?? gqlReq?.req;

    if (!req) {
      throw new ForbiddenException('No request context');
    }

    const tenantId = req.tenantId ?? req.user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('No tenant context');
    }

    const tenant = await this.tenants.findById(tenantId);
    if (tenant.status === 'SUSPENDED') {
      throw new ForbiddenException('Tenant is suspended');
    }

    return true;
  }
}
