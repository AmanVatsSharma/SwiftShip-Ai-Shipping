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
import { GstModule } from './gst/gst.module';

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
    // SS-032: register GstModule so BillingService can inject
    // GstInvoiceService for the GSTIN-paying-customer gate.
    GstModule,
  ],
  providers: [BillingService, BillingResolver],
  exports: [BillingService],
})
export class BillingLibModule {}
