import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import type { TenantService } from './tenant.service';

export interface TenantRequest extends Request {
  tenantId?: number;
}

const API_KEY_HEADER = 'x-swiftship-api-key';
const AUTH_HEADER = 'authorization';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenants: TenantService) {}

  async use(req: TenantRequest, _res: Response, next: NextFunction): Promise<void> {
    const apiKey = this.headerValue(req.headers[API_KEY_HEADER]);
    if (apiKey) {
      const [prefix, hashedKey] = apiKey.split('.', 2);
      if (prefix && hashedKey) {
        const tenant = await this.tenants.findByApiKey(prefix, hashedKey);
        if (tenant) {
          req.tenantId = tenant.id;
        }
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
      }
    }

    next();
  }

  private headerValue(value: string | string[] | undefined): string | undefined {
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
