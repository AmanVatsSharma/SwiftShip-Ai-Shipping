import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { bindTenantContext } from '@swiftship/platform-typeorm';

/**
 * SS-002c / SS-044 — bind `req.tenantId` (set by TenantMiddleware) into
 * the platform-typeorm tenant-context helper's AsyncLocalStorage slot for
 * the lifetime of the request. The PrismaCompat shim that previously
 * owned this was removed in SS-044; the helpers are now in
 * `tenant-context.helpers.ts`.
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
