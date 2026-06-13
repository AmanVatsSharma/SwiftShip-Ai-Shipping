import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthLibModule } from '@swiftship/platform-auth';
import {
  WarehouseEntity,
  WarehouseCoverageEntity,
  WarehouseSellerProfileEntity,
} from '@swiftship/platform-typeorm';
import { WarehousesService } from './warehouses.service';
import { WarehousesResolver } from './warehouses.resolver';

/**
 * Warehouses lib module — exported so `apps/api` can wire it in
 * `imports: [WarehousesLibModule]`.
 *
 * Imports:
 *  - TypeOrmModule.forFeature: registers repositories for the warehouse
 *    domain's entities.
 *  - AuthLibModule: re-exports the JWT guard + Roles decorator the resolver
 *    uses.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      WarehouseEntity,
      WarehouseCoverageEntity,
      WarehouseSellerProfileEntity,
    ]),
    AuthLibModule,
  ],
  providers: [WarehousesService, WarehousesResolver],
  exports: [WarehousesService],
})
export class WarehousesLibModule {}
