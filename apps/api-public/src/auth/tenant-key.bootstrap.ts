/**
 * SS-027 — NestJS lifecycle hook to bridge the TenantService from the
 * DI container into the request-scoped `tenantKeyMiddleware` (which
 * runs as plain Express middleware, not a NestMiddleware, so it
 * can't inject directly).
 *
 * Imported by `AppModule`'s `onApplicationBootstrap` so it runs once
 * per process, after the DI graph is built.
 */
import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { TenantService } from '@swiftship/domains-tenants';
import { setTenantService } from './tenant-key.middleware';

@Injectable()
export class TenantKeyBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(TenantKeyBootstrap.name);
  constructor(private readonly tenants: TenantService) {}

  onApplicationBootstrap(): void {
    setTenantService(this.tenants);
    this.logger.log('TenantService bound to api-public tenantKeyMiddleware');
  }
}
