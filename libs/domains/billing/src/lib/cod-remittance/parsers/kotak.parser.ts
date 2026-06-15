/**
 * SS-033 — Kotak Mahindra bank statement parser.
 *
 * Default Kotak CSV export:
 *
 *   Date,Particulars,Cheque No.,Debit,Credit,Balance
 *   01/04/2024,NEFT-DELHIVERY-COD,DRL042,0,12345.00,50000.00
 *
 * Almost identical to Axis; the only difference is the date column
 * header is just "Date" and the narration column is "Particulars".
 */
import {
  BankStatementAdapter,
  BankTransaction,
  ColumnMapping,
  parseCsvStatement,
} from '../cod-bank-statement-parser';

export class KotakStatementParser implements BankStatementAdapter {
  readonly bankName = 'KOTAK';

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
        debit: 'Debit',
        credit: 'Credit',
        ref: 'Cheque No.',
        narration: 'Particulars',
        dateFormat: 'DD/MM/YYYY',
        creditsOnly: true,
      },
      this.mapping,
    );
  }
}
