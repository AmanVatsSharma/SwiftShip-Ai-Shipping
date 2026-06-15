/**
 * SS-032 — GST GraphQL resolver.
 *
 * The resolver is intentionally thin: it parses the input, calls the
 * service, and returns. All tenant scoping, GSTIN validation, and
 * threshold logic live in the services. Tenant identity comes from
 * the request context (via TenantContext) — there is no tenantId
 * argument on any mutation.
 */
import { Args, Float, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { TenantContext } from '@swiftship/domains-tenants';
import { GstInvoiceService } from './gst-invoice.service';
import { GstEwayBillService } from './gst-eway-bill.service';
import { GenerateEwayBillInput, GenerateGstInvoiceInput } from './gst-input';
import { EwayBillThresholdCheck, GstEwayBill, GstInvoice } from './gst-model';

@Resolver()
export class GstResolver {
  constructor(
    private readonly gstInvoiceService: GstInvoiceService,
    private readonly ewayBillService: GstEwayBillService,
    private readonly tenantContext: TenantContext,
  ) {}

  // ---- mutations

  @Mutation(() => GstInvoice, { description: 'Generate (or refresh) the GST breakdown for an invoice.' })
  async generateGstInvoice(@Args('input') input: GenerateGstInvoiceInput): Promise<GstInvoice> {
    return this.gstInvoiceService.generateGstInvoice(input) as any;
  }

  @Mutation(() => GstEwayBill, { description: 'Issue an E-way bill via the configured provider (default: ClearTax sandbox).' })
  async generateEwayBill(@Args('input') input: GenerateEwayBillInput): Promise<GstEwayBill> {
    return this.ewayBillService.generateEwayBill(input) as any;
  }

  @Mutation(() => GstEwayBill, { description: 'Cancel an active E-way bill.' })
  async cancelEwayBill(
    @Args('id', { type: () => Int }) id: number,
    @Args('reason', { nullable: true }) reason?: string,
  ): Promise<GstEwayBill> {
    return this.ewayBillService.cancelEwayBill(id, reason) as any;
  }

  // ---- queries

  @Query(() => GstInvoice, { nullable: true, description: 'Get the GST breakdown for a specific invoice.' })
  async gstInvoiceByInvoiceId(@Args('invoiceId') invoiceId: string): Promise<GstInvoice | null> {
    return (await this.gstInvoiceService.getGstInvoiceByInvoiceId(invoiceId)) as any;
  }

  @Query(() => GstEwayBill, { nullable: true, description: 'Get an E-way bill by its shipment id.' })
  async ewayBillByShipment(@Args('shipmentId', { type: () => Int }) shipmentId: number): Promise<GstEwayBill | null> {
    return (await this.ewayBillService.getEwayBillByShipment(shipmentId)) as any;
  }

  @Query(() => EwayBillThresholdCheck, {
    description: 'Check whether an invoice value triggers the E-way bill requirement.',
  })
  async ewayBillThreshold(
    @Args('invoiceValue', { type: () => Float }) invoiceValue: number,
    @Args('isInterState', { defaultValue: false }) isInterState: boolean,
  ): Promise<EwayBillThresholdCheck> {
    return this.gstInvoiceService.thresholdCheck(invoiceValue, isInterState) as any;
  }

  @Query(() => Boolean, { description: 'Is the current tenant a GSTIN-paying customer (KYC verified, GSTIN present)?' })
  async isGstinPayingCustomer(): Promise<boolean> {
    const tid = this.tenantContext.getTenantId();
    if (tid === null || tid === undefined) return false;
    return this.gstInvoiceService.isGstinPayingCustomer(Number(tid));
  }
}
