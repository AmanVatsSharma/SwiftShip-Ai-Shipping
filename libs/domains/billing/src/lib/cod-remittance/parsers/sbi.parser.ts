/**
 * SS-033 — SBI bank statement parser.
 *
 * Default SBI CSV export:
 *
 *   Txn Date,Description,Ref No./Cheque No.,Debit,Credit,Balance
 *   01-Apr-2024,BY TRANSFER-NEFT*DELHIVERY,DRL042,0,12345.00,50000.00
 *
 * Note: SBI's portal sometimes emits dates as "01-Apr-2024" (month
 * abbreviation) instead of "01/04/2024". We accept both — see
 * `parseDate` for the full grammar; months-in-letters are handled by
 * falling back to a small month-name map.
 */
import {
  BankStatementAdapter,
  BankTransaction,
  ColumnMapping,
  parseAmount,
  parseCsvStatement,
  parseDate,
} from '../cod-bank-statement-parser';

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export class SbiStatementParser implements BankStatementAdapter {
  readonly bankName = 'SBI';

  private readonly mapping: ColumnMapping;

  constructor(mapping: ColumnMapping = {}) {
    this.mapping = mapping;
  }

  parse(content: string | Buffer): BankTransaction[] {
    const text = typeof content === 'string' ? content : content.toString('utf-8');
    // SBI uses DD-Mon-YYYY (e.g. 01-Apr-2024) for the date column. The
    // generic parseCsvStatement goes through parseDate which doesn't
    // grok "Apr" by itself — we therefore do a single pre-pass that
    // rewrites the date column from "01-Apr-2024" to "01/04/2024"
    // before delegating to the generic parser.
    const normalised = this.normaliseDates(text);
    return parseCsvStatement(
      normalised,
      this.bankName,
      {
        date: 'Txn Date',
        amount: '',
        debit: 'Debit',
        credit: 'Credit',
        ref: 'Ref No./Cheque No.',
        narration: 'Description',
        dateFormat: 'DD/MM/YYYY',
        creditsOnly: true,
      },
      this.mapping,
    );
  }

  /**
   * Rewrite any "DD-Mon-YYYY" cells in the Txn Date column to
   * "DD/MM/YYYY" so the generic parser can handle them. We only touch
   * the first column of each row; everything else is passed through
   * unchanged.
   */
  private normaliseDates(text: string): string {
    return text.replace(
      /^(\s*\d{1,2})-([A-Za-z]{3})-(\d{2,4})/gm,
      (_m, d: string, mon: string, y: string) => {
        const month = MONTHS[mon.toLowerCase()];
        if (month === undefined) return `${d}-${mon}-${y}`;
        const yyyy = y.length === 2 ? `20${y}` : y;
        return `${d.padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${yyyy}`;
      },
    );
  }
}
