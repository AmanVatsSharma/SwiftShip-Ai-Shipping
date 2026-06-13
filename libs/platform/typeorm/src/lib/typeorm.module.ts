import { Module, Global, DynamicModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions } from './datasource';
import * as entities from './entities';

/**
 * Global TypeORM module for the SwiftShip API.
 *
 * Usage:
 *   TypeOrmCoreModule — wired once in `AppModule.imports`. All feature
 *   modules can then `@InjectRepository(SomeEntity)` and TypeORM will be
 *   available application-wide.
 *
 * Reads `DATABASE_URL` from env. Set `DB_SYNCHRONIZE=false` in production.
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
