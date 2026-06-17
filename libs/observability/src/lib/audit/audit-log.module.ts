import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogEntity } from './audit-log.entity';
import { AuditLogService } from './audit-log.service';
import { AuditLogResolver } from './audit-log.resolver';
import { AuditInterceptor } from './audit.interceptor';

/**
 * SS-028 — AuditLogModule.
 *
 * Owns the `audit_logs` table (via `TypeOrmModule.forFeature`), the
 * service, the GraphQL resolver, and the global GraphQL interceptor
 * that reads `@Auditable(...)` metadata and writes one row per call.
 *
 * The module is `@Global()` so the `AuditLogService` is injectable
 * everywhere (the GraphQL resolver is registered with NestJS so it
 * shows up in the auto-generated schema). The interceptor is exposed
 * via `AuditInterceptor` and bound by `APP_INTERCEPTOR` in `app.module.ts`.
 *
 * `AuditLogEntity` is added to `libs/platform/typeorm/src/lib/entities/index.ts`
 * so `TypeormModule.forRoot()` picks it up via the entities barrel. The
 * migration `1718160000014-AddAuditLogTable.ts` is registered in
 * `libs/platform/typeorm/src/lib/datasource.ts`.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntity])],
  providers: [AuditLogService, AuditLogResolver, AuditInterceptor],
  exports: [AuditLogService, AuditInterceptor],
})
export class AuditLogModule {}
