import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
// Value import (not `import type`) — required for DI param reflection.
import { TenantService } from './tenant.service';
import { ApiKeyService } from './api-key.service';
import { TenantContext } from './tenant.context';

export interface TenantRequest extends Request {
  tenantId?: number;
}

const API_KEY_HEADER = 'x-swiftship-api-key';
const AUTH_HEADER = 'authorization';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly tenants: TenantService,
    private readonly apiKeys: ApiKeyService,
    private readonly tenantContext: TenantContext,
  ) {}

  async use(
    req: TenantRequest,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const apiKey = this.headerValue(req.headers[API_KEY_HEADER]);
    if (apiKey) {
      // Full verify (prefix lookup + bcrypt compare) via ApiKeyService —
      // TenantService.findByApiKey was a SS-005 stub that always returned
      // null, silently breaking every API-key-authenticated request
      // (found by the e2e money-path suites).
      const tenantId = await this.apiKeys.verify(apiKey);
      if (tenantId != null) {
        const tenant = await this.tenants.findById(tenantId);
        req.tenantId = tenantId;
        this.tenantContext.setTenant(tenantId, tenant.tier);
      }
      return next();
    }

    const auth = this.headerValue(req.headers[AUTH_HEADER]);
    if (auth?.toLowerCase().startsWith('bearer ')) {
      // Token decode is delegated to JwtStrategy (libs/platform/auth).
      // The middleware only sets tenantId if the JWT payload already carries it.
      const decoded = this.decodeJwtPayload(auth.slice(7).trim());
      if (decoded?.tenantId && typeof decoded.tenantId === 'number') {
        req.tenantId = decoded.tenantId;
        this.tenantContext.setTenant(decoded.tenantId);
      }
    }

    next();
  }

  private headerValue(
    value: string | string[] | undefined,
  ): string | undefined {
    if (Array.isArray(value)) return value[0];
    return value;
  }

  private decodeJwtPayload(token: string): { tenantId?: number } | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
      const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
      return JSON.parse(payload) as { tenantId?: number };
    } catch {
      return null;
    }
  }
}
