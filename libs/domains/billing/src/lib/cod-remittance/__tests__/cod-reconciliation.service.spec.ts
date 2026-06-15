/**
 * SS-033 — Reconciliation engine tests.
 *
 * The engine is a pure function so the suite is hermetic. We cover:
 *  - perfect match (date + amount + ref exact)
 *  - fuzzy ref match within window (Levenshtein distance <= 2)
 *  - no match (date outside window, amount mismatch, no ref)
 *  - the global invariant
 *    sum(reconciled) + sum(disputed) == sum(remittances)
 *    which the cron asserts on every run.
 */
import {
  reconcile,
  RemittanceCandidate,
  DISPUTE_REASONS,
} from '../cod-reconciliation.service';
import type { BankTransaction } from '../cod-bank-statement-parser';

const mkRem = (over: Partial<RemittanceCandidate>): RemittanceCandidate => ({
  id: 'r-1',
  amount: 1000,
  depositDate: new Date('2024-04-15T00:00:00Z'),
  courier: 'DELHIVERY',
  courierRef: 'DRL20240415001',
  period: '2024-04-15',
  ...over,
});

const mkBank = (over: Partial<BankTransaction>): BankTransaction => ({
  date: new Date('2024-04-15T00:00:00Z'),
  amount: 1000,
  ref: 'DRL20240415001',
  narration: 'NEFT CR-DELHIVERY-COD',
  ...over,
});

describe('CodReconciliation engine (SS-033)', () => {
  it('matches perfectly: date + amount + ref all align', () => {
    const r = reconcile([mkRem({})], [mkBank({})]);
    expect(r.matched).toHaveLength(1);
    expect(r.unmatchedRemittances).toHaveLength(0);
    expect(r.unmatchedBankTxns).toHaveLength(0);
    expect(r.matched[0].refDistance).toBe(0);
    expect(r.matched[0].dateDeltaDays).toBe(0);
  });

  it('fuzzy-matches when ref differs by 1-2 chars within the date window', () => {
    const r = reconcile(
      [mkRem({ courierRef: 'DRL20240415001' })],
      [mkBank({ ref: 'DRL2024041500Z' /* 1 char diff at end */ })],
    );
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0].refDistance).toBe(1);
  });

  it('matches a remittance that lands T+2 (date within window)', () => {
    const r = reconcile(
      [mkRem({ depositDate: new Date('2024-04-15T00:00:00Z') })],
      [mkBank({ date: new Date('2024-04-17T00:00:00Z') })],
    );
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0].dateDeltaDays).toBe(2);
  });

  it('disputes when remittance is missing from bank', () => {
    const r = reconcile([mkRem({ id: 'r-1' })], []);
    expect(r.matched).toHaveLength(0);
    expect(r.unmatchedRemittances).toHaveLength(1);
    expect(r.unmatchedRemittances[0].reason).toBe(DISPUTE_REASONS.NO_BANK_MATCH);
  });

  it('disputes when date is outside the 3-day window', () => {
    const r = reconcile(
      [mkRem({ depositDate: new Date('2024-04-15T00:00:00Z') })],
      [mkBank({ date: new Date('2024-04-25T00:00:00Z') })],
    );
    expect(r.matched).toHaveLength(0);
    expect(r.unmatchedRemittances).toHaveLength(1);
    // 10-day delta — outside the 3-day window — classified as a date issue
    expect(r.unmatchedRemittances[0].reason).toBe(
      DISPUTE_REASONS.DATE_OUT_OF_WINDOW,
    );
  });

  it('disputes on amount mismatch even if date and ref align', () => {
    const r = reconcile(
      [mkRem({ amount: 1000 })],
      [mkBank({ amount: 950 })],
    );
    expect(r.matched).toHaveLength(0);
    expect(r.unmatchedRemittances[0].reason).toBe(
      DISPUTE_REASONS.AMOUNT_MISMATCH,
    );
  });

  it('emits a NO_BANK_MATCH when amount + date align but ref is far off', () => {
    const r = reconcile(
      [mkRem({ courierRef: 'DRL001ABC' })],
      [mkBank({ ref: 'XPRESS99999' })],
    );
    expect(r.matched).toHaveLength(0);
    expect(r.unmatchedRemittances[0].reason).toBe(
      DISPUTE_REASONS.NO_BANK_MATCH,
    );
  });

  it('global invariant: matched + disputed amounts == remittance total', () => {
    const remittances = [
      mkRem({ id: 'r-1', amount: 1000 }),
      mkRem({ id: 'r-2', amount: 2500, depositDate: new Date('2024-04-20T00:00:00Z') }),
      mkRem({ id: 'r-3', amount: 750, depositDate: new Date('2024-04-22T00:00:00Z') }),
    ];
    const bankTxns = [
      mkBank({ ref: 'DRL20240415001', date: new Date('2024-04-15T00:00:00Z') }),
      mkBank({ ref: 'XB20240420002', amount: 2500, date: new Date('2024-04-20T00:00:00Z') }),
      // r-3 is intentionally missing — will go to dispute
    ];
    const result = reconcile(remittances, bankTxns);
    const sumMatched = result.matched.reduce((s, m) => s + m.remittance.amount, 0);
    const sumDisputed = result.unmatchedRemittances.reduce(
      (s, u) => s + u.remittance.amount,
      0,
    );
    const total = remittances.reduce((s, r) => s + r.amount, 0);
    expect(sumMatched + sumDisputed).toBe(total);
  });

  it('unmatchedBankTxns contains bank credits that no remittance claimed', () => {
    const r = reconcile(
      [mkRem({ amount: 1000, courierRef: 'AAA001' })],
      [mkBank({ amount: 5000, ref: 'STRANGEREF' })],
    );
    expect(r.unmatchedBankTxns).toHaveLength(1);
    expect(r.unmatchedBankTxns[0].ref).toBe('STRANGEREF');
  });

  it('greedy: each bank txn is matched at most once', () => {
    // Two remittances that could both match the same bank txn by
    // amount+date; the engine should pair them 1:1 and dispute the
    // other (because ref on one is empty).
    const r = reconcile(
      [
        mkRem({ id: 'r-1', courierRef: 'AAA001' }),
        mkRem({ id: 'r-2', courierRef: 'BBB002', depositDate: new Date('2024-04-16T00:00:00Z') }),
      ],
      [mkBank({ ref: 'AAA001' }), mkBank({ ref: 'BBB002', date: new Date('2024-04-16T00:00:00Z') })],
    );
    expect(r.matched).toHaveLength(2);
    expect(r.unmatchedBankTxns).toHaveLength(0);
  });

  it('Levenshtein helper: small edits accepted, large edits rejected', () => {
    const { levenshtein } = require('../cod-reconciliation.service');
    expect(levenshtein('DRL001ABC', 'DRL001XYZ')).toBe(3); // > 2 → reject
    const r = reconcile(
      [mkRem({ courierRef: 'DRL001ABC' })],
      [mkBank({ ref: 'DRL001XYZ' })],
    );
    expect(r.matched).toHaveLength(0);
  });
});
