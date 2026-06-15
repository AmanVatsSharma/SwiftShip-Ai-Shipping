/**
 * SS-032 — GstInvoiceService spec.
 *
 * Covers the full GST calculation pipeline:
 *   1. calculateGst - pure function tax split (CGST+SGST vs IGST)
 *   2. resolveHsnRate - HSN lookup with 4/2-digit fallback
 *   3. isInterState - state vs GSTIN compare
 *   4. isGstinPayingCustomer - KYC record lookup gate
 *   5. thresholdCheck - E-way bill threshold logic
 *   6. generateGstInvoice - persistence with HSN resolution
 *
 * All repos are in-memory jest mocks so the suite is hermetic and fast.
 */
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InvoiceEntity } from '@swiftship/platform-typeorm';
import {
  KycRecordEntity,
  KycStatus,
} from '@swiftship/domains-onboarding';
import { TenantContext } from '@swiftship/domains-tenants';
import { GstInvoiceService } from '../gst-invoice.service';
import {
  GstInvoiceEntity,
} from '../gst-invoice.entity';
import { GenerateGstInvoiceInput } from '../gst-input';
import { DEFAULT_HSN_CODE } from '../gst-rate-table';

describe('GstInvoiceService', () => {
  let service: GstInvoiceService;
  let gstInvoices: any;
  let invoices: any;
  let kyc: any;
  let tenantContext: any;

  beforeEach(async () => {
    gstInvoices = {
      create: jest.fn((data) => ({ id: 1, ...data })),
      save: jest.fn(async (data) => ({ id: 1, ...data })),
      findOne: jest.fn(),
    };
    invoices = {
      findOne: jest.fn(),
    };
    kyc = {
      findOne: jest.fn(),
    };
    tenantContext = {
      getTenantId: jest.fn().mockReturnValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GstInvoiceService,
        { provide: getRepositoryToken(GstInvoiceEntity), useValue: gstInvoices },
        { provide: getRepositoryToken(InvoiceEntity), useValue: invoices },
        { provide: getRepositoryToken(KycRecordEntity), useValue: kyc },
        { provide: TenantContext, useValue: tenantContext },
      ],
    }).compile();

    service = module.get(GstInvoiceService);
  });

  describe('calculateGst', () => {
    it('calculates CGST+SGST for intra-state', () => {
      const result = service.calculateGst(100, 18, false);
      expect(result.cgst).toBe(9);
      expect(result.sgst).toBe(9);
      expect(result.igst).toBe(0);
      expect(result.totalTax).toBe(18);
      expect(result.totalAmount).toBe(118);
      expect(result.gstType).toBe('CGST_SGST');
    });

    it('calculates IGST for inter-state', () => {
      const result = service.calculateGst(100, 12, true);
      expect(result.cgst).toBe(0);
      expect(result.sgst).toBe(0);
      expect(result.igst).toBe(12);
      expect(result.totalTax).toBe(12);
      expect(result.totalAmount).toBe(112);
      expect(result.gstType).toBe('IGST');
    });

    it('rounds to 2 decimal places', () => {
      const result = service.calculateGst(99.99, 18, false);
      expect(result.cgst).toBeCloseTo(9.00, 1);
      expect(result.sgst).toBeCloseTo(9.00, 1);
      expect(result.totalAmount).toBeCloseTo(118.00, 1);
    });

    it('throws for negative base amount', () => {
      expect(() => service.calculateGst(-100, 18, false)).toThrow(
        'taxableValue cannot be negative',
      );
    });

    it('throws for invalid tax slab', () => {
      expect(() => service.calculateGst(100, 19, false)).toThrow(
        'Invalid GST slab 19% — must be one of 0, 5, 12, 18, 28',
      );
    });
  });

  describe('resolveHsnRate', () => {
    it('looks up exact match', () => {
      const result = service.resolveHsnRate('996511');
      expect(result.taxRate).toBe(5);
      expect(result.description).toBe('Basic courier services');
    });

    it('falls back to chapter for 4-digit code', () => {
      const result = service.resolveHsnRate('9965XX');
      expect(result.taxRate).toBe(5);
      expect(result.description).toBe('Basic courier services');
    });

    it('falls back to default for short code', () => {
      const result = service.resolveHsnRate('99');
      expect(result.taxRate).toBe(18);
      expect(result.description).toContain('Unrecognized HSN/SAC');
      expect(result.hsnCode).toBe('99');
    });

    it('handles empty string', () => {
      const result = service.resolveHsnRate('');
      expect(result.taxRate).toBe(18);
      expect(result.hsnCode).toBe(DEFAULT_HSN_CODE);
    });
  });

  describe('isInterState', () => {
    it('returns true for different states', () => {
      expect(service.isInterState('Maharashtra', 'Tamil Nadu')).toBe(true);
      expect(service.isInterState('27', '34')).toBe(true);
    });

    it('returns false for same state', () => {
      expect(service.isInterState('Maharashtra', 'Maharashtra')).toBe(false);
      expect(service.isInterState('27', '27')).toBe(false);
    });

    it('false when GSTINs are empty', () => {
      expect(service.isInterState('', 'Maharashtra')).toBe(false);
    });
  });

  describe('isGstinPayingCustomer', () => {
    it('returns true for verified tenant with GSTIN', async () => {
      kyc.findOne.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: KycStatus.VERIFIED,
        gstin: '27AABCT1330L1Z1',
      });

      const result = await service.isGstinPayingCustomer(1);
      expect(result).toBe(true);
    });

    it('returns false for unverified tenant', async () => {
      kyc.findOne.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: KycStatus.REJECTED,
      });

      const result = await service.isGstinPayingCustomer(1);
      expect(result).toBe(false);
    });

    it('returns false for tenant with no GSTIN', async () => {
      kyc.findOne.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: KycStatus.VERIFIED,
        gstin: '',
      });

      const result = await service.isGstinPayingCustomer(1);
      expect(result).toBe(false);
    });

    it('returns false for missing tenant', async () => {
      kyc.findOne.mockResolvedValueOnce(null);

      const result = await service.isGstinPayingCustomer(1);
      expect(result).toBe(false);
    });
  });

  describe('thresholdCheck', () => {
    it('returns required=false below threshold', () => {
      const result = service.thresholdCheck(40000, false);
      expect(result.required).toBe(false);
      expect(result.reason).toContain('below the E-way bill threshold');
    });

    it('returns required=true above threshold', () => {
      const result = service.thresholdCheck(60000, false);
      expect(result.required).toBe(true);
    });

    it('includes reason for inter-state', () => {
      const result = service.thresholdCheck(60000, true);
      expect(result.reason).toContain('Inter-state shipment');
    });
  });

  describe('generateGstInvoice', () => {
    const mockInvoice = {
      id: 'inv-123',
      tenantId: 1,
    };

    beforeEach(() => {
      invoices.findOne.mockResolvedValue(mockInvoice);
    });

    it('creates new GST record', async () => {
      gstInvoices.findOne.mockResolvedValue(null);

      const input: GenerateGstInvoiceInput = {
        invoiceId: 'inv-123',
        hsnCode: '996511',
        taxableValue: 1000,
        taxRate: 5,
        supplierState: 'Maharashtra',
        placeOfSupply: 'Maharashtra',
      };

      const result = await service.generateGstInvoice(input);

      expect(gstInvoices.create).toHaveBeenCalledWith(
        expect.objectContaining({
          invoiceId: 'inv-123',
          hsnCode: '996511',
          taxableValue: 1000,
          taxRate: 5,
          gstType: 'CGST_SGST',
        }),
      );
    });

    it('updates existing GST record', async () => {
      const existing = { id: 1, invoiceId: 'inv-123' };
      gstInvoices.findOne.mockResolvedValue(existing);

      const input: GenerateGstInvoiceInput = {
        invoiceId: 'inv-123',
        hsnCode: '996511',
        taxableValue: 1000,
        taxRate: 5,
        supplierState: 'Maharashtra',
        placeOfSupply: 'Maharashtra',
      };

      const result = await service.generateGstInvoice(input);

      expect(gstInvoices.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          invoiceId: 'inv-123',
        }),
      );
    });

    it('throws for missing invoice', async () => {
      invoices.findOne.mockResolvedValue(null);

      const input: GenerateGstInvoiceInput = {
        invoiceId: 'missing-123',
        hsnCode: '996511',
        taxableValue: 1000,
        supplierState: 'Maharashtra',
        placeOfSupply: 'Maharashtra',
      };

      await expect(service.generateGstInvoice(input)).rejects.toThrow(
        'Invoice missing-123 not found',
      );
    });
  });
});