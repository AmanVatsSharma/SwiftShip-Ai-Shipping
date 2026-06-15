/**
 * SS-033 — HDFC bank statement parser.
 *
 * Default HDFC CSV export:
 *
 *   Date,Narration,Chq/Ref,ValueDr,ValueCr,ClosingBalance
 *   01/04/2024,NEFT-DELHIVERY-COD/DRL042,UDR1245,0,12345.00,50000.00
 *   02/04/2024,NEFT-XPRESSBEES-COD,XB9921,0,8765.50,58765.50
 *
 * `ValueDr` (debit) and `ValueCr` (credit) are separate columns. We
 * normalize to a single signed amount = credit - debit. We also filter
 * out debit-only rows because we only care about money coming in
 * (COD remittances are credits to our account).
 *
 * `columnMapping` lets ops override the column names if HDFC ships a
 * new variant (e.g. "TxnDate" instead of "Date") without a code change.
 */
import {
  BankStatementAdapter,
  BankTransaction,
  ColumnMapping,
  parseCsvStatement,
} from '../cod-bank-statement-parser';

export class HdfcStatementParser implements BankStatementAdapter {
  readonly bankName = 'HDFC';

  private readonly mapping: ColumnMapping;

  constructor(mapping: ColumnMapping = {}) {
    this.mapping = mapping;
  }

  parse(content: string | Buffer): BankTransaction[] {
    const text = typeof content === 'string' ? content : content.toString('utf-8');
    return parseCsvStatement(
      text,
      this.bankName,
      {
        date: 'Date',
        amount: '',
        debit: 'ValueDr',
        credit: 'ValueCr',
        ref: 'Chq/Ref',
        narration: 'Narration',
        dateFormat: 'DD/MM/YYYY',
        creditsOnly: true,
      },
      this.mapping,
    );
  }
}
