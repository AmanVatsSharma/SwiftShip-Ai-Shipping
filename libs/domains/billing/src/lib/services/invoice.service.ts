/**
 * SS-041 — Invoice Service (TypeORM-backed).
 *
 * Replaces the legacy `prisma.invoice.*` implementation. Same external
 * contract, same business rules; only the data-access layer changed.
 *
 * Invariants this service guarantees:
 *   - The invoice number is monotonically increasing per (warehouse, FY)
 *     and is generated inside a transaction (no two callers can mint
 *     the same number).
 *   - `totalAmount === amount + taxAmount` for the persisted row.
 *   - `cgstAmount + sgstAmount === taxAmount` for intra-state rows;
 *     `igstAmount === taxAmount` for inter-state rows.
 *   - For every invoice the sum of `invoiceItems.taxAmount` equals
 *     `invoice.taxAmount`, and the sum of `invoiceItems.totalPrice`
 *     equals `invoice.amount`. This is the line-item invariant that
 *     SS-041 pins in a unit test.
 */
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import {
  InvoiceEntity,
  InvoiceItemEntity,
  InvoiceSequenceEntity,
  InvoiceStatus,
  PaymentEntity,
  SubscriptionEntity,
  UserEntity,
  WarehouseEntity,
  WarehouseSellerProfileEntity,
  EwayBillEntity,
  getCurrentTenantId,
} from '@swiftship/platform-typeorm';
import { CreateInvoiceInput } from '../dto/create-invoice.input';
import { GstService } from './gst.service';
import { PdfService } from './pdf.service';
import { StorageService } from '@swiftship/domains-storage';
import { InvoiceEmailWorker } from './invoice-email.worker';

interface BuyerDetails {
  name: string;
  gstin?: string;
  state?: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  pincode?: string;
  country?: string;
}

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoices: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly invoiceItems: Repository<InvoiceItemEntity>,
    @InjectRepository(InvoiceSequenceEntity)
    private readonly sequences: Repository<InvoiceSequenceEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptions: Repository<SubscriptionEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(WarehouseEntity)
    private readonly warehouses: Repository<WarehouseEntity>,
    @InjectRepository(WarehouseSellerProfileEntity)
    private readonly sellerProfiles: Repository<WarehouseSellerProfileEntity>,
    @InjectRepository(PaymentEntity)
    private readonly payments: Repository<PaymentEntity>,
    @InjectRepository(EwayBillEntity)
    private readonly ewayBills: Repository<EwayBillEntity>,
    private readonly dataSource: DataSource,
    private readonly gstService: GstService,
    private readonly pdfService: PdfService,
    private readonly storage: StorageService,
    private readonly invoiceEmailWorker: InvoiceEmailWorker,
  ) {}

  /**
   * Generate sequential invoice number scoped to warehouse + financial year.
   * Format: {WAREHOUSE_CODE}-FY{YY}{YY}-{SEQUENCE}
   */
  private async generateSequentialInvoiceNumber(
    warehouseId: number,
    warehouseCode: string,
  ): Promise<{ invoiceNumber: string; sequenceNumber: number; financialYear: string }> {
    const now = new Date();
    const financialYear = this.getFinancialYear(now);
    const normalizedCode = warehouseCode.replace(/[^A-Z0-9]/gi, '').toUpperCase();

    const sequenceNumber = await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(InvoiceSequenceEntity);
      let existing = await repo.findOne({
        where: { warehouseId, financialYear },
      });

      if (existing) {
        existing.lastSequence += 1;
        await em.save(existing);
        return existing.lastSequence;
      }

      const created = em.create(InvoiceSequenceEntity, {
        warehouseId,
        financialYear,
        lastSequence: 1,
        prefix: normalizedCode,
      });
      await em.save(created);
      return created.lastSequence;
    });

    const paddedSequence = String(sequenceNumber).padStart(6, '0');
    const invoiceNumber = `${normalizedCode}-FY${financialYear.replace('-', '')}-${paddedSequence}`;

    return { invoiceNumber, sequenceNumber, financialYear };
  }

  private getFinancialYear(date: Date): string {
    const year = date.getFullYear();
    const month = date.getMonth();
    const fyStartYear = month >= 3 ? year : year - 1;
    const fyEndYear = fyStartYear + 1;
    return `${String(fyStartYear).slice(-2)}-${String(fyEndYear).slice(-2)}`;
  }

  /**
   * Create a new invoice
   */
  async createInvoice(input: CreateInvoiceInput): Promise<InvoiceEntity> {
    this.logger.log('createInvoice', {
      userId: input.userId,
      warehouseId: input.warehouseId,
      itemCount: input.items.length,
    });

    const user = await this.users.findOne({ where: { id: input.userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${input.userId} not found`);
    }

    const warehouse = await this.warehouses.findOne({ where: { id: input.warehouseId } });
    if (!warehouse) {
      throw new NotFoundException(`Warehouse with ID ${input.warehouseId} not found`);
    }

    if (input.subscriptionId) {
      const subscription = await this.subscriptions.findOne({
        where: { id: input.subscriptionId },
      });
      if (!subscription) {
        throw new NotFoundException(`Subscription with ID ${input.subscriptionId} not found`);
      }
    }

    const sellerProfile = await this.fetchSellerProfile(warehouse.id, input.sellerProfileId);
    const buyer = this.resolveBuyerDetails(input, user);
    const isInterState = this.determineInterState(
      sellerProfile.gstin,
      sellerProfile.state,
      buyer,
    );

    const lineItems = input.items.map((item) => {
      const totalPrice = item.unitPrice * item.quantity;
      const taxRate = item.taxRate || 0;
      const gstBreakup = this.gstService.calculateGst(totalPrice, taxRate, isInterState);

      return {
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice,
        hsnCode: item.hsnCode,
        taxRate,
        taxAmount: gstBreakup.totalTax,
        cgstAmount: gstBreakup.cgst,
        sgstAmount: gstBreakup.sgst,
        igstAmount: gstBreakup.igst,
        gstType: gstBreakup.gstType,
      };
    });

    const amount = lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const taxAmount = lineItems.reduce((sum, item) => sum + item.taxAmount, 0);
    const cgstAmount = lineItems.reduce((sum, item) => sum + item.cgstAmount, 0);
    const sgstAmount = lineItems.reduce((sum, item) => sum + item.sgstAmount, 0);
    const igstAmount = lineItems.reduce((sum, item) => sum + item.igstAmount, 0);
    const totalAmount = amount + taxAmount;

    const { invoiceNumber, sequenceNumber, financialYear } =
      await this.generateSequentialInvoiceNumber(warehouse.id, warehouse.code);

    const emailDeliveryStatus =
      input.autoEmailBuyer === false || !buyer.email ? 'SKIPPED' : 'PENDING';

    const invoice = await this.dataSource.transaction(async (em) => {
      const invoiceRepo = em.getRepository(InvoiceEntity);
      const itemRepo = em.getRepository(InvoiceItemEntity);

      const header = invoiceRepo.create({
        id: randomUUID(),
        invoiceNumber,
        sequenceNumber,
        financialYear,
        userId: input.userId,
        warehouseId: warehouse.id,
        sellerProfileId: sellerProfile.id,
        subscriptionId: input.subscriptionId,
        // Fall back to the warehouse's tenant (request-scoped ALS context
        // is the source of truth; the column default of 1 is wrong for
        // every tenant but the system tenant — see the e2e kyc-gst spec).
        tenantId: getCurrentTenantId() ?? warehouse.tenantId ?? 1,
        amount,
        taxAmount,
        cgstAmount,
        sgstAmount,
        igstAmount,
        gstType: isInterState ? 'IGST' : 'CGST+SGST',
        totalAmount,
        currency: (input.currency || 'INR').toUpperCase(),
        status: InvoiceStatus.DRAFT,
        dueDate: input.dueDate,
        buyerLegalName: buyer.name,
        buyerGstin: buyer.gstin,
        buyerState: buyer.state,
        buyerEmail: buyer.email,
        buyerPhone: buyer.phone,
        buyerAddressLine1: buyer.addressLine1,
        buyerAddressLine2: buyer.addressLine2,
        buyerCity: buyer.city,
        buyerPincode: buyer.pincode,
        buyerCountry: buyer.country,
        metadata: {
          ...(input.metadata || {}),
          gst: {
            isInterState,
            cgstAmount,
            sgstAmount,
            igstAmount,
          },
        },
        emailDeliveryStatus,
        emailDeliveryAttempts: 0,
      });
      const saved = await invoiceRepo.save(header);

      for (const li of lineItems) {
        const row = itemRepo.create({ ...li, invoiceId: saved.id });
        await itemRepo.save(row);
      }

      return saved;
    });

    this.logger.log(`Invoice created: ${invoiceNumber}`, {
      invoiceId: invoice.id,
      totalAmount,
      warehouseId: warehouse.id,
      sellerProfileId: sellerProfile.id,
    });

    // Fire-and-forget PDF generation; the email worker is enqueued
    // after the PDF is ready.
    this.generateInvoicePdf(invoice.id)
      .then(() => {
        if (emailDeliveryStatus === 'PENDING' && buyer.email) {
          this.invoiceEmailWorker.enqueue(invoice.id).catch((err: unknown) => {
            this.logger.error('Failed to enqueue invoice email', {
              invoiceId: invoice.id,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
      })
      .catch((error) => {
        this.logger.error(`Failed to generate PDF for invoice ${invoice.id}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return this.getInvoice(invoice.id);
  }

  private resolveBuyerDetails(input: CreateInvoiceInput, user: UserEntity): BuyerDetails {
    const fallbackName = input.buyer?.name || user?.name || user?.email || 'Valued Customer';
    const fallbackEmail = input.buyer?.email || user?.email;

    return {
      name: fallbackName,
      gstin: input.buyer?.gstin,
      state: input.buyer?.state,
      email: fallbackEmail,
      phone: input.buyer?.phone,
      addressLine1: input.buyer?.addressLine1,
      addressLine2: input.buyer?.addressLine2,
      city: input.buyer?.city,
      pincode: input.buyer?.pincode,
      country: input.buyer?.country || 'India',
    };
  }

  private determineInterState(
    sellerGstin: string | null | undefined,
    sellerState: string | null | undefined,
    buyer: BuyerDetails,
  ): boolean {
    if (sellerGstin && buyer.gstin) {
      return this.gstService.isInterState(sellerGstin, buyer.gstin);
    }
    if (sellerState && buyer.state) {
      return sellerState.trim().toLowerCase() !== buyer.state.trim().toLowerCase();
    }
    return false;
  }

  private async fetchSellerProfile(
    warehouseId: number,
    sellerProfileId?: number,
  ): Promise<WarehouseSellerProfileEntity> {
    if (sellerProfileId) {
      const profile = await this.sellerProfiles.findOne({
        where: { id: sellerProfileId, warehouseId, isActive: true },
      });
      if (!profile) {
        throw new NotFoundException(
          `Seller profile ${sellerProfileId} not found for warehouse ${warehouseId}`,
        );
      }
      return profile;
    }

    const defaultProfile = await this.sellerProfiles.findOne({
      where: { warehouseId, isActive: true, isDefault: true },
    });
    if (defaultProfile) return defaultProfile;

    const fallback = await this.sellerProfiles.findOne({
      where: { warehouseId, isActive: true },
      order: { createdAt: 'ASC' },
    });

    if (!fallback) {
      throw new NotFoundException(
        `No active seller profile configured for warehouse ${warehouseId}`,
      );
    }
    return fallback;
  }

  /**
   * Get invoice by ID
   */
  async getInvoice(id: string): Promise<InvoiceEntity> {
    const invoice = await this.invoices.findOne({
      where: { id },
      relations: [
        'invoiceItems',
        'user',
        'sellerProfile',
        'warehouse',
        'payments',
        'ewayBill',
        'subscription',
      ],
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }
    return invoice;
  }

  /**
   * Get invoice by invoice number
   */
  async getInvoiceByNumber(invoiceNumber: string): Promise<InvoiceEntity> {
    const invoice = await this.invoices.findOne({
      where: { invoiceNumber },
      relations: [
        'invoiceItems',
        'user',
        'sellerProfile',
        'warehouse',
        'payments',
        'ewayBill',
        'subscription',
      ],
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice with number ${invoiceNumber} not found`);
    }
    return invoice;
  }

  /**
   * Get invoices for a user
   */
  async getInvoicesByUser(userId: number): Promise<InvoiceEntity[]> {
    return this.invoices.find({
      where: { userId },
      relations: [
        'invoiceItems',
        'subscription',
        'sellerProfile',
        'warehouse',
        'payments',
        'ewayBill',
      ],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Generate PDF for invoice
   */
  async generateInvoicePdf(invoiceId: string): Promise<string> {
    this.logger.log('generateInvoicePdf', { invoiceId });

    const invoice = await this.getInvoice(invoiceId);

    // Generate PDF
    const pdfBuffer = await this.pdfService.generateInvoicePdf(invoice);

    // Upload PDF to storage
    const { url: pdfUrl, key: storageKey } = await this.uploadPdf(
      pdfBuffer,
      `invoices/${invoice.invoiceNumber}.pdf`,
    );

    // Update invoice with PDF URL
    await this.invoices.update(
      { id: invoiceId },
      {
        invoiceUrl: pdfUrl,
        pdfStorageKey: storageKey,
        pdfUploadedAt: new Date(),
        status: invoice.status === InvoiceStatus.DRAFT ? InvoiceStatus.PENDING : invoice.status,
      },
    );

    this.logger.log(`PDF generated for invoice ${invoice.invoiceNumber}`, { pdfUrl });

    return pdfUrl;
  }

  /**
   * Upload PDF to storage
   */
  private async uploadPdf(
    buffer: Buffer,
    filename: string,
  ): Promise<{ key: string; url: string }> {
    const normalizedKey = filename.startsWith('invoices/') ? filename : `invoices/${filename}`;
    const result = await this.storage.uploadBuffer(
      normalizedKey,
      buffer,
      'application/pdf',
      { cacheControl: 'public, max-age=31536000' },
    );
    return { key: normalizedKey, url: result.url };
  }

  /**
   * Mark invoice as paid
   */
  async markInvoiceAsPaid(invoiceId: string, paidAt?: Date): Promise<InvoiceEntity> {
    const invoice = await this.getInvoice(invoiceId);

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already paid');
    }

    await this.invoices.update(
      { id: invoiceId },
      {
        status: InvoiceStatus.PAID,
        paidAt: paidAt || new Date(),
      },
    );
    return this.getInvoice(invoiceId);
  }

  /**
   * Cancel invoice
   */
  async cancelInvoice(invoiceId: string): Promise<InvoiceEntity> {
    const invoice = await this.getInvoice(invoiceId);

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Cannot cancel a paid invoice');
    }

    await this.invoices.update(
      { id: invoiceId },
      { status: InvoiceStatus.CANCELLED },
    );
    return this.getInvoice(invoiceId);
  }
}
