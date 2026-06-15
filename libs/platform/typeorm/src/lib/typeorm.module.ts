import { Module, Global, DynamicModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions } from './datasource';
import * as entities from './entities';

/**
 * Global TypeORM module for the SwiftShip API.
 *
 * Usage:
 *   TypeormModule.forRoot() — wired once in `AppModule.imports`. All feature
 *   modules can then `@InjectRepository(SomeEntity)` and TypeORM will be
 *   available application-wide.
 */
@Global()
@Module({})
export class TypeormModule {
  static forRoot(): DynamicModule {
    return {
      module: TypeormModule,
      imports: [
        TypeOrmModule.forRoot({
          ...buildDataSourceOptions(),
          autoLoadEntities: true,
        }),
        // Pre-register entity repositories so feature modules can
        // `imports: [TypeOrmModule.forFeature([...])]` without re-declaring.
        ...(Object.values(entities) as any).map((Entity: any) =>
          TypeOrmModule.forFeature([Entity]),
        ),
      ],
      exports: [
        TypeOrmModule,
        ...(Object.values(entities) as any).map((Entity: any) =>
          TypeOrmModule.forFeature([Entity]),
        ),
      ],
    };
  }
}

/**
 * Re-export the tenant-context helpers that the API wires into the request
 * pipeline. See `tenant-context.helpers.ts` for usage. `SYSTEM_TENANT_ID`
 * is a sentinel for system-level jobs (migrations, workers, health checks).
 */
export {
  bindTenantContext,
  configureTenantContext,
  getCurrentTenantId,
  SYSTEM_TENANT_ID,
} from './tenant-context.helpers';
