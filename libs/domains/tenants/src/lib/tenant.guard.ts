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
    // GraphQL resolver args are (root, args, context, info) — the Express
    // request lives on the CONTEXT (index 2) because our GraphQLModule
    // context factory is `({ req }) => ({ req })`. Reading index 0 (root)
    // silently yielded undefined and 403'd every guarded mutation (found
    // by the e2e money-path suites).
    const gqlContext = context.getArgByIndex?.(2) as
      | { req?: RequestWithTenant }
      | undefined;
    const req: RequestWithTenant | undefined =
      gqlContext?.req ??
      (context.switchToHttp?.().getRequest?.() as
        | RequestWithTenant
        | undefined);

    if (!req) {
      throw new ForbiddenException('No request context');
    }

    // Accept every tenant-bearing shape in play: the TenantMiddleware's
    // req.tenantId (API key / JWT flows), and JWT user claims — apps mint
    // both `tenantId` and the platform-auth `sub`+`tenantId` pair.
    const user = req.user as
      | { tenantId?: number; sub?: number; userId?: number }
      | undefined;
    const tenantId = req.tenantId ?? user?.tenantId;
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
