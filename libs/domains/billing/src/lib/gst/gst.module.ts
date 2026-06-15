/**
 * SS-032 — GST module.
 *
 * Wires the GST invoice + E-way bill services, the ClearTax sandbox
 * adapter (default), and the GraphQL resolver. Stays inside the
 * `domains/billing` lib so it can import the parent `BillingLibModule`
 * and shared platform helpers without crossing the Nx boundary.
 *
 * To swap the E-way bill provider, rebind
 * `GST_EWAY_PROVIDER_ADAPTER` to a different class implementing
 * `GstEwayProviderAdapter` (e.g. an IRIS or Cygnet adapter) at the
 * top-level AppModule.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthLibModule } from '@swiftship/platform-auth';
import {
  InvoiceEntity,
  ShipmentEntity,
} from '@swiftship/platform-typeorm';
import { KycRecordEntity } from '@swiftship/domains-onboarding';
import { TenantModule } from '@swiftship/domains-tenants';
import { GstInvoiceEntity } from './gst-invoice.entity';
import { GstEwayBillEntity } from './gst-eway-bill.entity';
import { GstInvoiceService } from './gst-invoice.service';
import { GstEwayBillService } from './gst-eway-bill.service';
import { GstResolver } from './gst.resolver';
import {
  ClearTaxSandboxAdapter,
} from './adapters/cleartax-sandbox.adapter';
import {
  GST_EWAY_PROVIDER_ADAPTER,
  GstEwayProviderAdapter,
} from './adapters/gst-eway-provider.interface';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GstInvoiceEntity,
      GstEwayBillEntity,
      InvoiceEntity,
      ShipmentEntity,
      KycRecordEntity,
    ]),
    AuthLibModule,
    TenantModule,
  ],
  providers: [
    GstInvoiceService,
    GstEwayBillService,
    GstResolver,
    // Default E-way bill provider. Swap in production by overriding
    // the `GST_EWAY_PROVIDER_ADAPTER` token in the AppModule.
    ClearTaxSandboxAdapter,
    {
      provide: GST_EWAY_PROVIDER_ADAPTER,
      useFactory: (): GstEwayProviderAdapter => new ClearTaxSandboxAdapter(),
    },
  ],
  exports: [GstInvoiceService, GstEwayBillService],
})
export class GstModule {}
