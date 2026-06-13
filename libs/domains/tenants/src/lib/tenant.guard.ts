import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { GqlExecutionContext } from '@nestjs/graphql';
import type { TenantService } from './tenant.service';

export interface RequestWithTenant {
  tenantId?: number;
  user?: { tenantId?: number };
  headers: Record<string, string | string[] | undefined>;
}

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly tenants: TenantService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const gqlCtx = context.getArgByIndex
      ? null
      : null;
    void gqlCtx;

    const req =
      (context.switchToHttp?.().getRequest?.() as RequestWithTenant | undefined) ??
      (context.getArgByIndex(2)?.req as RequestWithTenant | undefined) ??
      (context.getArgByIndex(0) as RequestWithTenant | undefined);

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
