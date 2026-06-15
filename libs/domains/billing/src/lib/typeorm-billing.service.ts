/**
 * Billing service (TypeORM-backed for the high-frequency path).
 *
 * This is the *new* TypeORM implementation. The four legacy services under
 * `src/billing/services/` (invoice, eway-bill, gst, pdf) keep working via
 * the PrismaCompat shim until Plan 5 sweeps them. New code should target
 * this service.
 */
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  InvoiceEntity,
  InvoiceItemEntity,
  InvoiceSequenceEntity,
  SubscriptionEntity,
  PaymentEntity,
  UserEntity,
  WarehouseEntity,
  InvoiceStatus,
  BillingCycle,
} from '@swiftship/platform-typeorm';
import { TenantContext } from '@swiftship/domains-tenants';
import {
  GSTIN_PAYING_THRESHOLD_INR,
  GstInvoiceService,
} from './gst/gst-invoice.service';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoices: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly invoiceItems: Repository<InvoiceItemEntity>,
    @InjectRepository(InvoiceSequenceEntity)
    private readonly sequences: Repository<InvoiceSequenceEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptions: Repository<SubscriptionEntity>,
    @InjectRepository(PaymentEntity)
    private readonly payments: Repository<PaymentEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(WarehouseEntity)
    private readonly warehouses: Repository<WarehouseEntity>,
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContext,
    // SS-032: needed to enforce the GSTIN-paying-customer gate for
    // invoices > Rs 10k. The service can be undefined in legacy
    // contexts (legacy PrismaCompat sites) — we guard the call.
    private readonly gstInvoiceService: GstInvoiceService,
  ) {}

  /**
   * SS-002c: helper to extract the current tenantId and refuse the call
   * if no tenant is bound. Centralised so the rest of the service is
   * easier to audit.
   */
  private requireTenantId(): number {
    const tid = this.tenantContext.getTenantId();
    if (tid === null || tid === undefined) {
      throw new BadRequestException('Tenant context required for billing operation');
    }
    return Number(tid);
  }

  // ---- list / find
  async listInvoices(filter?: { userId?: number; status?: InvoiceStatus; warehouseId?: number }) {
    const tenantId = this.requireTenantId();
    const where: any = { tenantId };
    if (filter?.userId) where.userId = filter.userId;
    if (filter?.status) where.status = filter.status;
    if (filter?.warehouseId) where.warehouseId = filter.warehouseId;
    return this.invoices.find({
      where,
      order: { createdAt: 'DESC' },
      relations: ['invoiceItems', 'payments'],
    });
  }

  async getInvoice(id: number) {
    const tenantId = this.requireTenantId();
    const inv = await this.invoices.findOne({
      where: { id, tenantId },
      relations: ['invoiceItems', 'payments', 'subscription', 'warehouse'],
    });
    if (!inv) throw new NotFoundException(`Invoice ${id} not found`);
    return inv;
  }

  // ---- create
  async createInvoice(input: {
    userId: number;
    warehouseId: number;
    items: { description: string; quantity: number; unitPrice: number; taxRate?: number; hsnSac?: string }[];
    subscriptionId?: number;
    billingCycle?: BillingCycle;
  }) {
    const tenantId = this.requireTenantId();
    const user = await this.users.findOne({ where: { id: input.userId } });
    if (!user) throw new BadRequestException(`User ${input.userId} not found`);

    const wh = await this.warehouses.findOne({ where: { id: input.warehouseId, tenantId } });
    if (!wh) throw new BadRequestException(`Warehouse ${input.warehouseId} not found`);

    // Calculate totals
    let subtotal = 0;
    let totalTax = 0;
    const itemRows = input.items.map((i) => {
      const lineTotal = i.quantity * i.unitPrice;
      const taxAmount = (lineTotal * (i.taxRate ?? 18)) / 100;
      subtotal += lineTotal;
      totalTax += taxAmount;
      return {
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        taxRate: i.taxRate ?? 18,
        hsnSac: i.hsnSac,
        lineTotal,
        taxAmount,
      };
    });
    const total = subtotal + totalTax;

    // SS-032: GSTIN-paying-customer gate. For invoices over the GST
    // threshold we require a verified KYC record with a GSTIN — without
    // one we cannot produce a compliant tax invoice. The check is
    // best-effort: if the GstInvoiceService isn't wired (legacy call
    // sites) we let the invoice through and log a warning.
    if (total > GSTIN_PAYING_THRESHOLD_INR) {
      const isGstin = await this.gstInvoiceService?.isGstinPayingCustomer(tenantId);
      if (isGstin === false) {
        throw new BadRequestException(
          `Invoices over Rs ${GSTIN_PAYING_THRESHOLD_INR} require a verified KYC record with a GSTIN. ` +
            'Submit KYC before creating a high-value invoice.',
        );
      }
    }

    // Generate invoice number (per warehouse + financial year)
    const { invoiceNumber, sequenceNumber, financialYear } =
      await this.generateInvoiceNumber(input.warehouseId, wh.code);

    // Create in a transaction
    return this.dataSource.transaction(async (em) => {
      const inv = em.create(InvoiceEntity, {
        invoiceNumber,
        userId: input.userId,
        warehouseId: input.warehouseId,
        subscriptionId: input.subscriptionId,
        tenantId,
        status: InvoiceStatus.DRAFT,
        subtotal,
        totalTax,
        total,
        currency: 'INR',
        billingCycle: input.billingCycle ?? BillingCycle.MONTHLY,
        financialYear,
        sequenceNumber,
      });
      const saved = await em.save(inv);
      for (const it of itemRows) {
        const item = em.create(InvoiceItemEntity, { ...it, invoiceId: saved.id });
        await em.save(item);
      }
      return this.getInvoice(saved.id);
    });
  }

  // ---- mark paid
  async markInvoicePaid(invoiceId: number, paymentId: number) {
    const tenantId = this.requireTenantId();
    await this.invoices.update({ id: invoiceId, tenantId } as any, {
      status: InvoiceStatus.PAID,
      paidAt: new Date(),
    });
    return this.getInvoice(invoiceId);
  }

  async voidInvoice(invoiceId: number) {
    const tenantId = this.requireTenantId();
    await this.invoices.update(
      { id: invoiceId, tenantId } as any,
      { status: InvoiceStatus.VOID },
    );
    return this.getInvoice(invoiceId);
  }

  // ---- helpers
  private async generateInvoiceNumber(
    warehouseId: number,
    warehouseCode: string,
  ): Promise<{ invoiceNumber: string; sequenceNumber: number; financialYear: string }> {
    const now = new Date();
    const fy = this.financialYear(now);
    const code = warehouseCode.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    return this.dataSource.transaction(async (em) => {
      let seq = await em.findOne(InvoiceSequenceEntity, { where: { warehouseId, financialYear: fy } });
      if (seq) {
        seq.lastSequence += 1;
        await em.save(seq);
      } else {
        seq = em.create(InvoiceSequenceEntity, {
          warehouseId,
          financialYear: fy,
          lastSequence: 1,
          prefix: code,
        });
        await em.save(seq);
      }
      return {
        invoiceNumber: `${code}-${fy}-${String(seq.lastSequence).padStart(5, '0')}`,
        sequenceNumber: seq.lastSequence,
        financialYear: fy,
      };
    });
  }

  private financialYear(d: Date): string {
    const y = d.getFullYear();
    const m = d.getMonth();
    const start = m >= 3 ? y : y - 1;
    const end = (start + 1) % 100;
    return `FY${String(start).slice(-2)}${String(end).padStart(2, '0')}`;
  }
}
