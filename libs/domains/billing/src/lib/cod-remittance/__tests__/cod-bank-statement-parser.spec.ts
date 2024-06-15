/**
 * SS-033 — Bank statement parser tests.
 *
 * Covers the HDFC and ICICI parsers as golden fixtures. The other
 * three (SBI / Axis / Kotak) use the same `parseCsvStatement` core
 * with different defaults, so a single regression in the core breaks
 * them all — we don't need to duplicate the full matrix here.
 *
 * The fixtures are deliberately small (3-4 rows) and self-contained.
 * Real statements from HDFC / ICICI include 50+ columns we don't
 * care about; the `findColumn` lookup is by name so the test data
 * uses the real headers from the bank portal.
 */
import { HdfcStatementParser } from '../parsers/hdfc.parser';
import { IciciStatementParser } from '../parsers/icici.parser';
import { SbiStatementParser } from '../parsers/sbi.parser';
import { AxisStatementParser } from '../parsers/axis.parser';
import { KotakStatementParser } from '../parsers/kotak.parser';
import {
  parseAmount,
  parseDate,
  tokenizeCsv,
} from '../cod-bank-statement-parser';
import { levenshtein } from '../cod-reconciliation.service';

const HDFC_FIXTURE = [
  'Date,Narration,Chq/Ref,ValueDr,ValueCr,ClosingBalance',
  '01/04/2024,NEFT CR-DELHIVERY-COD REMITTANCE,DRL20240401001,0,12345.00,50000.00',
  '02/04/2024,NEFT CR-XPRESSBEES-COD REMITTANCE,XB20240402002,0,8765.50,58765.50',
  '03/04/2024,POS PURCHASE AMAZON,0,1500.00,0,57265.50', // debit, filtered
  '04/04/2024,IMPS CR-ECOM EXPRESS,ECOM20240404003,0,4321.00,61586.50',
].join('\n');

const ICICI_FIXTURE = [
  'S No.,Value Date,Transaction Remarks,Cheque No.,Withdrawal (Dr),Deposit (Cr),Balance',
  '1,01/04/2024,NEFT-DELHIVERY-COD,DRL20240401001,0,12345.00,50000.00',
  '2,02/04/2024,NEFT-XPRESSBEES-COD,XB20240402002,0,8765.50,58765.50',
  '3,03/04/2024,ATM WDL,,5000.00,0,53765.50', // debit, filtered
].join('\n');

const SBI_FIXTURE = [
  'Txn Date,Description,Ref No./Cheque No.,Debit,Credit,Balance',
  '01-Apr-2024,BY TRANSFER-NEFT*DELHIVERY,DRL20240401001,0,12345.00,50000.00',
  '02-Apr-2024,BY TRANSFER-NEFT*XPRESSBEES,XB20240402002,0,8765.50,58765.50',
].join('\n');

const AXIS_FIXTURE = [
  'Tran Date,Particulars,Chq/Ref,Debit,Credit,Balance',
  '01/04/2024,NEFT CR-DELHIVERY-COD,DRL20240401001,0,12345.00,50000.00',
].join('\n');

const KOTAK_FIXTURE = [
  'Date,Particulars,Cheque No.,Debit,Credit,Balance',
  '01/04/2024,NEFT-DELHIVERY-COD,DRL20240401001,0,12345.00,50000.00',
].join('\n');

describe('BankStatement parsers (SS-033)', () => {
  describe('HdfcStatementParser', () => {
    it('parses HDFC CSV: 3 credits, 1 debit filtered out', () => {
      const txs = new HdfcStatementParser().parse(HDFC_FIXTURE);
      expect(txs).toHaveLength(3);
      expect(txs[0].amount).toBe(12345.0);
      expect(txs[0].ref).toBe('DRL20240401001');
      expect(txs[0].narration).toContain('DELHIVERY');
      expect(txs[0].date.toISOString().startsWith('2024-04-01')).toBe(true);
    });
  });

  describe('IciciStatementParser', () => {
    it('parses ICICI CSV (XLSX pre-converted): 2 credits, 1 debit filtered', () => {
      const txs = new IciciStatementParser().parse(ICICI_FIXTURE);
      expect(txs).toHaveLength(2);
      expect(txs[0].amount).toBe(12345.0);
      expect(txs[1].amount).toBe(8765.5);
    });
  });

  describe('SbiStatementParser', () => {
    it('rewrites DD-Mon-YYYY dates and parses credits', () => {
      const txs = new SbiStatementParser().parse(SBI_FIXTURE);
      expect(txs).toHaveLength(2);
      expect(txs[0].date.toISOString().startsWith('2024-04-01')).toBe(true);
      expect(txs[1].date.toISOString().startsWith('2024-04-02')).toBe(true);
      expect(txs[0].amount).toBe(12345.0);
    });
  });

  describe('AxisStatementParser', () => {
    it('parses Axis CSV with Debit/Credit columns', () => {
      const txs = new AxisStatementParser().parse(AXIS_FIXTURE);
      expect(txs).toHaveLength(1);
      expect(txs[0].amount).toBe(12345.0);
      expect(txs[0].ref).toBe('DRL20240401001');
    });
  });

  describe('KotakStatementParser', () => {
    it('parses Kotak CSV with Date/Particulars columns', () => {
      const txs = new KotakStatementParser().parse(KOTAK_FIXTURE);
      expect(txs).toHaveLength(1);
      expect(txs[0].amount).toBe(12345.0);
      expect(txs[0].ref).toBe('DRL20240401001');
    });
  });

  describe('overridable column mapping', () => {
    it('HDFC parser accepts a custom narration column', () => {
      const customFixture = [
        'Date,Chq/Ref,ValueDr,ValueCr,ClosingBalance,CustomDesc',
        '01/04/2024,DRL1,0,12345.00,50000.00,COD DEP DELHIVERY',
      ].join('\n');
      const txs = new HdfcStatementParser({ narration: 'CustomDesc' }).parse(
        customFixture,
      );
      expect(txs[0].narration).toBe('COD DEP DELHIVERY');
    });
  });

  describe('helpers', () => {
    it('parseDate handles DD/MM/YYYY', () => {
      const d = parseDate('15/04/2024');
      expect(d!.toISOString().startsWith('2024-04-15')).toBe(true);
    });

    it('parseDate handles YYYY-MM-DD', () => {
      const d = parseDate('2024-04-15', 'YYYY-MM-DD');
      expect(d!.toISOString().startsWith('2024-04-15')).toBe(true);
    });

    it('parseDate returns null on garbage', () => {
      expect(parseDate('not-a-date')).toBeNull();
    });

    it('parseAmount handles Indian lakh formatting and parens', () => {
      expect(parseAmount('1,23,456.78')).toBeCloseTo(123456.78, 2);
      expect(parseAmount('(2,500.00)')).toBe(-2500);
      expect(parseAmount('1,500.50')).toBeCloseTo(1500.5, 2);
      expect(parseAmount('')).toBe(0);
    });

    it('tokenizeCsv handles quoted commas', () => {
      const rows = tokenizeCsv('a,b\n"x,y",z\n');
      expect(rows).toEqual([
        ['a', 'b'],
        ['x,y', 'z'],
      ]);
    });

    it('levenshtein computes edit distance', () => {
      expect(levenshtein('kitten', 'sitting')).toBe(3);
      expect(levenshtein('DRL001', 'DRL002')).toBe(1);
      expect(levenshtein('', 'abc')).toBe(3);
      expect(levenshtein('abc', 'abc')).toBe(0);
    });
  });
});
