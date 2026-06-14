import { Injectable, Logger } from '@nestjs/common';
import { WalletEntity } from './wallet.entity';
import { WalletLedgerEntity } from './wallet-ledger.entity';

/**
 * Shape of the invoice produced for a wallet top-up. Mirrors the
 * `Invoice` GraphQL type in libs/domains/billing/src/lib/billing.model.ts
 * closely enough that callers can coerce one into the other.
 */
export interface WalletTopupInvoice {
  id: string;
  tenantId: number;
  walletId: number;
  ledgerEntryId: number;
  invoiceNumber: string;
  amount: number; // paise, base amount
  taxRate: number; // 18 for standard GST
  cgstAmount: number; // 9% of base
  sgstAmount: number; // 9% of base
  igstAmount: number; // 0 for intra-state (CGST+SGST split)
  totalTax: number; // cgst + sgst
  totalAmount: number; // amount + totalTax
  currency: string; // 'INR'
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID';
  financialYear: string; // e.g. 'FY2627'
  reason: 'WALLET_TOPUP';
  idempotencyKey: string;
  createdAt: Date;
}

/**
 * The minimum slice of the top-up event that the invoice service needs.
 * We keep this decoupled from the raw ledger row so a future change to
 * the ledger shape doesn't ripple through invoicing.
 */
export interface WalletTopupEvent {
  tenantId: number;
  wallet: WalletEntity;
  ledger: WalletLedgerEntity;
  idempotencyKey: string;
}

const GST_RATE = 18; // %
const CGST_RATE = 9;
const SGST_RATE = 9;

@Injectable()
export class WalletInvoiceService {
  private readonly logger = new Logger(WalletInvoiceService.name);

  /**
   * TODO(SS-004 follow-up): replace this stub with a real call into
   * BillingService.createInvoice once we wire the cross-domain import
   * safely. The current billing module pulls in platform-typeorm, which
   * adds a circular-import risk to the tenants lib. Until that's
   * resolved, we issue a fully-populated invoice in-process so callers
   * (SS-005 onboarding, top-up webhook) get a usable response.
   *
   * When the real wiring lands, this method should:
   *   1. Call billingService.createInvoice({ ... }) with the GST split
   *      computed below (CGST 9% + SGST 9% on the base amount).
   *   2. Persist `walletInvoice` linkage row (walletId, invoiceId).
   *   3. Return the persisted Invoice.
   */
  async generateWalletTopupInvoice(
    event: WalletTopupEvent,
  ): Promise<WalletTopupInvoice> {
    const base = event.ledger.amount; // paise
    const cgst = Math.round((base * CGST_RATE) / 100);
    const sgst = Math.round((base * SGST_RATE) / 100);
    const totalTax = cgst + sgst;
    const total = base + totalTax;
    const invoice: WalletTopupInvoice = {
      id: `inv_${event.ledger.id}`,
      tenantId: event.tenantId,
      walletId: event.wallet.id,
      ledgerEntryId: event.ledger.id,
      invoiceNumber: this.invoiceNumberFor(event),
      amount: base,
      taxRate: GST_RATE,
      cgstAmount: cgst,
      sgstAmount: sgst,
      igstAmount: 0,
      totalTax,
      totalAmount: total,
      currency: 'INR',
      status: 'ISSUED',
      financialYear: this.financialYear(new Date()),
      reason: 'WALLET_TOPUP',
      idempotencyKey: event.idempotencyKey,
      createdAt: new Date(),
    };
    this.logger.log(
      `Issued topup invoice ${invoice.invoiceNumber} for tenant=${event.tenantId} base=${base}p total=${total}p`,
    );
    return invoice;
  }

  // ---------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------
  private invoiceNumberFor(event: WalletTopupEvent): string {
    // Stub number generator — real one lives in BillingService.
    // Format: WLT-<tenantId>-<ledgerId>-<fySuffix>
    const fy = this.financialYear(new Date());
    return `WLT-${event.tenantId}-${event.ledger.id}-${fy.slice(-4)}`;
  }

  private financialYear(d: Date): string {
    const y = d.getFullYear();
    const m = d.getMonth();
    const start = m >= 3 ? y : y - 1;
    const end = (start + 1) % 100;
    return `FY${String(start).slice(-2)}${String(end).padStart(2, '0')}`;
  }
}
