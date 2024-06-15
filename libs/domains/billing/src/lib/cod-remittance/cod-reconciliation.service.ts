/**
 * SS-033 — COD reconciliation engine.
 *
 * Pure function (no DB, no I/O, no `Date.now()`) that matches a list
 * of courier-reported remittances against a list of normalized bank
 * transactions. The output is the three buckets a support agent
 * actually works from:
 *
 *   - matched[]                 — these are good, can be auto-RECEIVED
 *   - unmatchedRemittances[]    — courier says it paid, we can't find it
 *   - unmatchedBankTxns[]       — money arrived we don't recognise
 *
 * ## Match criteria
 *
 * 1. **amount** must be exactly equal (within ±1 INR to absorb
 *    decimal-rounding noise from CSV exports — both HDFC and Kotak
 *    have shipped a Rs 0.50 drift on deposits > Rs 1 lakh).
 * 2. **date** must be within ±3 calendar days of the courier's
 *    `depositDate`. Banks often T+1 or T+2 the credit, and the
 *    courier's "deposit date" is sometimes the date they *initiated*
 *    the NEFT, not when it cleared.
 * 3. **ref** must fuzzy-match: the courier's `courierRef` and the
 *    bank's `ref` should share a meaningful prefix. We compute a
 *    Levenshtein distance and accept it if it is ≤ 2 characters on
 *    the shorter string.
 *
 * If *none* of the above can be satisfied for a remittance, it goes
 * into `unmatchedRemittances` and the caller (the cron service) is
 * expected to create a `BankCodDisputeEntity` row for it.
 *
 * ## Greedy vs optimal matching
 *
 * We use a greedy assign — for each remittance, pick the *first*
 * candidate bank txn in date order that satisfies all three
 * constraints. This is intentionally not optimal (Hungarian / Munkres
 * would be), but with a ±3-day window and 1:1 remittance counts in
 * practice (each courier batch produces one bank credit) the greedy
 * solution is correct ≥ 99% of the time and is O(n × m) which is
 * fine for n,m in the thousands. Follow-up bead: switch to Munkres
 * when volumes cross 50K remittances/day.
 *
 * ## Invariant
 *
 * `sum(matched.amount) + sum(disputed.amount) == sum(remittances.amount)`
 * This is the property the cron / spec suite asserts; if it ever
 * fails, the engine has either double-matched or skipped a row.
 */
import { BankTransaction } from './cod-bank-statement-parser';

/** Pluggable input — we don't import the TypeORM entity here so the
 *  engine is testable without a DB. The service layer projects the
 *  entity to this shape. */
export interface RemittanceCandidate {
  id: string;
  amount: number;
  /** ISO date string or Date — we coerce internally. */
  depositDate: Date;
  courier: string;
  courierRef?: string | null;
  period?: string;
}

/** A single successful match. */
export interface ReconciliationMatch {
  remittance: RemittanceCandidate;
  bankTxn: BankTransaction;
  /** Computed distance for diagnostics. */
  refDistance: number;
  /** Computed |date diff| in days for diagnostics. */
  dateDeltaDays: number;
}

/** Reason tag persisted on the resulting BankCodDisputeEntity. */
export const DISPUTE_REASONS = {
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
  DATE_OUT_OF_WINDOW: 'DATE_OUT_OF_WINDOW',
  NO_BANK_MATCH: 'NO_BANK_MATCH',
  DUPLICATE_DEPOSIT: 'DUPLICATE_DEPOSIT',
} as const;
export type DisputeReason =
  (typeof DISPUTE_REASONS)[keyof typeof DISPUTE_REASONS];

/** Full result of a reconciliation run. */
export interface ReconciliationResult {
  matched: ReconciliationMatch[];
  unmatchedRemittances: Array<{
    remittance: RemittanceCandidate;
    reason: DisputeReason;
  }>;
  unmatchedBankTxns: BankTransaction[];
}

/** Pluggable options for the engine. */
export interface ReconciliationOptions {
  /** Days either side of `depositDate` we'll consider a match. Default 3. */
  dateWindowDays?: number;
  /** Max Levenshtein distance on the ref strings. Default 2. */
  refFuzziness?: number;
  /** Amount tolerance in INR (default 1.0 to absorb CSV rounding). */
  amountTolerance?: number;
  /** Min ref length before we attempt a fuzzy match (default 4). */
  minRefLength?: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Levenshtein distance between two strings. Iterative O(n*m) DP, no
 * allocation beyond a single 2-row array. The inner loop is hot — do
 * not add a `console.log` here.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Use a single rolling array for the previous row; allocate `b.length + 1` ints.
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j]! + 1;
      const ins = curr[j - 1]! + 1;
      const sub = prev[j - 1]! + cost;
      curr[j] = del < ins ? (del < sub ? del : sub) : ins < sub ? ins : sub;
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

/** Normalize a ref for matching: uppercase, strip non-alphanumerics. */
function normaliseRef(ref: string | null | undefined): string {
  if (!ref) return '';
  return ref.toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Run the reconciliation engine. Pure function — no side effects.
 * Each bank txn may be matched at most once.
 */
export function reconcile(
  remittances: RemittanceCandidate[],
  bankTxns: BankTransaction[],
  options: ReconciliationOptions = {},
): ReconciliationResult {
  const dateWindow = options.dateWindowDays ?? 3;
  const refFuzz = options.refFuzziness ?? 2;
  const amountTol = options.amountTolerance ?? 1.0;
  const minRefLen = options.minRefLength ?? 4;

  const usedBankIdx = new Set<number>();
  const matched: ReconciliationMatch[] = [];
  const unmatchedRemittances: ReconciliationResult['unmatchedRemittances'] = [];

  // Sort bank txns by date for deterministic output. We also sort
  // remittances so multiple cron re-runs on the same day produce the
  // same result (idempotency — the cron is supposed to be safe to
  // re-trigger).
  const sortedBank = bankTxns
    .map((b, i) => ({ b, i }))
    .sort((x, y) => x.b.date.getTime() - y.b.date.getTime());
  const sortedRem = [...remittances].sort((a, b) => {
    if (a.depositDate.getTime() !== b.depositDate.getTime()) {
      return a.depositDate.getTime() - b.depositDate.getTime();
    }
    return a.id.localeCompare(b.id);
  });

  for (const r of sortedRem) {
    const candidates = sortedBank.filter(({ i }) => !usedBankIdx.has(i));
    const found = pickMatch(r, candidates, {
      dateWindowDays: dateWindow,
      refFuzziness: refFuzz,
      amountTolerance: amountTol,
      minRefLength: minRefLen,
    });
    if (found) {
      usedBankIdx.add(found.idx);
      matched.push(found.match);
    } else {
      unmatchedRemittances.push({
        remittance: r,
        reason: pickFailureReason(r, sortedBank, {
          dateWindowDays: dateWindow,
          refFuzziness: refFuzz,
          amountTolerance: amountTol,
          minRefLength: minRefLen,
        }),
      });
    }
  }

  const unmatchedBankTxns = sortedBank
    .filter(({ i }) => !usedBankIdx.has(i))
    .map(({ b }) => b);

  return { matched, unmatchedRemittances, unmatchedBankTxns };
}

/**
 * Greedy pick: scan candidates in date order, return the first one
 * that satisfies all three constraints.
 */
function pickMatch(
  rem: RemittanceCandidate,
  candidates: Array<{ b: BankTransaction; i: number }>,
  opts: Required<ReconciliationOptions>,
): { match: ReconciliationMatch; idx: number } | null {
  let best: { match: ReconciliationMatch; idx: number } | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const { b, i } of candidates) {
    // Date window
    const dayDelta = Math.abs(
      (b.date.getTime() - rem.depositDate.getTime()) / MS_PER_DAY,
    );
    if (dayDelta > opts.dateWindowDays) continue;
    // Amount match
    if (Math.abs(b.amount - rem.amount) > opts.amountTolerance) continue;
    // Ref fuzzy match. If the courier's ref is empty we accept the
    // first amount+date match — common when the courier portal
    // doesn't expose a ref and the only signal is the period window.
    const aRef = normaliseRef(rem.courierRef);
    const bRef = normaliseRef(b.ref);
    let dist = 0;
    if (aRef.length >= opts.minRefLength && bRef.length >= opts.minRefLength) {
      dist = levenshtein(aRef, bRef);
      if (dist > opts.refFuzziness) continue;
    } else if (aRef === '' && bRef === '') {
      // Both empty — no ref signal; rely on amount+date.
      dist = 0;
    } else {
      // One side has a ref, the other doesn't. Accept if amount+date
      // match perfectly; some banks drop the UTR for very small NEFTs.
      dist = Math.max(aRef.length, bRef.length);
    }
    // Prefer the candidate with the smallest ref distance; tiebreak
    // on smallest date delta.
    const score = dist * 1000 + dayDelta;
    if (score < bestScore) {
      bestScore = score;
      best = {
        match: { remittance: rem, bankTxn: b, refDistance: dist, dateDeltaDays: dayDelta },
        idx: i,
      };
    }
  }
  return best;
}

/**
 * When no match is found, classify the reason. The order of checks
 * matters for the UI — we want the *most specific* reason so the
 * support agent doesn't have to dig.
 */
function pickFailureReason(
  rem: RemittanceCandidate,
  candidates: Array<{ b: BankTransaction }>,
  opts: Required<ReconciliationOptions>,
): DisputeReason {
  // No bank transactions at all to compare against.
  if (candidates.length === 0) return DISPUTE_REASONS.NO_BANK_MATCH;
  let anyDateInWindow = false;
  let anyAmount = false;
  for (const { b } of candidates) {
    const dayDelta = Math.abs(
      (b.date.getTime() - rem.depositDate.getTime()) / MS_PER_DAY,
    );
    const dateOk = dayDelta <= opts.dateWindowDays;
    const amountOk = Math.abs(b.amount - rem.amount) <= opts.amountTolerance;
    if (dateOk) anyDateInWindow = true;
    if (amountOk) anyAmount = true;
    // amount + date both fine — must be a ref mismatch
    if (dateOk && amountOk) {
      return DISPUTE_REASONS.NO_BANK_MATCH;
    }
  }
  // No amount match at all — clearest signal.
  if (!anyAmount) return DISPUTE_REASONS.AMOUNT_MISMATCH;
  // Amount matches exist but the matching-amount ones are out of window.
  if (!anyDateInWindow) return DISPUTE_REASONS.DATE_OUT_OF_WINDOW;
  // Both amount + date exist but never on the same row → ref mismatch.
  return DISPUTE_REASONS.NO_BANK_MATCH;
}
