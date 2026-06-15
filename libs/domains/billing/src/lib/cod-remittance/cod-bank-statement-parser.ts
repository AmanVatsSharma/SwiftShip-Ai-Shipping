/**
 * SS-033 — Bank statement parsers.
 *
 * Each Indian bank ships its own CSV / XLS export format, and the column
 * names + order change without notice. We isolate that mess behind a
 * small interface so the reconciliation engine can be bank-agnostic.
 *
 * Parsers must be **deterministic and I/O-free** — they take a raw
 * string buffer, return `BankTransaction[]`, and never touch the
 * filesystem, the network, or `Date.now()`. That makes them trivially
 * testable with golden fixtures.
 *
 * `columnMapping` lets ops re-point the parser to a renamed column
 * without a code change (delivered as a JSON config in env or DB).
 *
 * ## Indian formats we currently handle
 *
 * - HDFC  : CSV with `Date, Narration, Chq/Ref, ValueDr, ValueCr, ClosingBalance`
 * - ICICI : XLSX with `S No., Value Date, Transaction Remarks, Cheque No., Withdrawal, Deposit, Balance`
 * - SBI   : CSV with `Txn Date, Description, Ref No./Cheque No., Debit, Credit, Balance`
 * - Axis  : CSV with `Tran Date, Particulars, Chq/Ref, Debit, Credit, Balance`
 * - Kotak : CSV with `Date, Particulars, Cheque No., Debit, Credit, Balance`
 *
 * Formats drift; the column-mapping constructor argument is the
 * long-term escape hatch.
 */

/** Normalized bank transaction — what the reconciliation engine speaks. */
export interface BankTransaction {
  /** Transaction date as a `Date` at midnight UTC. */
  date: Date;
  /** Positive = credit, negative = debit. Always INR. */
  amount: number;
  /** Bank's reference for the transaction (cheque no, UTR, ref id). */
  ref: string;
  /** Free-form narration / description. */
  narration: string;
}

/** Column mapping — overrides defaults in the parser's constructor. */
export interface ColumnMapping {
  date?: string;
  amount?: string;
  debit?: string;
  credit?: string;
  ref?: string;
  narration?: string;
  /** Date format string, e.g. "DD/MM/YYYY" (default), "DD-MM-YYYY", "YYYY-MM-DD". */
  dateFormat?: string;
  /** If true, parser will use only credits (filter out debits). Default true. */
  creditsOnly?: boolean;
}

/** Common interface every bank parser implements. */
export interface BankStatementAdapter {
  /** Bank name for logs/UI. */
  readonly bankName: string;

  /**
   * Parse a raw file buffer into normalized transactions.
   * @param content UTF-8 text or XLSX buffer
   * @param sheetName XLSX sheet name (CSV parsers ignore this)
   */
  parse(content: string | Buffer, sheetName?: string): BankTransaction[];
}

/** Default tolerance for "missing" amount columns. */
const CREDIT_ONLY_DEFAULT = true;

/**
 * Parse a date string using the supplied format. Supports:
 *  - "DD/MM/YYYY"
 *  - "DD-MM-YYYY"
 *  - "DD.MM.YYYY"
 *  - "YYYY-MM-DD"
 *  - "MM/DD/YYYY"  (US — accepted as a fallback)
 *
 * Returns `null` if the string doesn't match. We intentionally do NOT
 * use a heavy `date-fns`/`moment` dep here; the date grammar is small.
 */
export function parseDate(raw: string, format = 'DD/MM/YYYY'): Date | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/['"]/g, '');
  let day: number;
  let month: number;
  let year: number;
  if (format === 'YYYY-MM-DD') {
    const m = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    year = parseInt(m[1], 10);
    month = parseInt(m[2], 10) - 1;
    day = parseInt(m[3], 10);
  } else if (format === 'MM/DD/YYYY') {
    const m = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!m) return null;
    month = parseInt(m[1], 10) - 1;
    day = parseInt(m[2], 10);
    year = parseInt(m[3], 10);
  } else {
    // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
    const sep = format.includes('/') ? '/' : format.includes('-') ? '-' : '.';
    const m = cleaned.split(sep);
    if (m.length !== 3) return null;
    day = parseInt(m[0], 10);
    month = parseInt(m[1], 10) - 1;
    year = parseInt(m[2], 10);
  }
  if (year < 100) year += 2000;
  if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) return null;
  if (month < 0 || month > 11) return null;
  if (day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month, day));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * Generic CSV row tokenizer. Handles quoted fields, escaped quotes,
 * and CRLF line endings. Returns one row per line (no header).
 */
export function tokenizeCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        field = '';
        // Skip empty lines
        if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
          rows.push(row);
        }
        row = [];
      } else {
        field += c;
      }
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Coerce a numeric string like "1,23,456.78" or "(2,500.00)" to a number.
 * Indian number formatting uses lakh separators (commas) and parens for
 * negative numbers.
 */
export function parseAmount(raw: string): number {
  if (!raw) return 0;
  let s = raw.trim();
  if (!s) return 0;
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.substring(1, s.length - 1);
  }
  if (s.startsWith('-')) {
    negative = true;
    s = s.substring(1);
  }
  // Strip currency symbols and thousand separators.
  s = s.replace(/[₹$€£,\s]/g, '');
  if (s === '' || s === '-') return 0;
  const n = parseFloat(s);
  if (Number.isNaN(n)) return 0;
  return negative ? -n : n;
}

/**
 * Look up a column by name from a header row. Returns -1 if missing
 * (callers can short-circuit and report a config error). Match is
 * case-insensitive and trims whitespace.
 */
export function findColumn(
  headers: string[],
  candidates: string[],
): number {
  const lc = headers.map((h) => (h || '').toString().trim().toLowerCase());
  for (const cand of candidates) {
    const idx = lc.indexOf(cand.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * Parse a single CSV table against a column mapping. Shared core for
 * HDFC / SBI / Axis / Kotak (the four CSV exporters).
 */
export function parseCsvStatement(
  content: string,
  bankName: string,
  defaults: Required<Pick<ColumnMapping, 'date' | 'amount' | 'debit' | 'credit' | 'ref' | 'narration' | 'dateFormat' | 'creditsOnly'>>,
  overrides: ColumnMapping = {},
): BankTransaction[] {
  const rows = tokenizeCsv(content);
  if (rows.length < 2) return [];

  const headers = rows[0];
  const map: Required<ColumnMapping> = {
    ...defaults,
    ...overrides,
  };

  const dateIdx = findColumn(headers, [map.date, map.dateFormat ? map.date : '']);
  const refIdx = findColumn(headers, [map.ref]);
  const narrationIdx = findColumn(headers, [map.narration]);
  const debitIdx = map.debit ? findColumn(headers, [map.debit]) : -1;
  const creditIdx = map.credit ? findColumn(headers, [map.credit]) : -1;
  // `amount` is the single-column variant (HDFC's signed ValueDr/ValueCr
  // pseudo-column) — falls back to a debit/credit sum otherwise.
  const amountIdx = map.amount ? findColumn(headers, [map.amount]) : -1;

  if (dateIdx < 0) {
    throw new Error(
      `${bankName}: date column "${map.date}" not found in headers: ${headers.join(', ')}`,
    );
  }

  const out: BankTransaction[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const date = parseDate(row[dateIdx] ?? '', map.dateFormat);
    if (!date) continue; // skip blank / malformed rows
    let amount = 0;
    if (amountIdx >= 0) {
      amount = parseAmount(row[amountIdx] ?? '');
    } else {
      const debit = debitIdx >= 0 ? parseAmount(row[debitIdx] ?? '') : 0;
      const credit = creditIdx >= 0 ? parseAmount(row[creditIdx] ?? '') : 0;
      amount = credit - Math.abs(debit);
    }
    // Some banks list only "debit" with a sign, or only credits. The
    // reconciliation engine works with signed amounts; creditsOnly
    // filters out rows where nothing came in.
    if (map.creditsOnly && amount <= 0) continue;
    out.push({
      date,
      amount: Math.abs(amount),
      ref: refIdx >= 0 ? (row[refIdx] ?? '').toString().trim() : '',
      narration: narrationIdx >= 0 ? (row[narrationIdx] ?? '').toString().trim() : '',
    });
  }
  return out;
}

/** Re-export `CREDIT_ONLY_DEFAULT` for tests. */
export { CREDIT_ONLY_DEFAULT };
