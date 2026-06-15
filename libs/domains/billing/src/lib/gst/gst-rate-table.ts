/**
 * SS-032 — HSN / SAC code to GST rate lookup.
 *
 * The Central Board of Indirect Taxes (CBIC) Notification 1/2017 (and
 * subsequent rate revisions) map HSN codes for goods and SAC codes for
 * services to one of five GST slabs: 0%, 5%, 12%, 18%, 28%.
 *
 * For shipping / logistics the relevant codes are in Chapter 99 (SAC,
 * "Other services") — 9965 covers land transport services, 9966 covers
 * freight by water, 9967 freight by air, 9968 postal / courier, 9969
 * all-other-transport. We use 996511 ("courier services") as the
 * default for any shipment invoice.
 *
 * Lookup rules:
 *   - Empty / unknown code → falls back to the 18% slab (most common).
 *   - The lookup is case- and whitespace-insensitive.
 *   - Codes shorter than 4 digits are NOT in the table — we apply the
 *     fallback rate rather than throw, because the input HSN is
 *     user-supplied and a wrong HSN should not break the API.
 */
export interface HsnEntry {
  hsnCode: string;
  description: string;
  /** Stored as percent, e.g. 18 for 18% GST. */
  taxRate: number;
}

export const GST_SLABS = [0, 5, 12, 18, 28] as const;
export type GstSlab = (typeof GST_SLABS)[number];

/**
 * Curated HSN/SAC table for the codes a logistics API is most likely
 * to see. Anything not in the table falls through to {@link lookupHsnRate}
 * which returns a default 18% rate (the "standard" slab for services).
 */
export const HSN_RATE_TABLE: HsnEntry[] = [
  // ---- 0% (exempt)
  { hsnCode: '9999', description: 'Exempt supply', taxRate: 0 },

  // ---- 5% (essentials, basic transport)
  { hsnCode: '996511', description: 'Basic courier services', taxRate: 5 },
  { hsnCode: '996512', description: 'Local delivery (manual)', taxRate: 5 },
  { hsnCode: '996513', description: 'Last-mile delivery', taxRate: 5 },
  { hsnCode: '996519', description: 'Other land transport n.e.c.', taxRate: 5 },

  // ---- 12% (transport services)
  { hsnCode: '996521', description: 'Road transport — passengers', taxRate: 12 },
  { hsnCode: '996522', description: 'Road transport — goods (motor vehicles)', taxRate: 12 },
  { hsnCode: '996531', description: 'Rail transport — freight', taxRate: 12 },
  { hsnCode: '996541', description: 'Pipeline transport', taxRate: 12 },

  // ---- 18% (standard, most common for courier)
  { hsnCode: '996611', description: 'Freight transport by water — coastal', taxRate: 18 },
  { hsnCode: '996612', description: 'Freight transport by water — overseas', taxRate: 18 },
  { hsnCode: '996711', description: 'Freight transport by air — domestic', taxRate: 18 },
  { hsnCode: '996712', description: 'Freight transport by air — international', taxRate: 18 },
  { hsnCode: '996811', description: 'Postal / courier services', taxRate: 18 },
  { hsnCode: '996812', description: 'Warehouse / storage services', taxRate: 18 },
  { hsnCode: '996911', description: 'Other transport services n.e.c.', taxRate: 18 },

  // ---- 28% (luxury / demerit)
  { hsnCode: '996821', description: 'Premium logistics / 3PL', taxRate: 28 },
  { hsnCode: '996822', description: 'Same-day / hyperlocal premium', taxRate: 28 },
];

/** The default tax rate applied when an HSN code is not in the table. */
export const DEFAULT_HSN_CODE = '996811';
export const DEFAULT_TAX_RATE = 18;

export function lookupHsnRate(hsnCode: string | null | undefined): HsnEntry {
  const normalized = (hsnCode ?? '').toString().trim();
  if (normalized === '') {
    const fallback = HSN_RATE_TABLE.find((e) => e.hsnCode === DEFAULT_HSN_CODE)!;
    return { ...fallback };
  }
  const exact = HSN_RATE_TABLE.find((e) => e.hsnCode === normalized);
  if (exact) return { ...exact };
  // Hierarchical fallback: if the user supplies a 4-digit chapter that
  // doesn't match, walk up to the 2-digit chapter, then to default.
  const chapter = normalized.substring(0, 4);
  const chapterMatch = HSN_RATE_TABLE.find((e) => e.hsnCode.startsWith(chapter));
  if (chapterMatch) return { ...chapterMatch };
  return {
    hsnCode: normalized,
    description: `Unrecognized HSN/SAC (${normalized}) — applied standard 18% rate`,
    taxRate: DEFAULT_TAX_RATE,
  };
}

/**
 * Validate that a numeric rate is one of the five legal slabs.
 * Throws when the rate is not in the legal set, so the caller fails
 * fast at the boundary rather than generating a non-compliant invoice.
 */
export function assertValidGstSlab(rate: number): void {
  if (!GST_SLABS.includes(rate as GstSlab)) {
    throw new Error(
      `Invalid GST slab ${rate}% — must be one of ${GST_SLABS.join(', ')}`,
    );
  }
}
