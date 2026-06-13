import { Resolver, Query, Mutation, Args, Int, Float } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { InvoiceService } from './services/invoice.service';
import { EwayBillService } from './services/eway-bill.service';
import { GstService } from './services/gst.service';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Invoice, EwayBill, GstCalculation } from './billing.model';
import { CreateInvoiceInput } from './dto/create-invoice.input';
import { GenerateEwayBillInput } from './dto/generate-eway-bill.input';

/**
 * Billing Resolver
 * 
 * GraphQL resolver for billing operations including:
 * - Invoice management
 * - E-way bill generation
 * - GST calculations
 */
@Resolver()
export class BillingResolver {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly ewayBillService: EwayBillService,
    private readonly gstService: GstService,
  ) {}

  // Invoice Mutations
  @Mutation(() => Invoice, { description: 'Create a new invoice' })
  @UseGuards(GqlAuthGuard)
  async createInvoice(
    @Args('input') input: CreateInvoiceInput,
    @CurrentUser() user: any,
  ) {
    // Override userId with current user
    input.userId = user.id;
    return this.invoiceService.createInvoice(input);
  }

  @Mutation(() => String, { description: 'Generate PDF for an invoice' })
  @UseGuards(GqlAuthGuard)
  async generateInvoicePdf(@Args('invoiceId') invoiceId: string) {
    return this.invoiceService.generateInvoicePdf(invoiceId);
  }

  @Mutation(() => Invoice, { description: 'Mark invoice as paid' })
  @UseGuards(GqlAuthGuard)
  async markInvoiceAsPaid(
    @Args('invoiceId') invoiceId: string,
    @Args('paidAt', { nullable: true }) paidAt?: Date,
  ) {
    return this.invoiceService.markInvoiceAsPaid(invoiceId, paidAt);
  }

  @Mutation(() => Invoice, { description: 'Cancel an invoice' })
  @UseGuards(GqlAuthGuard)
  async cancelInvoice(@Args('invoiceId') invoiceId: string) {
    return this.invoiceService.cancelInvoice(invoiceId);
  }

  // Invoice Queries
  @Query(() => Invoice, { description: 'Get invoice by ID' })
  @UseGuards(GqlAuthGuard)
  async invoice(@Args('id') id: string) {
    return this.invoiceService.getInvoice(id);
  }

  @Query(() => Invoice, { description: 'Get invoice by invoice number' })
  @UseGuards(GqlAuthGuard)
  async invoiceByNumber(@Args('invoiceNumber') invoiceNumber: string) {
    return this.invoiceService.getInvoiceByNumber(invoiceNumber);
  }

  @Query(() => [Invoice], { description: 'Get all invoices for current user' })
  @UseGuards(GqlAuthGuard)
  async myInvoices(@CurrentUser() user: any) {
    return this.invoiceService.getInvoicesByUser(user.id);
  }

  // E-way Bill Mutations
  @Mutation(() => EwayBill, { description: 'Generate E-way bill for a shipment' })
  @UseGuards(GqlAuthGuard)
  async generateEwayBill(@Args('input') input: GenerateEwayBillInput) {
    return this.ewayBillService.generateEwayBill(input);
  }

  @Mutation(() => EwayBill, { description: 'Cancel an E-way bill' })
  @UseGuards(GqlAuthGuard)
  async cancelEwayBill(
    @Args('id', { type: () => Int }) id: number,
    @Args('reason', { nullable: true }) reason?: string,
  ) {
    return this.ewayBillService.cancelEwayBill(id, reason);
  }

  // E-way Bill Queries
  @Query(() => EwayBill, { description: 'Get E-way bill by ID' })
  @UseGuards(GqlAuthGuard)
  async ewayBill(@Args('id', { type: () => Int }) id: number) {
    return this.ewayBillService.getEwayBill(id);
  }

  @Query(() => EwayBill, { description: 'Get E-way bill by shipment ID' })
  @UseGuards(GqlAuthGuard)
  async ewayBillByShipment(@Args('shipmentId', { type: () => Int }) shipmentId: number) {
    return this.ewayBillService.getEwayBillByShipment(shipmentId);
  }

  @Query(() => Boolean, { description: 'Validate E-way bill' })
  @UseGuards(GqlAuthGuard)
  async validateEwayBill(@Args('ewayBillNumber') ewayBillNumber: string) {
    return this.ewayBillService.validateEwayBill(ewayBillNumber);
  }

  // GST Queries
  @Query(() => GstCalculation, { description: 'Calculate GST for an amount' })
  @UseGuards(GqlAuthGuard)
  async calculateGst(
    @Args('baseAmount', { type: () => Float }) baseAmount: number,
    @Args('taxRate', { type: () => Float }) taxRate: number,
    @Args('isInterState', { defaultValue: false }) isInterState: boolean,
  ) {
    return this.gstService.calculateGst(baseAmount, taxRate, isInterState);
  }

  @Query(() => Boolean, { description: 'Check if E-way bill is required' })
  @UseGuards(GqlAuthGuard)
  async isEwayBillRequired(
    @Args('invoiceValue', { type: () => Float }) invoiceValue: number,
    @Args('isInterState', { defaultValue: false }) isInterState: boolean,
  ) {
    return this.ewayBillService.isEwayBillRequired(invoiceValue, isInterState);
  }
}
