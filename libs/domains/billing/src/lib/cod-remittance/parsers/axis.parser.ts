/**
 * SS-033 — Axis bank statement parser.
 *
 * Default Axis CSV export:
 *
 *   Tran Date,Particulars,Chq/Ref,Debit,Credit,Balance
 *   01/04/2024,NEFT CR-DELHIVERY,DRL042,0,12345.00,50000.00
 *
 * Straightforward CSV with debit/credit columns; same shape as HDFC
 * minus the typo-prone "ValueDr/ValueCr" headers.
 */
import {
  BankStatementAdapter,
  BankTransaction,
  ColumnMapping,
  parseCsvStatement,
} from '../cod-bank-statement-parser';

export class AxisStatementParser implements BankStatementAdapter {
  readonly bankName = 'AXIS';

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
        date: 'Tran Date',
        amount: '',
        debit: 'Debit',
        credit: 'Credit',
        ref: 'Chq/Ref',
        narration: 'Particulars',
        dateFormat: 'DD/MM/YYYY',
        creditsOnly: true,
      },
      this.mapping,
    );
  }
}
