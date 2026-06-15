/**
 * SS-032 — GST E-way bill service.
 *
 * Owns the issuance and lookup of E-way bills. The actual provider
 * call is hidden behind {@link GstEwayProviderAdapter} — the default
 * binding is the ClearTax sandbox. Swapping to IRIS / Cygnet is a
 * single DI override.
 *
 * Public surface:
 *   - {@link generateEwayBill}      — create + persist an E-way bill
 *   - {@link getEwayBill}           — read by id
 *   - {@link getEwayBillByShipment} — read by shipmentId
 *   - {@link getEwayBillByNumber}   — read by ewbNo
 *   - {@link cancelEwayBill}        — mark CANCELLED
 *   - {@link isEwayBillRequired}    — re-export of the threshold check
 *
 * The service is sync today; if ClearTax moves to async, the same
 * contract holds and we can flip the body to a queue enqueue without
 * changing the resolver or the test surface.
 */
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShipmentEntity } from '@swiftship/platform-typeorm';
import { TenantContext } from '@swiftship/domains-tenants';
import { GstEwayBillEntity } from './gst-eway-bill.entity';
import { GstInvoiceService, EWAY_BILL_THRESHOLD_INR } from './gst-invoice.service';
import { GenerateEwayBillInput } from './gst-input';
import {
  GST_EWAY_PROVIDER_ADAPTER,
  GstEwayProviderAdapter,
} from './adapters/gst-eway-provider.interface';

@Injectable()
export class GstEwayBillService {
  private readonly logger = new Logger(GstEwayBillService.name);

  constructor(
    @InjectRepository(GstEwayBillEntity)
    private readonly ewayBills: Repository<GstEwayBillEntity>,
    @InjectRepository(ShipmentEntity)
    private readonly shipments: Repository<ShipmentEntity>,
    private readonly tenantContext: TenantContext,
    private readonly gstInvoice: GstInvoiceService,
    @Inject(GST_EWAY_PROVIDER_ADAPTER)
    private readonly adapter: GstEwayProviderAdapter,
  ) {}

  /** Re-export the threshold constant so callers don't import two files. */
  readonly threshold = EWAY_BILL_THRESHOLD_INR;

  isEwayBillRequired(invoiceValue: number, isInterState: boolean): boolean {
    return invoiceValue >= EWAY_BILL_THRESHOLD_INR;
  }

  /**
   * Generate an E-way bill. Throws when:
   *   - the shipment is missing
   *   - the shipment already has an active E-way bill
   *   - the invoice value is below the threshold
   *   - the adapter returns an error
   */
  async generateEwayBill(input: GenerateEwayBillInput): Promise<GstEwayBillEntity> {
    const tenantId = this.requireTenantId();

    const shipment = await this.shipments.findOne({ where: { id: input.shipmentId } });
    if (!shipment) {
      throw new NotFoundException(`Shipment ${input.shipmentId} not found`);
    }

    const existing = await this.ewayBills.findOne({
      where: { shipmentId: input.shipmentId, tenantId },
    });
    if (existing && existing.status !== 'CANCELLED' && existing.status !== 'EXPIRED') {
      throw new BadRequestException(
        `E-way bill already exists for shipment ${input.shipmentId}: ${existing.ewbNo}`,
      );
    }

    if (input.invoiceValue < EWAY_BILL_THRESHOLD_INR) {
      throw new BadRequestException(
        `E-way bill is not required for invoice value ${input.invoiceValue} (threshold ${EWAY_BILL_THRESHOLD_INR})`,
      );
    }

    const isInterState = this.gstInvoice.isInterState(
      input.supplierGstin,
      input.recipientGstin ?? input.toAddress,
    );

    const result = await this.adapter.generate({
      shipmentId: input.shipmentId,
      supplierGstin: input.supplierGstin,
      recipientGstin: input.recipientGstin ?? null,
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
      invoiceValue: input.invoiceValue,
      hsnCode: input.hsnCode ?? '996811',
      vehicleNo: input.vehicleNo ?? null,
      transporterId: input.transporterId ?? null,
      transporterName: input.transporterName ?? null,
      distanceKm: input.distanceKm ?? null,
      tenantId,
    });

    if (existing) {
      existing.ewbNo = result.ewbNo;
      existing.provider = this.adapter.name;
      existing.status = 'ACTIVE';
      existing.validFrom = result.validFrom;
      existing.validTo = result.validTo;
      existing.vehicleNo = result.vehicleNo ?? existing.vehicleNo;
      existing.transporterId = result.transporterId ?? existing.transporterId;
      existing.transporterName = result.transporterName ?? existing.transporterName;
      existing.ewayBillUrl = result.ewayBillUrl ?? existing.ewayBillUrl;
      existing.providerRef = result.providerRef ?? existing.providerRef;
      existing.providerPayload = result.providerPayload ?? existing.providerPayload;
      return this.ewayBills.save(existing);
    }

    const row = this.ewayBills.create({
      shipmentId: input.shipmentId,
      tenantId,
      ewbNo: result.ewbNo,
      provider: this.adapter.name,
      status: 'ACTIVE',
      validFrom: result.validFrom,
      validTo: result.validTo,
      vehicleNo: result.vehicleNo ?? null,
      transporterId: result.transporterId ?? null,
      transporterName: result.transporterName ?? null,
      ewayBillUrl: result.ewayBillUrl ?? null,
      providerRef: result.providerRef ?? null,
      providerPayload: result.providerPayload ?? null,
    });

    return this.ewayBills.save(row);
  }

  async getEwayBill(id: number): Promise<GstEwayBillEntity> {
    const tenantId = this.requireTenantId();
    const row = await this.ewayBills.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException(`E-way bill ${id} not found`);
    return row;
  }

  async getEwayBillByShipment(shipmentId: number): Promise<GstEwayBillEntity | null> {
    const tenantId = this.requireTenantId();
    return this.ewayBills.findOne({ where: { shipmentId, tenantId } });
  }

  async getEwayBillByNumber(ewbNo: string): Promise<GstEwayBillEntity | null> {
    const tenantId = this.requireTenantId();
    return this.ewayBills.findOne({ where: { ewbNo, tenantId } });
  }

  async cancelEwayBill(id: number, reason?: string): Promise<GstEwayBillEntity> {
    const row = await this.getEwayBill(id);
    if (row.status === 'CANCELLED') {
      throw new BadRequestException('E-way bill is already cancelled');
    }
    if (row.status === 'EXPIRED') {
      throw new BadRequestException('Cannot cancel an expired E-way bill');
    }
    row.status = 'CANCELLED';
    row.providerPayload = {
      ...(row.providerPayload ?? {}),
      cancelledAt: new Date().toISOString(),
      cancellationReason: reason ?? null,
    };
    return this.ewayBills.save(row);
  }

  private requireTenantId(): number {
    const tid = this.tenantContext.getTenantId();
    if (tid === null || tid === undefined) {
      throw new BadRequestException('Tenant context required for E-way bill operation');
    }
    return Number(tid);
  }
}
