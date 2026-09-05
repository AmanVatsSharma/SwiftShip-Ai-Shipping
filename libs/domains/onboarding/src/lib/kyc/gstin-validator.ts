/**
 * SS-031 — GSTIN (Goods and Services Tax Identification Number) validator.
 *
 * Format (15 characters):
 *   pos 1-2  : State code (numeric, 01-37 + 96-99 for Union Territories)
 *   pos 3-7  : First 5 chars of the PAN (alphabetic)
 *   pos 8-11 : Next 4 chars of the PAN (digits)
 *   pos 12   : 10th char of the PAN (alphabetic, holder type)
 *   pos 13   : Entity code (1-9, A-Z) — distinguishes branches / legal entity
 *   pos 14   : Blank / "Z" (default)
 *   pos 15   : Checksum character (alphabetic, computed by GSTN algorithm)
 *
 * Reference: GSTN Systems Ltd. — Taxpayer Identification Number
 * 4-step checksum algorithm (Luhn-like with a custom alphabet).
 */
import { Injectable } from '@nestjs/common';
import { PanValidatorService } from './pan-validator';

/** The full set of valid state codes per the Indian GST regime. */
export const GSTIN_STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman and Diu',
  '26': 'Dadra and Nagar Haveli',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh (New)',
  '96': 'Foreign Country',
  '97': 'Other Territory',
  '98': 'Centre Jurisdiction',
  '99': 'Non-State Code',
};

export const GSTIN_REGEX =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[A-Z]{1}$/;

export interface GstinValidationResult {
  valid: boolean;
  normalized: string | null;
  stateCode: string | null;
  stateName: string | null;
  /** PAN portion (positions 3-12 of the GSTIN, i.e. the embedded PAN). */
  pan: string | null;
  /** Position 13 — branch / entity code. */
  entityCode: string | null;
  /** Position 15 — checksum char (matches the GSTN algorithm when valid). */
  checksum: string | null;
  reason?: string;
}

/**
 * The GSTN checksum character is computed using a weighted Luhn-like
 * algorithm over a special alphabet. Reference: GSTN Taxpayer
 * Identification Number spec.
 *
 * 1. Map each character to its numeric value:
 *      0-9 -> 0-9
 *      A-Z -> 10-35 (A=10, B=11, ..., Z=35)
 *      Special: 0 -> 0, Z handled as 36
 * 2. For each char at position `i` (1-indexed, from the left), multiply
 *    by a factor (odd positions × 1, even positions × 2).
 *    If the product is > 9, sum the digits (i.e. take `q + (q mod 10)`).
 * 3. The checksum char is the value that brings the total mod 36 to 1.
 *    (The character for value 0 is '0', 1..10 -> '1'..'9' and 11..35
 *    -> 'A'..'Z'.) For 'Z' the value is 36, and 36 mod 36 = 0.
 */
const GSTIN_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function gstinCharToValue(c: string): number {
  return GSTIN_ALPHABET.indexOf(c);
}

function gstinValueToChar(v: number): string {
  // The checksum char may be a digit 0-9 or A-Z (35).
  if (v < 0) return '0';
  return GSTIN_ALPHABET[v] ?? '0';
}

export function computeGstinChecksum(gstin14: string): string {
  if (gstin14.length !== 14) {
    throw new Error('GSTIN checksum input must be 14 chars');
  }
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const ch = gstin14.charAt(i);
    const value = gstinCharToValue(ch);
    const factor = i % 2 === 0 ? 1 : 2;
    const product = value * factor;
    // Sum the digits of the product, then add to running total.
    const q = Math.floor(product / 10);
    const r = product % 10;
    sum += q + r;
  }
  // Checksum char brings (sum + value) mod 36 to 0. Then return that value's
  // corresponding char. Special case: '0' and 'Z' both encode 0/36; GSTN
  // uses 'Z' for new registrations, but any of 0/'1'..'9'/'A'..'Z' that
  // satisfies the equality is acceptable per the spec.
  const remainder = sum % 36;
  const checksumValue = (36 - remainder) % 36;
  return gstinValueToChar(checksumValue);
}

@Injectable()
export class GstinValidatorService {
  constructor(private readonly pan: PanValidatorService) {}

  normalize(input: string): string {
    return (input ?? '').toString().trim().toUpperCase();
  }

  validate(input: string): GstinValidationResult {
    if (input === null || input === undefined || input === '') {
      return {
        valid: false,
        normalized: null,
        stateCode: null,
        stateName: null,
        pan: null,
        entityCode: null,
        checksum: null,
        reason: 'GSTIN is empty',
      };
    }
    const normalized = this.normalize(input);

    if (normalized.length !== 15) {
      return {
        valid: false,
        normalized: null,
        stateCode: null,
        stateName: null,
        pan: null,
        entityCode: null,
        checksum: null,
        reason: 'GSTIN must be 15 characters',
      };
    }
    if (!GSTIN_REGEX.test(normalized)) {
      return {
        valid: false,
        normalized: null,
        stateCode: null,
        stateName: null,
        pan: null,
        entityCode: null,
        checksum: null,
        reason: 'GSTIN format mismatch',
      };
    }

    const stateCode = normalized.substring(0, 2);
    const panPart = normalized.substring(2, 12);
    const entityCode = normalized.charAt(12);
    // pos 14 is always 'Z' (per regex), pos 15 is the checksum
    const checksum = normalized.charAt(14);

    // Verify the embedded PAN is structurally valid.
    const panResult = this.pan.validate(panPart);
    if (!panResult.valid) {
      return {
        valid: false,
        normalized: null,
        stateCode,
        stateName: GSTIN_STATE_CODES[stateCode] ?? null,
        pan: null,
        entityCode: null,
        checksum: null,
        reason: `Embedded PAN invalid: ${panResult.reason}`,
      };
    }

    // Verify the checksum.
    const expected = computeGstinChecksum(normalized.substring(0, 14));
    if (expected !== checksum) {
      return {
        valid: false,
        normalized: null,
        stateCode,
        stateName: GSTIN_STATE_CODES[stateCode] ?? null,
        pan: null,
        entityCode,
        checksum,
        reason: `GSTIN checksum mismatch (expected ${expected}, got ${checksum})`,
      };
    }

    return {
      valid: true,
      normalized,
      stateCode,
      stateName: GSTIN_STATE_CODES[stateCode] ?? null,
      pan: panResult.normalized,
      entityCode,
      checksum,
    };
  }
}
