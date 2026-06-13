import { Module, Global, DynamicModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions } from './datasource';
import * as entities from './entities';
import { PrismaCompat } from './prisma-compat.types';

/**
 * Global TypeORM module for the SwiftShip API.
 *
 * Usage:
 *   TypeormModule.forRoot() — wired once in `AppModule.imports`. All feature
 *   modules can then `@InjectRepository(SomeEntity)` and TypeORM will be
 *   available application-wide.
 *
 * Side-effect:
 *   Also exposes `PrismaCompat` as a global provider. The shim bridges the
 *   legacy `PrismaService.x.findUnique({ where })` API on top of TypeORM
 *   repositories so the in-flight Prisma → TypeORM migration can land in
 *   small, reviewable steps. See `prisma-compat.types.ts` for details.
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
      providers: [PrismaCompat],
      exports: [
        TypeOrmModule,
        PrismaCompat,
        ...(Object.values(entities) as any).map((Entity: any) =>
          TypeOrmModule.forFeature([Entity]),
        ),
      ],
    };
  }
}
