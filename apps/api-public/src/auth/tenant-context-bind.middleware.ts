/**
 * SS-027 — bind `req.tenantId` (resolved by `tenantKeyMiddleware`) into
 * the platform-typeorm tenant-context helper's AsyncLocalStorage slot
 * for the lifetime of the request. Mirrors the
 * `TenantContextMiddleware` used in `apps/api/src/.../tenant-context.middleware.ts`.
 *
 * Runs AFTER `tenantKeyMiddleware` and BEFORE the tsoa router in
 * `main.ts`, so every `@InjectRepository(...)` read inside a handler
 * sees the correct tenantId via the ALS slot without the handler
 * having to know anything about tenant scoping.
 */
import type { Request, Response, NextFunction } from 'express';
import { bindTenantContext } from '@swiftship/platform-typeorm';

export function tenantContextBindMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const raw = (req as any).tenantId as number | string | undefined;
  const normalized = raw === undefined || raw === null ? undefined : Number(raw);
  bindTenantContext(
    Number.isFinite(normalized as number) ? (normalized as number) : undefined,
    () => next(),
  );
}
