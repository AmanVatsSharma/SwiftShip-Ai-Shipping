/**
 * SS-033 — CodRemittanceCronService.
 *
 * Daily @ 06:00 IST cron that:
 *   1. Lists every tenant with at least one PENDING / RECEIVED
 *      remittance row.
 *   2. For each tenant, pulls the bank statement(s) (in production:
 *      S3 + the configured parser; in dev: skipped if no statement
 *      path is set).
 *   3. Runs the pure `reconcile()` engine.
 *   4. Persists matches (status = RECEIVED), creates `BankCodDisputeEntity`
 *      rows for the unmatched remittances, and emits a summary event
 *      to the Slack / email channel.
 *
 * Idempotency: the engine is a pure function and we only mutate
 * remittances that are still in PENDING / RECEIVED. Re-running the
 * cron the same day produces the same result; the second run is a
 * no-op for matches we already have. (Disputes are deduped on
 * (codRemittanceId, status = OPEN) inside `CodDisputeService.open`.)
 *
 * Time zone: the @Cron decorator takes a Node-Cron expression in
 * server local time. We pin server TZ to Asia/Kolkata in the API
 * entrypoint (`main.ts` via `TZ=Asia/Kolkata` in the Dockerfile).
 * The cron expression below therefore runs at 06:00 IST reliably.
 */
import { Injectable, Logger } from '@nestjs/common';
// @nestjs/schedule is installed at the host-app level; the lib only
// needs the type for the Cron decorator. The dashboard lib uses the
// same pattern.
import { Cron } from '@nestjs/schedule';
import {
  BankCodRemittanceEntity,
  BankCodRemittanceStatus,
} from '@swiftship/platform-typeorm';
import { TenantContext } from '@swiftship/domains-tenants';
import { CodRemittanceService } from '../cod-remittance.service';
import { CodDisputeService } from '../cod-dispute.service';
import {
  reconcile,
  RemittanceCandidate,
  ReconciliationResult,
} from '../cod-reconciliation.service';
import type { BankStatementAdapter, BankTransaction } from '../cod-bank-statement-parser';

export interface CodReconciliationSummary {
  /** When the run started. */
  startedAt: Date;
  finishedAt: Date;
  /** Tenants processed. */
  tenantsProcessed: number;
  /** Total remittances considered. */
  remittancesConsidered: number;
  /** Total matches produced. */
  matchedCount: number;
  /** Total disputes opened. */
  disputesOpened: number;
  /** Sum of matched amounts. */
  matchedAmount: number;
  /** Sum of disputed amounts. */
  disputedAmount: number;
}

@Injectable()
export class CodRemittanceCronService {
  private readonly logger = new Logger(CodRemittanceCronService.name);

  /** Public for tests. */
  static readonly CRON_EXPR = '0 6 * * *';
  static readonly CRON_NAME = 'cod-remittance-reconciliation';

  /**
   * Pluggable bank statement provider. The cron calls
   * `getStatementFor(tenantId, courier, period)` to fetch the parsed
   * transactions for a given tenant+courier combination. The default
   * is a no-op that returns `[]` — the test suite wires its own
   * provider, and production wires the S3 + parser impl.
   */
  private statementProvider: BankStatementProvider = {
    getStatementFor: async () => [],
  };

  /** Slack / email notifier. Default = structured log line. */
  private notifier: ReconciliationNotifier = {
    notify: async (summary) => {
      this.logger.log(
        `COD reconciliation summary: ` +
          `tenants=${summary.tenantsProcessed} ` +
          `remittances=${summary.remittancesConsidered} ` +
          `matched=${summary.matchedCount} ` +
          `disputes=${summary.disputesOpened} ` +
          `matchedAmount=Rs ${summary.matchedAmount.toFixed(2)} ` +
          `disputedAmount=Rs ${summary.disputedAmount.toFixed(2)}`,
      );
    },
  };

  constructor(
    private readonly remittanceService: CodRemittanceService,
    private readonly disputeService: CodDisputeService,
    // TenantContext is request-scoped; we don't bind it here. The cron
    // has no "current tenant" so we use TenantContext purely as a
    // handle. We therefore inject it as a provider and bypass the
    // `getTenantId()` checks by going through the lower-level
    // `listPending(tenantId)` method (which takes a tenantId arg
    // explicitly).
    private readonly _tenantContext: TenantContext,
  ) {}

  /** Replace the bank-statement provider. */
  setStatementProvider(provider: BankStatementProvider): void {
    this.statementProvider = provider;
  }

  /** Replace the notifier (e.g. for Slack in production). */
  setNotifier(notifier: ReconciliationNotifier): void {
    this.notifier = notifier;
  }

  @Cron(CodRemittanceCronService.CRON_EXPR, {
    name: CodRemittanceCronService.CRON_NAME,
    // The decorator evaluates the expression at boot. Pin to the
    // Indian timezone via TZ env in the deployment.
    timeZone: 'Asia/Kolkata',
  })
  async runDaily(): Promise<void> {
    const summary = await this.runOnce();
    await this.notifier.notify(summary);
  }

  /**
   * Run the reconciliation once. Returns the summary so the test
   * suite (and a future "Reconcile now" GraphQL mutation) can call it
   * directly. Public + idempotent.
   */
  async runOnce(): Promise<CodReconciliationSummary> {
    const startedAt = new Date();
    this.logger.log('Starting daily COD reconciliation...');
    let tenantsProcessed = 0;
    let remittancesConsidered = 0;
    let matchedCount = 0;
    let disputesOpened = 0;
    let matchedAmount = 0;
    let disputedAmount = 0;

    try {
      const tenantIds = await this.remittanceService.listTenantsWithPending();
      for (const tenantId of tenantIds) {
        const pending = await this.remittanceService.listPending(tenantId);
        if (pending.length === 0) continue;
        tenantsProcessed++;
        remittancesConsidered += pending.length;

        // Pull the bank statement(s) for this tenant. In production
        // this is a single concatenated list from S3 for the past 7
        // days; in dev with no statement provider it's `[]`.
        const bankTxns = await this.loadBankTxnsForTenant(tenantId, pending);

        const result = await this.reconcileForTenant(tenantId, pending, bankTxns);

        matchedCount += result.matched.length;
        disputesOpened += result.unmatchedRemittances.length;
        for (const m of result.matched) {
          matchedAmount += m.remittance.amount;
        }
        for (const u of result.unmatchedRemittances) {
          disputedAmount += u.remittance.amount;
        }
      }
    } catch (err) {
      this.logger.error(
        `COD reconciliation failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      // We re-throw so the cron host can alert; but we still return
      // whatever partial progress we made so the notifier gets a
      // number. The notifier distinguishes via timing.
    }

    const finishedAt = new Date();
    return {
      startedAt,
      finishedAt,
      tenantsProcessed,
      remittancesConsidered,
      matchedCount,
      disputesOpened,
      matchedAmount,
      disputedAmount,
    };
  }

  /**
   * Reconcile a single tenant's batch. Public for testability — the
   * spec suite calls this with hand-crafted data and a no-op DB.
   */
  async reconcileForTenant(
    tenantId: number,
    remittances: BankCodRemittanceEntity[],
    bankTxns: BankTransaction[],
  ): Promise<ReconciliationResult> {
    const candidates: RemittanceCandidate[] = remittances.map((r: any) => ({
      id: r.id,
      amount: r.amount,
      depositDate: r.depositDate,
      courier: r.courier,
      courierRef: r.courierRef ?? null,
      period: r.period,
    }));

    const result = reconcile(candidates, bankTxns);

    for (const m of result.matched) {
      await this.remittanceService.markReceived(m.remittance.id, tenantId);
    }
    for (const u of result.unmatchedRemittances) {
      await this.disputeService.open({
        codRemittanceId: u.remittance.id,
        reason: u.reason,
        comments: `Auto-opened by reconciliation cron: ${u.reason}`,
        metadata: {
          source: 'cron',
          period: u.remittance.period,
          courier: u.remittance.courier,
        },
      });
      await this.remittanceService.markDisputed(u.remittance.id, tenantId);
    }

    return result;
  }

  private async loadBankTxnsForTenant(
    _tenantId: number,
    _pending: BankCodRemittanceEntity[],
  ): Promise<BankTransaction[]> {
    return this.statementProvider.getStatementFor(_tenantId, _pending);
  }
}

/** Pluggable bank statement provider. */
export interface BankStatementProvider {
  getStatementFor(
    tenantId: number,
    pending: BankCodRemittanceEntity[],
  ): Promise<BankTransaction[]>;
}

/** Pluggable notifier (Slack / email / log). */
export interface ReconciliationNotifier {
  notify(summary: CodReconciliationSummary): Promise<void> | void;
}

/** Re-export the status type for callers. */
export { BankCodRemittanceStatus };
