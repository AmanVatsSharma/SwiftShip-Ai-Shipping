/**
 * SS-027 — `X-Swiftship-Api-Key` resolution for the public REST surface.
 *
 * Mirrors `apps/api/src/.../tenant.middleware.ts` from the GraphQL app,
 * but runs as plain Express middleware (not as a NestMiddleware) so
 * it can sit BEFORE the tsoa router in `main.ts`. The key shape is
 * `<prefix>.<hashed-key>`; we resolve it to a tenantId via the
 * `TenantService.findByApiKey` and stash it on `req.tenantId` (which
 * the throttler + repositories read).
 *
 * Behaviour:
 *   - If the header is present but the key is unknown, we respond 401
 *     immediately (instead of silently allowing the request through
 *     with `tenantId = undefined`).
 *   - If the header is missing, we let the request through — public
 *     endpoints (`/v1/track/:awb`) do not require auth. The TenantGuard
 *     inside the controller (or `@Security('api_key')` annotation) is
 *     what enforces auth on the protected routes.
 *   - If the header is a Bearer JWT, we still try to pull a tenantId
 *     from the payload (same fallback as the GraphQL app's
 *     TenantMiddleware) so test setups that use `Authorization: Bearer
 *     <jwt>` continue to work.
 */
import type { Request, Response, NextFunction } from 'express';
import { TenantService } from '@swiftship/domains-tenants';
import { Logger } from '@nestjs/common';

const API_KEY_HEADER = 'x-swiftship-api-key';
const AUTH_HEADER = 'authorization';
const log = new Logger('TenantKeyMiddleware');

// Lazy TenantService resolver. We can't `new TenantService(...)` here
// because it has TypeORM repo dependencies — the actual instance is
// held in module scope. We grab it via the global container below.
let cachedService: TenantService | undefined;
export function setTenantService(svc: TenantService) {
  cachedService = svc;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function decodeJwtPayload(token: string): { tenantId?: number } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload) as { tenantId?: number };
  } catch {
    return null;
  }
}

/**
 * Express middleware handler. Mounted on `/v1` from `main.ts`.
 */
export async function tenantKeyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const apiKey = headerValue(req.headers[API_KEY_HEADER]);
  if (apiKey) {
    const [prefix, hashedKey] = apiKey.split('.', 2);
    if (prefix && hashedKey) {
      if (!cachedService) {
        log.error('TenantService not registered with api-public middleware');
        res.status(500).json({
          error: 'ServerError',
          message: 'Tenant resolution is unavailable',
        });
        return;
      }
      const tenant = await cachedService.findByApiKey(prefix, hashedKey);
      if (!tenant) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid X-Swiftship-Api-Key',
        });
        return;
      }
      (req as any).tenantId = tenant.id;
      (req as any).tenantTier = tenant.tier;
    }
    return next();
  }

  const auth = headerValue(req.headers[AUTH_HEADER]);
  if (auth?.toLowerCase().startsWith('bearer ')) {
    const decoded = decodeJwtPayload(auth.slice(7).trim());
    if (decoded?.tenantId && typeof decoded.tenantId === 'number') {
      (req as any).tenantId = decoded.tenantId;
    }
  }

  next();
}
