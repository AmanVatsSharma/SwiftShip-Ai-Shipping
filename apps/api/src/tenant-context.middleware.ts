import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { bindTenantContext } from '@swiftship/platform-typeorm';

/**
 * SS-002c — bind `req.tenantId` (set by TenantMiddleware) into the
 * PrismaCompat shim's AsyncLocalStorage slot for the lifetime of the
 * request. Without this, every compat call would either throw
 * "No tenant context" or fall back to the system tenant.
 *
 * The middleware runs *after* TenantMiddleware in the chain. It is
 * registered in `TenantModule#configure` immediately after the existing
 * `TenantMiddleware` so the order is: TenantMiddleware → TenantContextMiddleware
 * → route handler.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const tenantId = (req as any).tenantId as number | string | undefined;
    const normalized =
      tenantId === undefined || tenantId === null
        ? undefined
        : Number(tenantId);
    bindTenantContext(
      Number.isFinite(normalized as number) ? (normalized as number) : undefined,
      () => next(),
    );
  }
}
