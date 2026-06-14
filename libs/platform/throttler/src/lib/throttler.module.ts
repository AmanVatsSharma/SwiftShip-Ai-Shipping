import { Module } from '@nestjs/common';
import {
  ThrottlerModule as NestThrottlerModule,
  ThrottlerModuleOptions,
} from '@nestjs/throttler';
import { TenantModule } from '@swiftship/domains-tenants';
import { PostgresThrottlerStorage } from './postgres-storage.service';
import { TenantThrottlerGuard } from './tenant-throttler.guard';

/**
 * Per-tenant throttler module.
 *
 * Wires:
 *   - `@nestjs/throttler` with a default 60/min bucket (the per-tier
 *     override happens inside `TenantThrottlerGuard.handleRequest`)
 *   - `PostgresThrottlerStorage` via DI factory (replaces the in-memory
 *     default store so limits hold across API instances)
 *   - `TenantThrottlerGuard` (replaces `ThrottlerGuard` in `AppModule` —
 *     the wiring itself is SS-003b and is out of scope here)
 *   - `TenantModule` (from SS-001) so the guard can resolve tier context
 *
 * The throttler table is created lazily by
 * `PostgresThrottlerStorage.onModuleInit` — no TypeORM entity, no
 * migration. That keeps the throttler an isolated, drop-in
 * infrastructure concern.
 */
@Module({
  imports: [
    TenantModule,
    NestThrottlerModule.forRootAsync({
      useFactory: (storage: PostgresThrottlerStorage): ThrottlerModuleOptions => ({
        throttlers: [
          {
            name: 'tenant',
            ttl: 60_000,
            limit: 60,
          },
        ],
        storage,
      }),
      inject: [PostgresThrottlerStorage],
    }),
  ],
  providers: [PostgresThrottlerStorage, TenantThrottlerGuard],
  exports: [
    PostgresThrottlerStorage,
    TenantThrottlerGuard,
    NestThrottlerModule,
  ],
})
export class ThrottlerModule {}
