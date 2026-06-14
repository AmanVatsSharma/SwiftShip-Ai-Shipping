/**
 * SS-031 — PAN (Permanent Account Number) validator.
 *
 * Indian PAN format: AAAAA9999A
 *  - First 5 chars: uppercase alphabetic (A-Z)
 *  - Next 4 chars: digits (0-9)
 *  - Last char: uppercase alphabetic (A-Z)
 *  - 4th character encodes the holder type:
 *      P — Individual / Person
 *      C — Company
 *      H — Hindu Undivided Family (HUF)
 *      A — Association of Persons (AOP)
 *      B — Body of Individuals (BOI)
 *      G — Government
 *      J — Artificial Juridical Person
 *      L — Local Authority
 *      F — Firm / LLP
 *      T — Trust
 *
 * Reference: ITD PAN-2.0 spec, Income Tax Department.
 */
import { Injectable } from '@nestjs/common';

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

/** Known PAN holder-type characters. Anything else fails the format check. */
export const PAN_HOLDER_TYPE_CHARS = ['P', 'C', 'H', 'A', 'B', 'G', 'J', 'L', 'F', 'T'] as const;

export type PanHolderType = (typeof PAN_HOLDER_TYPE_CHARS)[number];

export interface PanValidationResult {
  valid: boolean;
  /** Upper-cased, trimmed PAN when valid; null when not. */
  normalized: string | null;
  /** Holder-type character (4th char) when valid; null when not. */
  holderType: PanHolderType | null;
  /** Human-readable reason for failure. */
  reason?: string;
}

@Injectable()
export class PanValidatorService {
  /**
   * Normalize a raw PAN string (trim, upper-case) so we always compare
   * consistently regardless of how the caller passed it in.
   */
  normalize(input: string): string {
    return (input ?? '').toString().trim().toUpperCase();
  }

  /**
   * Validate a PAN.
   *
   * The PAN itself does not have a public checksum, so validation here
   * is structural only (regex + holder-type). For real-world proofing
   * we'd cross-check against the Income Tax PAN database; the
   * {@link BankVerifierService} (or a Setu/CKYC adapter plugged in
   * later) handles the lookup step.
   */
  validate(input: string): PanValidationResult {
    if (input === null || input === undefined || input === '') {
      return { valid: false, normalized: null, holderType: null, reason: 'PAN is empty' };
    }
    const normalized = this.normalize(input);

    if (!PAN_REGEX.test(normalized)) {
      return {
        valid: false,
        normalized: null,
        holderType: null,
        reason: 'PAN must match AAAAA9999A (5 letters, 4 digits, 1 letter)',
      };
    }

    const holderChar = normalized.charAt(3);
    if (!PAN_HOLDER_TYPE_CHARS.includes(holderChar as PanHolderType)) {
      return {
        valid: false,
        normalized: null,
        holderType: null,
        reason: `Unknown PAN holder type "${holderChar}"`,
      };
    }

    return {
      valid: true,
      normalized,
      holderType: holderChar as PanHolderType,
    };
  }
}
