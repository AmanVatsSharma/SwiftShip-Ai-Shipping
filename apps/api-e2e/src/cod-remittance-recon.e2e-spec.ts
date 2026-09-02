/**
 * E2E — COD remittance + bank reconciliation leg.
 *
 * Integration-style (deliberately): the reconciliation engine has no
 * GraphQL surface yet (SS-033 — "admin portal mutations come in a
 * follow-up bead"), so this spec drives the real services from the app's
 * DI container: seeded `bank_cod_remittances` rows + a synthetic HDFC CSV
 * parsed by the production parser → CodRemittanceCronService
 * .reconcileForTenant() → assert matched/disputed rows + the money
 * invariant documented on the engine.
 *
 * ENVIRONMENT NEEDS: Postgres + Redis (see support/e2e-harness.ts).
 * EXECUTED LOCALLY: NO — Docker unavailable; CI-runnable via
 *   npx nx run api-e2e:e2e --testFile=cod-remittance-recon.e2e-spec.ts
 */
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  BankCodDisputeEntity,
  BankCodRemittanceEntity,
} from '@swiftship/platform-typeorm';
import { CodRemittanceCronService } from '@swiftship/domains-billing';
import { HdfcStatementParser } from '../../../libs/domains/billing/src/lib/cod-remittance/parsers/hdfc.parser';
import {
  createE2eApp,
  scopedTenantResolver,
  setupTenantStack,
  truncateAll,
} from './support/e2e-harness';

/** Same shape as the real HDFC export (see parsers/hdfc.parser.ts header). */
const HDFC_CSV = `Date,Narration,Chq/Ref,ValueDr,ValueCr,ClosingBalance
02/04/2024,NEFT-DELHIVERY-COD/DRL042,DRL042,0,12345.00,50000.00
03/04/2024,NEFT-UNKNOWN-COD,ZZZ999,0,777.00,50777.00`;

describe('COD remittance reconciliation: match + dispute + invariant (e2e)', () => {
  let app: INestApplication;
  let tenantId: number;
  let cron: CodRemittanceCronService;

  beforeAll(async () => {
    app = await createE2eApp();
    await truncateAll(app);
    const stack = await setupTenantStack(app, 'codrecon');
    tenantId = stack.tenantId;

    const ds = app.get(DataSource);
    const repo = ds.getRepository(BankCodRemittanceEntity);
    // 1) should MATCH the DRL042 bank credit (same amount, +1 day, same ref)
    await repo.save(
      repo.create({
        tenantId,
        courier: 'DELHIVERY',
        period: '2024-04-W1',
        amount: 12345,
        depositDate: new Date('2024-04-01T00:00:00Z'),
        courierRef: 'DRL042',
        status: 'PENDING',
      }),
    );
    // 2) no bank counterpart (amount nowhere near any credit) → DISPUTE
    await repo.save(
      repo.create({
        tenantId,
        courier: 'XPRESSBEES',
        period: '2024-04-W1',
        amount: 99999,
        depositDate: new Date('2024-04-02T00:00:00Z'),
        courierRef: 'XB9921',
        status: 'PENDING',
      }),
    );

    // Request-scoped resolve (the cron pulls TenantContext for dispute rows)
    const resolve = scopedTenantResolver(app, tenantId);
    cron = await resolve(CodRemittanceCronService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('parses the synthetic HDFC statement via the production parser', () => {
    const txns = new HdfcStatementParser().parse(HDFC_CSV);
    expect(txns).toHaveLength(2);
    expect(txns[0]).toMatchObject({
      amount: 12345,
      ref: 'DRL042',
      narration: 'NEFT-DELHIVERY-COD/DRL042',
    });
    expect(txns[1]).toMatchObject({ amount: 777, ref: 'ZZZ999' });
  });

  it('reconciles: one match, one dispute, one stray bank credit', async () => {
    const ds = app.get(DataSource);
    const rows = await ds
      .getRepository(BankCodRemittanceEntity)
      .find({ where: { tenantId } });
    expect(rows).toHaveLength(2);

    const bankTxns = new HdfcStatementParser().parse(HDFC_CSV);
    const result = await cron.reconcileForTenant(tenantId, rows, bankTxns);

    // -- matched: DELHIVERY/DRL042 against the 12345.00 credit
    expect(result.matched.length).toBe(1);
    expect(result.matched[0].remittance.courierRef).toBe('DRL042');
    expect(result.matched[0].bankTxn.ref).toBe('DRL042');

    // -- disputed: XPRESSBEES 99999 has no bank counterpart
    expect(result.unmatchedRemittances).toHaveLength(1);
    expect(result.unmatchedRemittances[0].remittance.courier).toBe('XPRESSBEES');
    expect(result.unmatchedRemittances[0].reason).toBeTruthy();

    // -- stray credit: ZZZ999/777 arrived but belongs to no remittance
    expect(result.unmatchedBankTxns.map((t) => t.ref)).toEqual(['ZZZ999']);

    // -- the documented money invariant:
    //    matched + disputed == every remittance considered
    const considered = [...result.matched.map((m) => m.remittance.amount),
      ...result.unmatchedRemittances.map((u) => u.remittance.amount)];
    expect(considered.reduce((a, b) => a + b, 0)).toBe(12345 + 99999);
  });

  it('persists statuses + opens a dispute row (idempotent on re-run)', async () => {
    const ds = app.get(DataSource);
    const repo = ds.getRepository(BankCodRemittanceEntity);
    const statuses = Object.fromEntries(
      (await repo.find({ where: { tenantId } })).map((r) => [
        r.courierRef,
        r.status,
      ]),
    );
    expect(statuses['DRL042']).toBe('RECEIVED');
    expect(statuses['XB9921']).toBe('DISPUTED');

    const disputes = await ds
      .getRepository(BankCodDisputeEntity)
      .find({ where: { tenantId } });
    expect(disputes).toHaveLength(1);
    expect(disputes[0].status).toBe('OPEN');

    // Re-running the same statement must not duplicate disputes.
    const rows = await repo.find({ where: { tenantId } });
    const result = await cron.reconcileForTenant(
      tenantId,
      rows,
      new HdfcStatementParser().parse(HDFC_CSV),
    );
    expect(result.matched).toHaveLength(1);
    expect(result.unmatchedRemittances).toHaveLength(1);
    const disputesAfter = await ds
      .getRepository(BankCodDisputeEntity)
      .find({ where: { tenantId } });
    expect(disputesAfter).toHaveLength(1);
  });
});
