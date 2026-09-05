/**
 * E2E — KYC → COD gate → invoice → GST breakdown leg.
 *
 * ENVIRONMENT NEEDS: Postgres + Redis (see support/e2e-harness.ts).
 * EXECUTED LOCALLY: NO — Docker unavailable; CI-runnable via
 *   npx nx run api-e2e:e2e --testFile=kyc-gst-invoice.e2e-spec.ts
 *
 * SURFACE NOTES (verified in libs/domains/onboarding + libs/domains/billing):
 *  - submitKyc validates PAN + GSTIN structurally AND cross-checks that
 *    the GSTIN embeds the supplied PAN; the 15th char is a checksum
 *    (computed by the harness helper). Bank verification runs on the
 *    Setu sandbox: account 1111111111 → VERIFIED.
 *  - The async verify job normally runs on BullMQ; for determinism the
 *    spec invokes KycService.processVerifyJob directly (same worker code).
 *  - The `createInvoice` GraphQL mutation is currently broken: the
 *    resolver assigns `input.userId = user.id` but the JWT payload exposes
 *    `userId`, so it always 404s. The invoice is therefore created via the
 *    real InvoiceService from DI (also lets us seed the seller profile),
 *    and the GST mutations/queries below it go through GraphQL.
 *  - InvoiceEntity defaults tenantId to 1 and InvoiceService.createInvoice
 *    never sets it, so the row is re-homed to the fresh tenant before the
 *    tenant-scoped GST queries run (flagged as a bug in the report).
 *  - GST query is `gstInvoiceByInvoiceId` (no `gstInvoices` list exists).
 */
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { KycService, KycStatus, KycRecordEntity } from '@swiftship/domains-onboarding';
import {
  InvoiceService,
} from '../../../libs/domains/billing/src/lib/services/invoice.service';
import {
  WarehouseSellerProfileEntity,
} from '@swiftship/platform-typeorm';
import {
  createE2eApp,
  gql,
  rawGql,
  scopedTenantResolver,
  setupTenantStack,
  truncateAll,
  validGstinForPan,
  type TenantStack,
} from './support/e2e-harness';

const PAN = 'ABCFE1234F';
const GSTIN = validGstinForPan(PAN); // 27ABCDE1234F1Z<checksum>

async function tryCreateCodOrder(
  app: INestApplication,
  stack: TenantStack,
): Promise<{ errors?: any[]; data?: any }> {
  return rawGql(app, {
    query: `mutation($input: CreateOrderInput!) { createOrder(input: $input) { id paymentStatus } }`,
    variables: {
      input: {
        orderNumber: `E2E-COD-${Date.now()}`,
        total: 1999,
        userId: stack.userId,
        destinationPincode: '560103',
        packageWeightGrams: 500,
        carrierId: stack.carrierId,
        warehouseId: stack.warehouseId,
        rankRate: false,
        paymentMethod: 'COD',
      },
    },
    token: stack.token,
  });
}

describe('KYC → COD gate → invoice → GST breakdown (e2e)', () => {
  let app: INestApplication;
  let stack: TenantStack;
  let kycRecordId: number;
  let invoiceId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    await truncateAll(app);
    stack = await setupTenantStack(app, 'kycgst');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('COD orders are refused before KYC is verified', async () => {
    const body = await tryCreateCodOrder(app, stack);
    expect(
      body.errors?.[0]?.message ?? 'no error — order was created: ' +
        JSON.stringify(body.data),
    ).toContain('KYC');
    expect(body.data?.createOrder ?? null).toBeNull();
  });

  it('submitKyc accepts a format-valid PAN/GSTIN pair and lands PENDING', async () => {
    const data = await gql(app, {
      query: /* GraphQL */ `
        mutation Submit($input: SubmitKycInput!) {
          submitKyc(input: $input) { id tenantId pan gstin status bankAccountLast4 ifsc }
        }
      `,
      variables: {
        input: {
          pan: PAN,
          gstin: GSTIN,
          bankAccountNumber: '1111111111', // Setu sandbox → VERIFIED
          ifsc: 'HDFC0001234',
          accountHolderName: 'E2E KYC Holder',
        },
      },
      apiKey: stack.apiKey,
    });
    kycRecordId = Number(data.submitKyc.id);
    expect(kycRecordId).toBeGreaterThan(0);
    expect(data.submitKyc.status).toBe('PENDING');
    expect(data.submitKyc.pan).toBe(PAN);
    expect(data.submitKyc.gstin).toBe(GSTIN);
    expect(data.submitKyc.bankAccountLast4).toBe('1111');
  });

  it('the async verify job (driven directly) flips KYC to VERIFIED', async () => {
    const resolve = scopedTenantResolver(app, stack.tenantId);
    const kyc = await resolve(KycService);
    // submitKyc deliberately never persists the full account number; the
    // verify job expects it via record metadata (production passes it in
    // the job payload). Seed it the way the worker contract describes.
    const ds = app.get(DataSource);
    await ds
      .createQueryBuilder()
      .update(KycRecordEntity)
      .set({ metadata: { bankAccountNumber: '1111111111' } as any })
      .where('id = :id', { id: kycRecordId })
      .execute();
    const status = await kyc.processVerifyJob({
      kycRecordId,
      tenantId: stack.tenantId,
      attempt: 0,
    });
    expect(status).toBe(KycStatus.VERIFIED);

    const data = await gql(app, {
      query: `query { kycStatus { id status gstin } }`,
      apiKey: stack.apiKey,
    });
    expect(data.kycStatus.status).toBe('VERIFIED');
  });

  it('COD orders are accepted once KYC is VERIFIED', async () => {
    const body = await tryCreateCodOrder(app, stack);
    expect(body.errors ?? []).toEqual([]);
    expect(Number(body.data.createOrder.id)).toBeGreaterThan(0);
  });

  it('invoice is created (via InvoiceService) and GST breakdown generated via GraphQL', async () => {
    const ds = app.get(DataSource);
    // InvoiceService requires an active seller profile on the warehouse.
    await ds.getRepository(WarehouseSellerProfileEntity).save(
      ds.getRepository(WarehouseSellerProfileEntity).create({
        warehouseId: stack.warehouseId,
        userId: stack.userId,
        profileName: 'E2E default',
        legalName: 'E2E Seller Pvt Ltd',
        gstin: GSTIN,
        addressLine1: '3 Invoice Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001',
        isDefault: true,
        isActive: true,
      }),
    );

    const invoices = app.get(InvoiceService);
    const invoice = await invoices.createInvoice({
      userId: stack.userId,
      warehouseId: stack.warehouseId,
      items: [{ description: 'Shipping charges', quantity: 1, unitPrice: 1000, taxRate: 18 }],
      currency: 'INR',
      autoEmailBuyer: false,
    } as any);
    invoiceId = invoice.id;
    // Sequence format: {WAREHOUSE_CODE}-FY{YY}{YY}-{000001}
    expect(invoice.invoiceNumber.startsWith('E2E')).toBe(true);
    expect(invoice.invoiceNumber).toContain('-FY');
    expect(invoice.amount).toBe(1000);
    expect(invoice.taxAmount).toBe(180);
    expect(invoice.totalAmount).toBe(invoice.amount + invoice.taxAmount);

    // Re-home the row: createInvoice leaves tenantId at the column default
    // (bug — GST queries are tenant-scoped and would 404 otherwise).
    await ds.query(`UPDATE invoices SET "tenantId" = $1 WHERE id = $2`, [
      stack.tenantId,
      invoiceId,
    ]);

    const gst = await gql(app, {
      query: /* GraphQL */ `
        mutation Gst($input: GenerateGstInvoiceInput!) {
          generateGstInvoice(input: $input) {
            id
            invoiceId
            hsnCode
            taxableValue
            taxRate
            cgstAmount
            sgstAmount
            igstAmount
          }
        }
      `,
      variables: {
        input: {
          invoiceId,
          hsnCode: '996811',
          taxableValue: 1000,
          taxRate: 18,
          supplierState: 'Karnataka',
          placeOfSupply: 'Karnataka',
          supplierGstin: GSTIN,
        },
      },
      apiKey: stack.apiKey,
    });
    // Intra-state supply → CGST+SGST split, no IGST.
    expect(Number(gst.generateGstInvoice.taxableValue)).toBe(1000);
    expect(Number(gst.generateGstInvoice.cgstAmount)).toBe(90);
    expect(Number(gst.generateGstInvoice.sgstAmount)).toBe(90);
    expect(Number(gst.generateGstInvoice.igstAmount)).toBe(0);
  });

  it('gstInvoiceByInvoiceId returns the stored breakdown', async () => {
    const data = await gql(app, {
      query: `query($invoiceId: String!) { gstInvoiceByInvoiceId(invoiceId: $invoiceId) { invoiceId hsnCode taxableValue } }`,
      variables: { invoiceId },
      apiKey: stack.apiKey,
    });
    expect(data.gstInvoiceByInvoiceId.invoiceId).toBe(invoiceId);
    expect(data.gstInvoiceByInvoiceId.hsnCode).toBe('996811');
  });
});
