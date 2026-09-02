import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoleEntity } from '@swiftship/platform-typeorm';
import { RolesService } from './roles.service';
import { RolesResolver } from './roles.resolver';

/**
 * Roles module (TypeORM-backed).
 *
 * Migrated off the PrismaCompat-style `PrismaService` — `RolesService` now
 * injects `@InjectRepository(RoleEntity)` directly (the last users-lib
 * consumer of the removed shim; see MIGRATION.md §9).
 */
@Module({
  imports: [TypeOrmModule.forFeature([RoleEntity])],
  providers: [RolesService, RolesResolver],
  exports: [RolesService],
})
export class RolesModule {}
