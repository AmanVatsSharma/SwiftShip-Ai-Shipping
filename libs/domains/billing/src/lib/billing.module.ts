import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule } from '@swiftship/domains-tenants';
import { AuthLibModule } from '@swiftship/platform-auth';
import { QueuesModule } from '@swiftship/platform-queues';
import {
  InvoiceEntity,
  InvoiceItemEntity,
  InvoiceSequenceEntity,
  SubscriptionEntity,
  PaymentEntity,
  UserEntity,
  WarehouseEntity,
  WarehouseSellerProfileEntity,
  EwayBillEntity,
  ShipmentEntity,
  OrderEntity,
  CarrierEntity,
} from '@swiftship/platform-typeorm';
// Direct file import (not the `@swiftship/domains-storage` barrel) so the
// legacy `src/storage` re-exports stay out of the compile graph —
// see STATUS.md §3 (src-to-libs decommission).
import { StorageModule } from '@swiftship/domains-storage';
import { BillingService } from './typeorm-billing.service';
import { BillingResolver } from './billing.resolver';
import { GstModule } from './gst/gst.module';
import { InvoiceService } from './services/invoice.service';
import { EwayBillService } from './services/eway-bill.service';
import { GstService } from './services/gst.service';
import { PdfService } from './services/pdf.service';
import { InvoiceEmailWorker } from './services/invoice-email.worker';

@Module({
  imports: [
    TenantModule,
    TypeOrmModule.forFeature([
      InvoiceEntity,
      InvoiceItemEntity,
      InvoiceSequenceEntity,
      SubscriptionEntity,
      PaymentEntity,
      UserEntity,
      WarehouseEntity,
      WarehouseSellerProfileEntity,
      EwayBillEntity,
      ShipmentEntity,
      OrderEntity,
      CarrierEntity,
    ]),
    AuthLibModule,
    QueuesModule,
    StorageModule,
    // SS-032: register GstModule so BillingService can inject
    // GstInvoiceService for the GSTIN-paying-customer gate.
    GstModule,
  ],
  providers: [
    BillingService,
    BillingResolver,
    // SS-041 TypeORM-backed invoice / e-way services (the resolver surface)
    InvoiceService,
    EwayBillService,
    GstService,
    PdfService,
    InvoiceEmailWorker,
  ],
  exports: [BillingService, InvoiceService, EwayBillService],
})
export class BillingLibModule {}
