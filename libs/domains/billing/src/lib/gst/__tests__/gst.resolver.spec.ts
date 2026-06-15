/**
 * SS-032 — GstResolver spec.
 *
 * Smoke tests the thin resolver layer:
 *   - isGstinPayingCustomer returns the service's verdict
 *   - ewayBillThreshold returns the threshold payload
 *   - tenant guard: throws when no tenant is bound
 */
import { Test, TestingModule } from '@nestjs/testing';
import { TenantContext } from '@swiftship/domains-tenants';
import { GstResolver } from '../gst.resolver';
import { GstInvoiceService } from '../gst-invoice.service';
import { GstEwayBillService } from '../gst-eway-bill.service';

describe('GstResolver', () => {
  let resolver: GstResolver;
  let tenantContext: any;
  let gstInvoiceService: any;
  let ewayBillService: any;

  beforeEach(async () => {
    tenantContext = {
      getTenantId: jest.fn().mockReturnValue(1),
    };
    gstInvoiceService = {
      isGstinPayingCustomer: jest.fn().mockResolvedValue(true),
      thresholdCheck: jest.fn().mockReturnValue({
        required: true,
        threshold: 50000,
        invoiceValue: 75000,
        isInterState: false,
        reason: 'Threshold exceeded',
      }),
      generateGstInvoice: jest.fn(),
      getGstInvoiceByInvoiceId: jest.fn(),
    };
    ewayBillService = {
      generateEwayBill: jest.fn(),
      cancelEwayBill: jest.fn(),
      getEwayBillByShipment: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GstResolver,
        { provide: TenantContext, useValue: tenantContext },
        { provide: GstInvoiceService, useValue: gstInvoiceService },
        { provide: GstEwayBillService, useValue: ewayBillService },
      ],
    }).compile();

    resolver = module.get(GstResolver);
  });

  it('isGstinPayingCustomer returns true for tenant 1', async () => {
    const result = await resolver.isGstinPayingCustomer();
    expect(result).toBe(true);
    expect(gstInvoiceService.isGstinPayingCustomer).toHaveBeenCalledWith(1);
  });

  it('isGstinPayingCustomer returns false when no tenant is bound', async () => {
    tenantContext.getTenantId.mockReturnValue(null);
    const result = await resolver.isGstinPayingCustomer();
    expect(result).toBe(false);
    expect(gstInvoiceService.isGstinPayingCustomer).not.toHaveBeenCalled();
  });

  it('ewayBillThreshold returns the service payload', () => {
    const result = resolver.ewayBillThreshold(75000, false);
    expect(result).toEqual(
      expect.objectContaining({
        required: true,
        threshold: 50000,
        invoiceValue: 75000,
      }),
    );
    expect(gstInvoiceService.thresholdCheck).toHaveBeenCalledWith(75000, false);
  });
});
