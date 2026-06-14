/**
 * SS-031 — Bank account verification adapter.
 *
 * In production this delegates to a real provider — Setu (Penny Drop),
 * CKYC, Cashfree, or Razorpay Route — behind the {@link BankVerifierAdapter}
 * interface. In dev / CI / tests we ship a deterministic mock so the
 * flow can be exercised without credentials. The configuration swap is
 * a single DI provider in {@link KycModule}.
 *
 * The IFSC format is standardized by RBI:
 *   - First 4 chars: bank code (alphabetic)
 *   - 5th char:       0 (reserved)
 *   - Pos 6-7:        branch code (alphabetic, sort-district)
 *   - Pos 8-11:       branch identifier (alphanumeric)
 * Example: SBIN0001234, HDFC0000123, ICIC0001234.
 */
import { Injectable, Logger } from '@nestjs/common';

export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export interface BankVerifyRequest {
  /** 9-18 digit account number. */
  accountNumber: string;
  ifsc: string;
  /** Holder name as submitted; providers may do a fuzzy name-match. */
  accountHolderName?: string;
  /** Merchant tenant id (for audit). */
  tenantId: number;
}

export type BankVerifyStatus = 'VERIFIED' | 'REJECTED' | 'PENDING' | 'INVALID';

export interface BankVerifyResult {
  status: BankVerifyStatus;
  /** Provider's reference id (Penny-Drop txn id, etc.) for audit. */
  providerRef?: string;
  /** Account holder name returned by the provider (when matched). */
  holderName?: string;
  /** Reject reason, when status = REJECTED or INVALID. */
  reason?: string;
}

export interface BankVerifierAdapter {
  /** Display name of the provider (used in audit logs). */
  readonly name: string;
  /** True if the adapter is wired (credentials present) and ready. */
  isReady(): boolean;
  verify(req: BankVerifyRequest): Promise<BankVerifyResult>;
}

/**
 * Default Setu-sandbox stub. Deterministic — well-known fixtures map to
 * VERIFIED, malformed IFSC to INVALID, and anything else stays PENDING
 * (which triggers the KYC queue to retry).
 *
 * The "magic" account `1111111111` is treated as a known-good Setu
 * sandbox fixture and verified as "JOHN DOE". `9999999999` is treated
 * as a known-bad fixture and rejected.
 */
@Injectable()
export class SetuSandboxBankVerifier implements BankVerifierAdapter {
  readonly name = 'setu-sandbox';
  private readonly logger = new Logger(SetuSandboxBankVerifier.name);

  isReady(): boolean {
    // The sandbox is always "ready" — it doesn't need real credentials.
    return process.env.KYC_BANK_PROVIDER !== 'production';
  }

  async verify(req: BankVerifyRequest): Promise<BankVerifyResult> {
    // IFSC regex check is a precondition for any real lookup.
    if (!IFSC_REGEX.test(req.ifsc)) {
      return {
        status: 'INVALID',
        reason: 'IFSC format invalid (expected AAAA0XXXXXX)',
      };
    }

    const account = req.accountNumber.replace(/\s+/g, '');
    if (!/^\d{9,18}$/.test(account)) {
      return {
        status: 'INVALID',
        reason: 'Account number must be 9-18 digits',
      };
    }

    // Deterministic fixtures.
    if (account === '1111111111') {
      return {
        status: 'VERIFIED',
        providerRef: `setu-sandbox-${Date.now()}`,
        holderName: 'JOHN DOE',
      };
    }
    if (account === '9999999999') {
      return {
        status: 'REJECTED',
        providerRef: `setu-sandbox-${Date.now()}`,
        reason: 'Name mismatch with bank records',
      };
    }

    // Anything else stays PENDING — production Setu/CKYC will fill in
    // an async penny-drop that returns later. The KYC queue will retry.
    this.logger.debug(
      `Setu-sandbox: account ${this.mask(account)} is PENDING (not a known fixture)`,
    );
    return {
      status: 'PENDING',
      providerRef: `setu-sandbox-pending-${Date.now()}`,
    };
  }

  private mask(account: string): string {
    if (account.length <= 4) return account;
    return `${'*'.repeat(account.length - 4)}${account.slice(-4)}`;
  }
}

@Injectable()
export class BankVerifierService {
  constructor(private readonly adapter: BankVerifierAdapter) {}

  get providerName(): string {
    return this.adapter.name;
  }

  isReady(): boolean {
    return this.adapter.isReady();
  }

  async verify(req: BankVerifyRequest): Promise<BankVerifyResult> {
    return this.adapter.verify(req);
  }
}
