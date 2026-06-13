import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthLibModule } from '@swiftship/platform-auth';
import {
  OrderEntity,
  UserEntity,
  CarrierEntity,
  WarehouseEntity,
  WarehouseCoverageEntity,
  ShipmentEntity,
  ReturnEntity,
} from '@swiftship/platform-typeorm';
import { OrdersService } from './orders.service';
import { OrdersResolver } from './orders.resolver';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderEntity,
      UserEntity,
      CarrierEntity,
      WarehouseEntity,
      WarehouseCoverageEntity,
      ShipmentEntity,
      ReturnEntity,
    ]),
    AuthLibModule,
  ],
  providers: [OrdersService, OrdersResolver],
  exports: [OrdersService],
})
export class OrdersLibModule {}
