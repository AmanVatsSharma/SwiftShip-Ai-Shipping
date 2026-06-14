import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthLibModule } from '@swiftship/platform-auth';
import {
  OrderEntity,
  OrderRateQuoteEntity,
  UserEntity,
  CarrierEntity,
  WarehouseEntity,
  WarehouseCoverageEntity,
  ShipmentEntity,
  ReturnEntity,
} from '@swiftship/platform-typeorm';
import { RateRankingModule } from '@swiftship/domains-rate-shop';
import { KycModule } from '@swiftship/domains-onboarding';
import { OrdersService } from './orders.service';
import { OrdersResolver } from './orders.resolver';
import { OrderRateQuoteService } from './order-rate-quote.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderEntity,
      OrderRateQuoteEntity,
      UserEntity,
      CarrierEntity,
      WarehouseEntity,
      WarehouseCoverageEntity,
      ShipmentEntity,
      ReturnEntity,
    ]),
    AuthLibModule,
    // SS-015: rate-engine auto-pick — the orders service calls
    // `RateRankingService.rank(...)` to pick the carrier when
    // `CreateOrderInput.rankRate` is true (the default).
    RateRankingModule,
    // SS-031: KYC gate for COD orders. Optional import — if the KYC
    // module isn't wired (e.g. legacy tests) the orders service still
    // works, treating KYC as "verified" so PREPAID flows don't break.
    KycModule,
  ],
  providers: [OrdersService, OrderRateQuoteService, OrdersResolver],
  exports: [OrdersService, OrderRateQuoteService],
})
export class OrdersLibModule {}
