import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthLibModule } from '@swiftship/platform-auth';
import { CarriersLibModule } from '@swiftship/platform-carriers';
import { QueuesModule } from '@swiftship/platform-queues';
import {
  ShipmentEntity,
  OrderEntity,
  UserEntity,
  TrackingEventEntity,
  ShippingLabelEntity,
  CarrierEntity,
  WarehouseEntity,
} from '@swiftship/platform-typeorm';
import { ShipmentsService } from './shipments.service';
import { ShipmentsResolver } from './shipments.resolver';
import { ShipmentsGateway } from './shipments.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ShipmentEntity,
      OrderEntity,
      UserEntity,
      TrackingEventEntity,
      ShippingLabelEntity,
      CarrierEntity,
      WarehouseEntity,
    ]),
    AuthLibModule,
    CarriersLibModule,
    QueuesModule,
  ],
  providers: [ShipmentsService, ShipmentsResolver, ShipmentsGateway],
  exports: [ShipmentsService, ShipmentsGateway],
})
export class ShipmentsLibModule {}
