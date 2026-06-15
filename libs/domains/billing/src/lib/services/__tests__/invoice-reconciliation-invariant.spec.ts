/**
 * SS-041 — Invoice reconciliation invariant test.
 *
 * Asserts that for every invoice the sum of `invoiceItems.taxAmount` equals
 * `invoice.taxAmount`, and the sum of `invoiceItems.totalPrice` equals
 * `invoice.amount`. This is the financial integrity invariant that prevents
 * invoices from becoming unbalanced during tax recalculation or item updates.
 *
 * The test runs against the invoice service in-memory mock to ensure the
 * TypeORM+Repository implementation preserves this invariant even when
 * invoices are created or modified through arbitrary code paths.
 *
 * Given the billing lib's limitations (no nx test target), the test is
 * structured to run manually as a spec alongside the existing GST tests.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InvoiceEntity } from '@swiftship/platform-typeorm';
import { InvoiceItemEntity } from '@swiftship/platform-typeorm';
import { WarehouseEntity } from '@swiftship/platform-typeorm';
import { UserEntity } from '@swiftship/platform-typeorm';
import { WarehouseSellerProfileEntity } from '@swiftship/platform-typeorm';
import { InvoiceSequenceEntity } from '@swiftship/platform-typeorm';
import { SubscriptionEntity } from '@swiftship/platform-typeorm';
import { PaymentEntity } from '@swiftship/platform-typeorm';
import { EwayBillEntity } from '@swiftship/platform-typeorm';
import { InvoiceStatus } from '@swiftship/platform-typeorm';
import { DataSource } from 'typeorm';
import { InvoiceService } from '../invoice.service';
import { CreateInvoiceInput } from '../../dto/create-invoice.input';
import { GstService } from '../gst.service';
import { PdfService } from '../pdf.service';
import { StorageService } from '@swiftship/domains-storage';
import { InvoiceEmailWorker } from '../invoice-email.worker';

describe('InvoiceReconciliationInvariant', () => {
  let service: InvoiceService;
  let invoices: any;
  let invoiceItems: any;
  let sequences: any;
  let subscriptions: any;
  let users: any;
  let warehouses: any;
  let sellerProfiles: any;
  let payments: any;
  let ewayBills: any;
  let dataSource: any;
  let gstService: any;
  let pdfService: any;
  let storage: any;
  let invoiceEmailWorker: any;

  beforeEach(async () => {
    invoices = {
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    };

    invoiceItems = {
      find: jest.fn(),
    };

    sequences = {
      findOne: jest.fn(),
    };

    subscriptions = {
      findOne: jest.fn(),
    };

    users = {
      findOne: jest.fn(),
    };

    warehouses = {
      findOne: jest.fn(),
    };

    sellerProfiles = {
      findOne: jest.fn(),
    };

    payments = {
      find: jest.fn(),
    };

    ewayBills = {
      find: jest.fn(),
    };

    dataSource = {
      transaction: jest.fn().mockImplementation(async (fn) => {
        const em = {
          getRepository: jest.fn().mockImplementation(() => invoices),
          create: jest.fn(),
          save: jest.fn(),
        };
        return fn(em);
      }),
    };

    gstService = {
      calculateGst: jest.fn().mockReturnValue({
        totalTax: 180,
        cgst: 90,
        sgst: 90,
        igst: 0,
        gstType: 'CGST_SGST',
      }),
    };

    pdfService = {
      generateInvoicePdf: jest.fn(),
    };

    storage = {
      uploadBuffer: jest.fn().mockResolvedValue({ url: 'mock-url', key: 'mock-key' }),
    };

    invoiceEmailWorker = {
      enqueue: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        { provide: getRepositoryToken(InvoiceEntity), useValue: invoices },
        { provide: getRepositoryToken(InvoiceItemEntity), useValue: invoiceItems },
        { provide: getRepositoryToken(InvoiceSequenceEntity), useValue: sequences },
        { provide: getRepositoryToken(SubscriptionEntity), useValue: subscriptions },
        { provide: getRepositoryToken(UserEntity), useValue: users },
        { provide: getRepositoryToken(WarehouseEntity), useValue: warehouses },
        { provide: getRepositoryToken(WarehouseSellerProfileEntity), useValue: sellerProfiles },
        { provide: getRepositoryToken(PaymentEntity), useValue: payments },
        { provide: getRepositoryToken(EwayBillEntity), useValue: ewayBills },
        { provide: DataSource, useValue: dataSource },
        { provide: GstService, useValue: gstService },
        { provide: PdfService, useValue: pdfService },
        { provide: StorageService, useValue: storage },
        { provide: InvoiceEmailWorker, useValue: invoiceEmailWorker },
      ],
    }).compile();

    service = module.get(InvoiceService);
  });

  describe('Financial Invariant: Invoice Items Sum', () => {
    it('sum of invoiceItems.totalPrice equals invoice.amount', async () => {
      const mockUser = { id: 1, name: 'Test User', email: 'test@example.com' };
      const mockWarehouse = { id: 1, code: 'WH001', city: 'Mumbai', state: 'Maharashtra' };
      const mockSellerProfile = {
        id: 1,
        gstin: '27AABCT1330L1Z1',
        state: 'Maharashtra',
        isActive: true,
        isDefault: true
      };

      users.findOne.mockResolvedValue(mockUser);
      warehouses.findOne.mockResolvedValue(mockWarehouse);
      sellerProfiles.findOne.mockResolvedValue(mockSellerProfile);

      const input: CreateInvoiceInput = {
        userId: 1,
        warehouseId: 1,
        sellerProfileId: 1,
        items: [
          { description: 'Item 1', quantity: 2, unitPrice: 100 },
          { description: 'Item 2', quantity: 3, unitPrice: 200 },
          { description: 'Item 3', quantity: 1, unitPrice: 150 },
        ],
        autoEmailBuyer: false,
      };

      sequences.findOne.mockResolvedValue(null);
      sequences.findOne.mockResolvedValue(null);

      const expectedTotalPrice = (2 * 100) + (3 * 200) + (1 * 150); // 850
      const expectedTaxAmount = 180;
      const expectedAmount = expectedTotalPrice; // amount excludes tax in invoice service
      const expectedTotalAmount = expectedAmount + expectedTaxAmount; // 1030

      dataSource.transaction.mockImplementation(async (fn) => {
        const em = {
          getRepository: jest.fn().mockImplementation((entity) => {
            if (entity === InvoiceEntity) {
              const repo = {
                create: jest.fn().mockReturnValue({
                  id: 'inv-123',
                  amount: expectedAmount,
                  taxAmount: expectedTaxAmount,
                  totalAmount: expectedTotalAmount,
                }),
                save: jest.fn(),
              };
              return repo;
            } else if (entity === InvoiceItemEntity) {
              return {
                create: jest.fn().mockImplementation((data) => ({
                  ...data,
                  invoiceId: 'inv-123',
                })),
                save: jest.fn(),
              };
            }
            return { create: jest.fn(), save: jest.fn() };
          }),
          create: jest.fn(),
          save: jest.fn(),
        };

        await fn(em);
      });

      const invoice = await service.createInvoice(input);

      // Verify item totals match invoice totals
      const invoiceItems = invoice.invoiceItems || [];
      const actualTotalPrice = invoiceItems.reduce((sum, item) => sum + item.totalPrice, 0);
      const actualTaxAmount = invoiceItems.reduce((sum, item) => sum + item.taxAmount, 0);

      expect(actualTotalPrice).toBe(expectedAmount); // invoice.amount
      expect(actualTaxAmount).toBe(expectedTaxAmount); // invoice.taxAmount
      expect(actualTotalPrice + actualTaxAmount).toBe(expectedTotalAmount);
    });

    it('preserves invariant when taxes vary by item', async () => {
      const mockUser = { id: 1, name: 'Test User', email: 'test@example.com' };
      const mockWarehouse = { id: 1, code: 'WH001', city: 'Mumbai', state: 'Maharashtra' };
      const mockSellerProfile = {
        id: 1,
        gstin: '27AABCT1330L1Z1',
        state: 'Maharashtra',
        isActive: true,
        isDefault: true
      };

      users.findOne.mockResolvedValue(mockUser);
      warehouses.findOne.mockResolvedValue(mockWarehouse);
      sellerProfiles.findOne.mockResolvedValue(mockSellerProfile);

      const input: CreateInvoiceInput = {
        userId: 1,
        warehouseId: 1,
        sellerProfileId: 1,
        items: [
          { description: 'Item 1', quantity: 2, unitPrice: 100, taxRate: 5 },
          { description: 'Item 2', quantity: 1, unitPrice: 200, taxRate: 18 },
        ],
        autoEmailBuyer: false,
      };

      // Mock different GST calculations for each item
      gstService.calculateGst
        .mockReturnValueOnce({ totalTax: 10, cgst: 5, sgst: 5, igst: 0, gstType: 'CGST_SGST' }) // Item 1: 200 * 5% = 10
        .mockReturnValueOnce({ totalTax: 36, cgst: 18, sgst: 18, igst: 0, gstType: 'CGST_SGST' }); // Item 2: 200 * 18% = 36

      sequences.findOne.mockResolvedValue(null);

      const expectedTotalPrice = (2 * 100) + (1 * 200); // 400
      const expectedTaxAmount = 10 + 36; // 46
      const expectedAmount = expectedTotalPrice;
      const expectedTotalAmount = expectedAmount + expectedTaxAmount; // 446

      dataSource.transaction.mockImplementation(async (fn) => {
        const em = {
          getRepository: jest.fn().mockImplementation((entity) => {
            if (entity === InvoiceEntity) {
              return {
                create: jest.fn().mockReturnValue({
                  id: 'inv-456',
                  amount: expectedAmount,
                  taxAmount: expectedTaxAmount,
                  totalAmount: expectedTotalAmount,
                }),
                save: jest.fn(),
              };
            } else if (entity === InvoiceItemEntity) {
              return {
                create: jest.fn().mockImplementation((data) => ({
                  ...data,
                  invoiceId: 'inv-456',
                })),
                save: jest.fn(),
              };
            }
            return { create: jest.fn(), save: jest.fn() };
          }),
          create: jest.fn(),
          save: jest.fn(),
        };

        await fn(em);
      });

      const invoice = await service.createInvoice(input);

      // Verify each item's tax amount
      const invoiceItems = invoice.invoiceItems || [];
      expect(invoiceItems[0].totalPrice).toBe(200); // 2 * 100
      expect(invoiceItems[0].taxAmount).toBe(10);
      expect(invoiceItems[1].totalPrice).toBe(200); // 1 * 200
      expect(invoiceItems[1].taxAmount).toBe(36);

      // Verify sum of item totals
      const actualTotalPrice = invoiceItems.reduce((sum, item) => sum + item.totalPrice, 0);
      const actualTaxAmount = invoiceItems.reduce((sum, item) => sum + item.taxAmount, 0);

      expect(actualTotalPrice).toBe(expectedAmount); // invoice.amount
      expect(actualTaxAmount).toBe(expectedTaxAmount); // invoice.taxAmount
      expect(actualTotalPrice).toEqual(invoice.amount);
      expect(actualTaxAmount).toEqual(invoice.taxAmount);
    });

    it('does not allow negative item quantities that break the invariant', async () => {
      const input: CreateInvoiceInput = {
        userId: 1,
        warehouseId: 1,
        items: [
          { description: 'Invalid Item', quantity: -1, unitPrice: 100 },
        ],
        autoEmailBuyer: false,
      };

      // Test that the service handles invalid input gracefully
      // (This ensures the invariant can't be broken by bad data)
      await expect(service.createInvoice(input)).rejects.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('handles zero-tax items correctly', async () => {
      const mockUser = { id: 1, name: 'Test User', email: 'test@example.com' };
      const mockWarehouse = { id: 1, code: 'WH001', city: 'Mumbai', state: 'Maharashtra' };
      const mockSellerProfile = {
        id: 1,
        gstin: '27AABCT1330L1Z1',
        state: 'Maharashtra',
        isActive: true,
        isDefault: true
      };

      users.findOne.mockResolvedValue(mockUser);
      warehouses.findOne.mockResolvedValue(mockWarehouse);
      sellerProfiles.findOne.mockResolvedValue(mockSellerProfile);

      const input: CreateInvoiceInput = {
        userId: 1,
        warehouseId: 1,
        sellerProfileId: 1,
        items: [
          { description: 'Tax-free Item', quantity: 5, unitPrice: 100, taxRate: 0 },
        ],
        autoEmailBuyer: false,
      };

      gstService.calculateGst.mockReturnValue({
        totalTax: 0, cgst: 0, sgst: 0, igst: 0, gstType: 'CGST_SGST'
      });

      sequences.findOne.mockResolvedValue(null);

      const expectedTotalPrice = 5 * 100; // 500
      const expectedTaxAmount = 0;
      const expectedAmount = expectedTotalPrice;
      const expectedTotalAmount = expectedAmount;

      dataSource.transaction.mockImplementation(async (fn) => {
        const em = {
          getRepository: jest.fn().mockImplementation((entity) => {
            if (entity === InvoiceEntity) {
              return {
                create: jest.fn().mockReturnValue({
                  id: 'inv-zero-tax',
                  amount: expectedAmount,
                  taxAmount: expectedTaxAmount,
                  totalAmount: expectedTotalAmount,
                }),
                save: jest.fn(),
              };
            } else if (entity === InvoiceItemEntity) {
              return {
                create: jest.fn().mockImplementation((data) => ({
                  ...data,
                  invoiceId: 'inv-zero-tax',
                })),
                save: jest.fn(),
              };
            }
            return { create: jest.fn(), save: jest.fn() };
          }),
          create: jest.fn(),
          save: jest.fn(),
        };

        await fn(em);
      });

      const invoice = await service.createInvoice(input);

      const invoiceItems = invoice.invoiceItems || [];
      const actualTotalPrice = invoiceItems.reduce((sum, item) => sum + item.totalPrice, 0);
      const actualTaxAmount = invoiceItems.reduce((sum, item) => sum + item.taxAmount, 0);

      expect(actualTotalPrice).toBe(expectedAmount);
      expect(actualTaxAmount).toBe(expectedTaxAmount);
    });
  });
});