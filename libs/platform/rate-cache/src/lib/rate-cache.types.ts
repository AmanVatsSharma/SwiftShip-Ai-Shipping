import type { RateQuote } from '@swiftship/platform-carriers';

/**
 * Key for a single rate-cache entry. Includes the carrier code so that
 * one carrier's quote is cached independently from another's; the
 * orchestrator looks up one entry per (tenant, carrier, request).
 */
export interface RateCacheKey {
  originPincode: string;
  destinationPincode: string;
  weightGrams: number;
  paymentMethod: 'PREPAID' | 'COD';
  carrierCode?: string;
}

export type CachedRateQuote = RateQuote;

/**
 * Per-carrier circuit-breaker state.
 *  - CLOSED:    normal — pass requests through
 *  - OPEN:      failing — skip this carrier for OPEN_DURATION_MS
 *  - HALF_OPEN: cooldown expired — let one request through as a probe
 */
export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
