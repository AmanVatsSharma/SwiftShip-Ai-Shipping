/**
 * SS-032 — GST invoice service.
 *
 * Owns the calculation + persistence of GST-compliant invoice breakdowns.
 *
 * Public surface:
 *   - {@link generateGstInvoice}  — produce a GstInvoiceEntity for a
 *                                  given invoice id, computing the
 *                                  intra-state (CGST+SGST) vs
 *                                  inter-state (IGST) split.
 *   - {@link isInterState}        — given two state names or GSTINs,
 *                                  returns true iff they differ.
 *   - {@link isGstinPayingCustomer}— true iff the tenant has a verified
 *                                  KYC record with a non-empty GSTIN.
 *                                  This is the gate the billing service
 *                                  uses to refuse invoices > Rs 10k for
 *                                  non-GSTIN customers.
 *   - {@link thresholdCheck}      — returns the E-way bill threshold
 *                                  info for a given invoice value.
 *
 * Tax math is intentionally a pure function ({@link calculateGst}) so
 * it can be unit-tested without the TypeORM repository.
 */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceEntity } from '@swiftship/platform-typeorm';
import {
  KycRecordEntity,
  KycStatus,
} from '@swiftship/domains-onboarding';
import { TenantContext } from '@swiftship/domains-tenants';
import { GstInvoiceEntity } from './gst-invoice.entity';
import { GenerateGstInvoiceInput } from './gst-input';
import {
  assertValidGstSlab,
  DEFAULT_HSN_CODE,
  lookupHsnRate,
} from './gst-rate-table';

export const GSTIN_PAYING_THRESHOLD_INR = 10_000;
export const EWAY_BILL_THRESHOLD_INR = 50_000;

export interface GstCalculation {
  baseAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  totalAmount: number;
  gstType: 'CGST_SGST' | 'IGST';
  taxRate: number;
  hsnCode: string;
}

@Injectable()
export class GstInvoiceService {
  private readonly logger = new Logger(GstInvoiceService.name);

  constructor(
    @InjectRepository(GstInvoiceEntity)
    private readonly gstInvoices: Repository<GstInvoiceEntity>,
    @InjectRepository(InvoiceEntity)
    private readonly invoices: Repository<InvoiceEntity>,
    @InjectRepository(KycRecordEntity)
    private readonly kyc: Repository<KycRecordEntity>,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * Pure-function GST split. Exposed for unit testing — the resolver
   * and the billing service call this so we never hit the DB for math.
   */
  calculateGst(
    taxableValue: number,
    taxRate: number,
    isInterState: boolean,
  ): GstCalculation {
    if (taxableValue < 0) {
      throw new BadRequestException('taxableValue cannot be negative');
    }
    assertValidGstSlab(taxRate);

    const rate = taxRate / 100;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    let gstType: 'CGST_SGST' | 'IGST';

    if (isInterState) {
      igst = round2(taxableValue * rate);
      gstType = 'IGST';
    } else {
      const half = rate / 2;
      cgst = round2(taxableValue * half);
      sgst = round2(taxableValue * half);
      gstType = 'CGST_SGST';
    }

    const totalTax = round2(cgst + sgst + igst);
    const totalAmount = round2(taxableValue + totalTax);

    return {
      baseAmount: round2(taxableValue),
      cgst,
      sgst,
      igst,
      totalTax,
      totalAmount,
      gstType,
      taxRate,
      hsnCode: '',
    };
  }

  /**
   * Pure-function HSN lookup. Returns the HSN entry from
   * {@link lookupHsnRate} with a stable shape.
   */
  resolveHsnRate(hsnCode: string | null | undefined) {
    return lookupHsnRate(hsnCode);
  }

  /**
   * Pure-function inter-state check. Accepts either two state names
   * (case-insensitive) or two GSTINs (we only need the first two
   * digits — the state code). The classic GSTIN state-code rules are
   * built into the upstream KYC GstinValidator, so we just key on the
   * first two characters when a GSTIN is passed.
   */
  isInterState(supplier: string, recipient: string): boolean {
    const a = (supplier ?? '').toString().trim().toLowerCase();
    const b = (recipient ?? '').toString().trim().toLowerCase();
    if (a === '' || b === '') return false;
    // GSTIN path: first 2 chars.
    if (a.length >= 15 && b.length >= 15) {
      return a.substring(0, 2) !== b.substring(0, 2);
    }
    return a !== b;
  }

  /**
   * Returns true if the tenant has a verified KYC record with a
   * non-empty GSTIN. This is the gate {@link BillingService} consults
   * before issuing an invoice > Rs 10k — non-GSTIN customers (e.g.
   * unregistered small sellers) must not generate GST invoices.
   */
  async isGstinPayingCustomer(tenantId: number): Promise<boolean> {
    if (!tenantId) return false;
    const rec = await this.kyc.findOne({
      where: { tenantId, status: KycStatus.VERIFIED },
      order: { verifiedAt: 'DESC' },
    });
    if (!rec) return false;
    return !!(rec.gstin && rec.gstin.trim() !== '');
  }

  /**
   * Returns the E-way bill threshold result for a given invoice value.
   * Pure — exposed for GraphQL query and for the resolver.
   */
  thresholdCheck(invoiceValue: number, isInterState: boolean) {
    const required = invoiceValue >= EWAY_BILL_THRESHOLD_INR;
    let reason: string | null = null;
    if (!required) {
      reason = `Invoice value ${invoiceValue} is below the E-way bill threshold of ${EWAY_BILL_THRESHOLD_INR}.`;
    } else if (isInterState) {
      reason = `Inter-state shipment over ${EWAY_BILL_THRESHOLD_INR} requires an E-way bill.`;
    } else {
      reason = `Intra-state shipment over ${EWAY_BILL_THRESHOLD_INR} requires an E-way bill.`;
    }
    return {
      required,
      threshold: EWAY_BILL_THRESHOLD_INR,
      invoiceValue,
      isInterState,
      reason,
    };
  }

  /**
   * Generate (or update) the GST breakdown for an existing invoice.
   * Idempotent on `invoiceId` — re-running updates the row instead of
   * inserting a second one.
   */
  async generateGstInvoice(input: GenerateGstInvoiceInput): Promise<GstInvoiceEntity> {
    const tenantId = this.requireTenantId();

    const invoice = await this.invoices.findOne({
      where: { id: input.invoiceId, tenantId },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice ${input.invoiceId} not found`);
    }

    const hsn = this.resolveHsnRate(input.hsnCode);
    const taxRate = input.taxRate ?? hsn.taxRate;
    const isInterState = this.isInterState(
      input.supplierGstin ?? input.supplierState,
      input.recipientGstin ?? input.placeOfSupply,
    );

    const calc = this.calculateGst(input.taxableValue, taxRate, isInterState);
    const hsnCode = input.hsnCode && input.hsnCode.trim() !== '' ? input.hsnCode : DEFAULT_HSN_CODE;

    const existing = await this.gstInvoices.findOne({
      where: { invoiceId: input.invoiceId },
    });

    const row = existing ?? this.gstInvoices.create({ invoiceId: input.invoiceId, tenantId });
    row.hsnCode = hsnCode;
    row.supplyDescription = input.supplyDescription ?? hsn.description;
    row.taxableValue = calc.baseAmount;
    row.taxRate = taxRate;
    row.cgstAmount = calc.cgst;
    row.sgstAmount = calc.sgst;
    row.igstAmount = calc.igst;
    row.totalTax = calc.totalTax;
    row.totalAmount = calc.totalAmount;
    row.gstType = calc.gstType;
    row.supplierState = input.supplierState;
    row.placeOfSupply = input.placeOfSupply;
    row.supplierGstin = input.supplierGstin ?? null;
    row.recipientGstin = input.recipientGstin ?? null;
    row.isInterState = isInterState;
    row.metadata = {
      hsnLookup: hsn,
      generatedAt: new Date().toISOString(),
    };

    return this.gstInvoices.save(row);
  }

  /** Get a GST invoice by its primary id. */
  async getGstInvoice(id: number): Promise<GstInvoiceEntity> {
    const tenantId = this.requireTenantId();
    const row = await this.gstInvoices.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException(`GST invoice ${id} not found`);
    return row;
  }

  /** Get the GST breakdown for a given invoiceId. */
  async getGstInvoiceByInvoiceId(invoiceId: string): Promise<GstInvoiceEntity | null> {
    const tenantId = this.requireTenantId();
    return this.gstInvoices.findOne({ where: { invoiceId, tenantId } });
  }

  private requireTenantId(): number {
    const tid = this.tenantContext.getTenantId();
    if (tid === null || tid === undefined) {
      throw new BadRequestException('Tenant context required for GST operation');
    }
    return Number(tid);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
