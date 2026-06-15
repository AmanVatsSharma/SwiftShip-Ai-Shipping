/**
 * SS-032 — GstEwayBillService spec.
 *
 * Covers:
 *   1. isEwayBillRequired - threshold gate
 *   2. generateEwayBill - calls provider, persists row, returns ewb
 *   3. generateEwayBill - rejects below threshold
 *   4. generateEwayBill - rejects duplicate
 *   5. generateEwayBill - rejects missing shipment
 *   6. cancelEwayBill - happy path
 *   7. cancelEwayBill - rejects already cancelled
 *   8. cancelEwayBill - rejects expired
 *   9. ClearTax sandbox adapter - deterministic ewb number
 *  10. ClearTax sandbox adapter - isReady returns true
 *
 * The provider is a jest mock — the production binding is the real
 * ClearTax sandbox adapter, which is exercised end-to-end by the
 * adapter's own deterministic mode.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ShipmentEntity } from '@swiftship/platform-typeorm';
import { TenantContext } from '@swiftship/domains-tenants';
import { GstEwayBillService } from '../gst-eway-bill.service';
import {
  GstEwayBillEntity,
} from '../gst-eway-bill.entity';
import { GstInvoiceService } from '../gst-invoice.service';
import { ClearTaxSandboxAdapter } from '../adapters/cleartax-sandbox.adapter';
import {
  GST_EWAY_PROVIDER_ADAPTER,
  GstEwayProviderAdapter,
} from '../adapters/gst-eway-provider.interface';
import { GenerateEwayBillInput } from '../gst-input';

describe('GstEwayBillService', () => {
  let service: GstEwayBillService;
  let ewayBills: any;
  let shipments: any;
  let tenantContext: any;
  let gstInvoice: any;
  let adapter: any;

  const SHIPMENT_ID = 42;
  const mockShipment = {
    id: SHIPMENT_ID,
    tenantId: 1,
  };

  const baseInput: GenerateEwayBillInput = {
    shipmentId: SHIPMENT_ID,
    supplierGstin: '27AABCT1330L1Z1',
    recipientGstin: '34AABCT1330L1Z1',
    fromAddress: 'Mumbai, MH',
    toAddress: 'Chennai, TN',
    invoiceValue: 75000,
    hsnCode: '996811',
  };

  beforeEach(async () => {
    ewayBills = {
      create: jest.fn((data) => ({ id: 1, ...data })),
      save: jest.fn(async (data) => ({ id: 1, ...data })),
      findOne: jest.fn(),
    };
    shipments = {
      findOne: jest.fn(),
    };
    tenantContext = {
      getTenantId: jest.fn().mockReturnValue(1),
    };
    gstInvoice = {
      isInterState: jest.fn().mockReturnValue(true),
    };
    adapter = {
      name: 'cleartax-sandbox',
      isReady: jest.fn().mockReturnValue(true),
      generate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GstEwayBillService,
        { provide: getRepositoryToken(GstEwayBillEntity), useValue: ewayBills },
        { provide: getRepositoryToken(ShipmentEntity), useValue: shipments },
        { provide: TenantContext, useValue: tenantContext },
        { provide: GstInvoiceService, useValue: gstInvoice },
        { provide: GST_EWAY_PROVIDER_ADAPTER, useValue: adapter },
      ],
    }).compile();

    service = module.get(GstEwayBillService);
  });

  describe('isEwayBillRequired', () => {
    it('returns false below threshold', () => {
      expect(service.isEwayBillRequired(40000, false)).toBe(false);
    });

    it('returns true at threshold', () => {
      expect(service.isEwayBillRequired(50000, false)).toBe(true);
    });

    it('returns true above threshold', () => {
      expect(service.isEwayBillRequired(75000, true)).toBe(true);
    });
  });

  describe('generateEwayBill', () => {
    it('happy path: calls provider, persists, returns ewb', async () => {
      shipments.findOne.mockResolvedValue(mockShipment);
      ewayBills.findOne.mockResolvedValue(null);
      adapter.generate.mockResolvedValue({
        ewbNo: '123456789012',
        validFrom: new Date('2026-06-15T00:00:00Z'),
        validTo: new Date('2026-06-30T00:00:00Z'),
        ewayBillUrl: 'https://example.com/123456789012',
        providerRef: 'ref-1',
        providerPayload: { foo: 'bar' },
      });

      const result = await service.generateEwayBill(baseInput);

      expect(adapter.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          shipmentId: SHIPMENT_ID,
          supplierGstin: baseInput.supplierGstin,
          invoiceValue: 75000,
        }),
      );
      expect(ewayBills.create).toHaveBeenCalledWith(
        expect.objectContaining({
          shipmentId: SHIPMENT_ID,
          ewbNo: '123456789012',
          provider: 'cleartax-sandbox',
          status: 'ACTIVE',
        }),
      );
      expect(result.ewbNo).toBe('123456789012');
    });

    it('throws when shipment missing', async () => {
      shipments.findOne.mockResolvedValue(null);

      await expect(service.generateEwayBill(baseInput)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws when below threshold', async () => {
      shipments.findOne.mockResolvedValue(mockShipment);
      ewayBills.findOne.mockResolvedValue(null);

      const lowInput = { ...baseInput, invoiceValue: 30000 };
      await expect(service.generateEwayBill(lowInput)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws when eway bill already exists', async () => {
      shipments.findOne.mockResolvedValue(mockShipment);
      ewayBills.findOne.mockResolvedValue({
        id: 1,
        shipmentId: SHIPMENT_ID,
        status: 'ACTIVE',
        ewbNo: 'EXISTING123',
      });

      await expect(service.generateEwayBill(baseInput)).rejects.toThrow(
        'E-way bill already exists',
      );
    });
  });

  describe('cancelEwayBill', () => {
    it('cancels active eway bill', async () => {
      ewayBills.findOne.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
        providerPayload: {},
      });

      const result = await service.cancelEwayBill(1, 'customer request');

      expect(ewayBills.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          status: 'CANCELLED',
        }),
      );
      expect(result.status).toBe('CANCELLED');
    });

    it('throws when already cancelled', async () => {
      ewayBills.findOne.mockResolvedValue({
        id: 1,
        status: 'CANCELLED',
      });

      await expect(service.cancelEwayBill(1)).rejects.toThrow(
        'E-way bill is already cancelled',
      );
    });

    it('throws when expired', async () => {
      ewayBills.findOne.mockResolvedValue({
        id: 1,
        status: 'EXPIRED',
      });

      await expect(service.cancelEwayBill(1)).rejects.toThrow(
        'Cannot cancel an expired E-way bill',
      );
    });
  });
});

describe('ClearTaxSandboxAdapter', () => {
  let adapter: ClearTaxSandboxAdapter;

  beforeEach(() => {
    adapter = new ClearTaxSandboxAdapter();
  });

  it('isReady returns true', () => {
    expect(adapter.isReady()).toBe(true);
  });

  it('generates deterministic ewb number for same input', async () => {
    const req1 = {
      shipmentId: 42,
      supplierGstin: '27AABCT1330L1Z1',
      recipientGstin: '34AABCT1330L1Z1',
      fromAddress: 'Mumbai',
      toAddress: 'Chennai',
      invoiceValue: 75000,
      hsnCode: '996811',
      tenantId: 1,
    };
    const req2 = { ...req1, recipientGstin: '99ZZZZ9999X1Z9' };

    const result1 = await adapter.generate(req1);
    const result1b = await adapter.generate(req1);
    const result2 = await adapter.generate(req2);

    expect(result1.ewbNo).toBe(result1b.ewbNo);
    expect(result1.ewbNo).not.toBe(result2.ewbNo);
    expect(result1.ewbNo).toMatch(/^\d{12}$/);
    expect(result1.validTo.getTime() - result1.validFrom.getTime()).toBe(
      15 * 24 * 60 * 60 * 1000,
    );
  });

  it('returns provider name', () => {
    expect(adapter.name).toBe('cleartax-sandbox');
  });
});
