import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthLibModule } from '@swiftship/platform-auth';
import {
  InvoiceEntity,
  InvoiceItemEntity,
  InvoiceSequenceEntity,
  SubscriptionEntity,
  PaymentEntity,
  UserEntity,
  WarehouseEntity,
} from '@swiftship/platform-typeorm';
import { BillingService } from './typeorm-billing.service';
import { BillingResolver } from './billing.resolver';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InvoiceEntity,
      InvoiceItemEntity,
      InvoiceSequenceEntity,
      SubscriptionEntity,
      PaymentEntity,
      UserEntity,
      WarehouseEntity,
    ]),
    AuthLibModule,
  ],
  providers: [BillingService, BillingResolver],
  exports: [BillingService],
})
export class BillingLibModule {}
