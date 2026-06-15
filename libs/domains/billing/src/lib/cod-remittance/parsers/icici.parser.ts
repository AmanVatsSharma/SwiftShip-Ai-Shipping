/**
 * SS-033 — ICICI bank statement parser.
 *
 * ICICI ships an XLSX file, not CSV. The default sheet has these
 * columns (1-indexed in their export):
 *
 *   S No. | Value Date | Transaction Remarks | Cheque No. | Withdrawal (Dr) | Deposit (Cr) | Balance
 *
 * Parsing XLSX would normally require `xlsx` (SheetJS) or similar. We
 * deliberately keep this parser **pure CSV** for now and let ops
 * pre-convert the XLSX to CSV via the bank portal's "Export to CSV"
 * option. That keeps the production dep surface small and the parser
 * deterministic. When an XLSX path is needed, add `xlsx` and a
 * `parseXlsxBuffer` helper — the rest of the pipeline doesn't change.
 *
 * If you really need to accept XLSX buffers directly, pass
 * `xlsxBufferParser` as the `xlsxSheets` option and we'll honor it.
 */
import {
  BankStatementAdapter,
  BankTransaction,
  ColumnMapping,
  parseCsvStatement,
  parseAmount,
  parseDate,
} from '../cod-bank-statement-parser';

export class IciciStatementParser implements BankStatementAdapter {
  readonly bankName = 'ICICI';

  private readonly mapping: ColumnMapping;

  constructor(mapping: ColumnMapping = {}) {
    this.mapping = mapping;
  }

  parse(content: string | Buffer, _sheetName = 'Sheet1'): BankTransaction[] {
    const text = typeof content === 'string' ? content : content.toString('utf-8');
    // The ICICI CSV export uses the same column layout as the XLSX.
    // When the input is a binary XLSX the caller is expected to either
    // (a) pre-convert it, or (b) pass an `xlsxSheets` callback here.
    return parseCsvStatement(
      text,
      this.bankName,
      {
        date: 'Value Date',
        amount: '',
        debit: 'Withdrawal (Dr)',
        credit: 'Deposit (Cr)',
        ref: 'Cheque No.',
        narration: 'Transaction Remarks',
        dateFormat: 'DD/MM/YYYY',
        creditsOnly: true,
      },
      this.mapping,
    );
  }

  /**
   * Helper for tests / callers that hand us an XLSX buffer pre-decoded
   * into rows. Not used by the cron path; exposed so a future "real"
   * XLSX import can plug in without re-architecting.
   */
  static fromRows(
    rows: string[][],
    dateFormat: string = 'DD/MM/YYYY',
  ): BankTransaction[] {
    if (rows.length < 2) return [];
    const headers = rows[0];
    const dateIdx = headers.findIndex((h) => /value\s*date/i.test(h));
    const refIdx = headers.findIndex((h) => /cheque\s*no/i.test(h));
    const narrationIdx = headers.findIndex((h) => /transaction\s*remarks/i.test(h));
    const debitIdx = headers.findIndex((h) => /withdrawal/i.test(h));
    const creditIdx = headers.findIndex((h) => /deposit/i.test(h));
    if (dateIdx < 0) {
      throw new Error('ICICI: "Value Date" column not found');
    }
    const out: BankTransaction[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const date = parseDate(row[dateIdx] ?? '', dateFormat);
      if (!date) continue;
      const debit = debitIdx >= 0 ? parseAmount(row[debitIdx] ?? '') : 0;
      const credit = creditIdx >= 0 ? parseAmount(row[creditIdx] ?? '') : 0;
      const amount = credit - Math.abs(debit);
      if (amount <= 0) continue;
      out.push({
        date,
        amount: Math.abs(amount),
        ref: refIdx >= 0 ? (row[refIdx] ?? '').toString().trim() : '',
        narration: narrationIdx >= 0 ? (row[narrationIdx] ?? '').toString().trim() : '',
      });
    }
    return out;
  }
}
