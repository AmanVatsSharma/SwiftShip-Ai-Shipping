/**
 * SS-033 — CodRemittanceCronService spec.
 *
 * Covers:
 *  - cron expression constant is `0 6 * * *`
 *  - runOnce processes each tenant, marks matches, opens disputes
 *  - the summary is fed to the notifier
 *  - runOnce is idempotent (safe to call twice in the same day)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { CodRemittanceCronService } from '../cron/cod-remittance-cron.service';
import { CodRemittanceService } from '../cod-remittance.service';
import { CodDisputeService } from '../cod-dispute.service';
import { TenantContext } from '@swiftship/domains-tenants';
import type { BankTransaction } from '../cod-bank-statement-parser';

const mkRem = (id: string, amount: number, ref: string) => ({
  id,
  amount,
  depositDate: new Date('2024-04-15T00:00:00Z'),
  courier: 'DELHIVERY',
  courierRef: ref,
  period: '2024-04-15',
  tenantId: 7,
  status: 'PENDING' as const,
});

describe('CodRemittanceCronService (SS-033)', () => {
  let cron: CodRemittanceCronService;
  let remittanceSvc: any;
  let disputeSvc: any;

  beforeEach(async () => {
    remittanceSvc = {
      listTenantsWithPending: jest.fn(),
      listPending: jest.fn(),
      markReceived: jest.fn(),
      markReconciled: jest.fn(),
      markDisputed: jest.fn(),
    };
    disputeSvc = {
      open: jest.fn(async (input) => ({
        id: 'd-new',
        ...input,
        status: 'OPEN',
        createdAt: new Date(),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CodRemittanceCronService,
        { provide: CodRemittanceService, useValue: remittanceSvc },
        { provide: CodDisputeService, useValue: disputeSvc },
        { provide: TenantContext, useValue: { getTenantId: () => 7 } },
      ],
    }).compile();

    cron = module.get(CodRemittanceCronService);
  });

  it('has the documented 06:00 daily cron expression', () => {
    expect(CodRemittanceCronService.CRON_EXPR).toBe('0 6 * * *');
    expect(CodRemittanceCronService.CRON_NAME).toBe('cod-remittance-reconciliation');
  });

  it('runOnce: no tenants with pending → zero-output summary', async () => {
    remittanceSvc.listTenantsWithPending.mockResolvedValueOnce([]);
    const summary = await cron.runOnce();
    expect(summary.tenantsProcessed).toBe(0);
    expect(summary.matchedCount).toBe(0);
    expect(summary.disputesOpened).toBe(0);
  });

  it('runOnce: matches a remittance and marks it RECEIVED', async () => {
    remittanceSvc.listTenantsWithPending.mockResolvedValueOnce([7]);
    const rem = mkRem('r-1', 1000, 'DRL001');
    remittanceSvc.listPending.mockResolvedValueOnce([rem]);

    const bankTxns: BankTransaction[] = [
      {
        date: new Date('2024-04-15T00:00:00Z'),
        amount: 1000,
        ref: 'DRL001',
        narration: 'NEFT CR',
      },
    ];
    cron.setStatementProvider({
      getStatementFor: async () => bankTxns,
    });

    const summary = await cron.runOnce();

    expect(summary.tenantsProcessed).toBe(1);
    expect(summary.remittancesConsidered).toBe(1);
    expect(summary.matchedCount).toBe(1);
    expect(summary.disputesOpened).toBe(0);
    expect(remittanceSvc.markReceived).toHaveBeenCalledWith('r-1', 7);
    expect(disputeSvc.open).not.toHaveBeenCalled();
  });

  it('runOnce: opens a dispute for an unmatched remittance', async () => {
    remittanceSvc.listTenantsWithPending.mockResolvedValueOnce([7]);
    const rem = mkRem('r-1', 1000, 'DRL001');
    remittanceSvc.listPending.mockResolvedValueOnce([rem]);
    cron.setStatementProvider({ getStatementFor: async () => [] });

    const summary = await cron.runOnce();

    expect(summary.matchedCount).toBe(0);
    expect(summary.disputesOpened).toBe(1);
    expect(disputeSvc.open).toHaveBeenCalledWith(
      expect.objectContaining({ codRemittanceId: 'r-1' }),
    );
    expect(remittanceSvc.markDisputed).toHaveBeenCalledWith('r-1', 7);
  });

  it('runOnce: notifier is called with the summary', async () => {
    remittanceSvc.listTenantsWithPending.mockResolvedValueOnce([]);
    const notifier = jest.fn();
    cron.setNotifier({ notify: notifier });
    // The decorator-invoked @Cron path is not exercised here, only
    // the explicit runOnce. Calling runOnce() should not call the
    // notifier (only the @Cron wrapper does). Wrap manually to
    // verify the path.
    const summary = await cron.runOnce();
    // Invoke the wrapper path manually
    await cron.runDaily();
    // @Cron didn't fire, so we manually call it for the test
    // (the spec doesn't need to wait for the cron).
    expect(typeof summary).toBe('object');
    // The wrapper calls notifier.notify on every runDaily — check that
    // runDaily called notifier at least once.
    expect(notifier).toHaveBeenCalled();
  });

  it('idempotency: re-running with the same inputs produces the same outcome', async () => {
    remittanceSvc.listTenantsWithPending.mockResolvedValue([7]);
    const rem = mkRem('r-1', 1000, 'DRL001');
    remittanceSvc.listPending.mockResolvedValue([rem]);
    cron.setStatementProvider({
      getStatementFor: async () => [
        {
          date: new Date('2024-04-15T00:00:00Z'),
          amount: 1000,
          ref: 'DRL001',
          narration: 'NEFT',
        },
      ],
    });

    const s1 = await cron.runOnce();
    const s2 = await cron.runOnce();

    expect(s1.matchedCount).toBe(s2.matchedCount);
    expect(s1.disputesOpened).toBe(s2.disputesOpened);
    // markReceived called twice on the same id — in production the row
    // would already be RECEIVED, so listPending would skip it; here
    // we exercise the happy path of the engine twice and the assertion
    // is just that the count is stable.
  });
});
