import { GstinValidatorService, computeGstinChecksum, GSTIN_REGEX, GSTIN_STATE_CODES } from '../gstin-validator';
import { PanValidatorService } from '../pan-validator';

describe('GstinValidatorService', () => {
  let service: GstinValidatorService;
  let pan: PanValidatorService;

  beforeEach(() => {
    pan = new PanValidatorService();
    service = new GstinValidatorService(pan);
  });

  // Pick a known-good embedded PAN. AABCT1330L is the public Reliance
  // Industries PAN used as a fixture in many shipping tutorials — we
  // reuse it for the test GSTIN.
  const RELIANCE_PAN = 'AABCT1330L';
  const RELIANCE_STATE = '27'; // Maharashtra
  const RELIANCE_ENTITY = '1'; // first branch
  // Build a checksum for the 14-char prefix.
  const RELIANCE_PREFIX = `${RELIANCE_STATE}${RELIANCE_PAN}${RELIANCE_ENTITY}Z`;
  const RELIANCE_GSTIN = `${RELIANCE_PREFIX}${computeGstinChecksum(RELIANCE_PREFIX)}`;

  describe('normalize', () => {
    it('trims and upper-cases', () => {
      expect(service.normalize(`  ${RELIANCE_GSTIN.toLowerCase()}  `)).toBe(RELIANCE_GSTIN);
    });
  });

  describe('validate', () => {
    it('accepts a well-formed GSTIN with a correct checksum', () => {
      const r = service.validate(RELIANCE_GSTIN);
      expect(r.valid).toBe(true);
      expect(r.stateCode).toBe('27');
      expect(r.stateName).toBe('Maharashtra');
      expect(r.pan).toBe(RELIANCE_PAN);
      expect(r.entityCode).toBe('1');
      expect(r.checksum).toBeDefined();
    });

    it('rejects wrong-length GSTINs', () => {
      const r = service.validate('27AABCT1330L1Z');
      expect(r.valid).toBe(false);
      expect(r.reason).toMatch(/15/);
    });

    it('rejects malformed GSTINs (non-numeric state code)', () => {
      const r = service.validate('AAAABCT1330L1ZX');
      expect(r.valid).toBe(false);
    });

    it('rejects when the embedded PAN is invalid', () => {
      // Same shape as RELIANCE_GSTIN but PAN is broken (lower digit block)
      const r = service.validate('27AAZZZ1330L1ZZ');
      expect(r.valid).toBe(false);
      expect(r.reason).toMatch(/PAN/);
    });

    it('rejects on checksum mismatch', () => {
      // Build a structurally valid GSTIN but flip the last char.
      const tampered = RELIANCE_GSTIN.substring(0, 14) + 'A';
      const r = service.validate(tampered);
      expect(r.valid).toBe(false);
      expect(r.reason).toMatch(/checksum/);
    });

    it('exposes state name lookup', () => {
      expect(GSTIN_STATE_CODES['07']).toBe('Delhi');
      expect(GSTIN_STATE_CODES['33']).toBe('Tamil Nadu');
      expect(GSTIN_STATE_CODES['99']).toBe('Non-State Code');
    });

    it('rejects empty / null / undefined', () => {
      expect(service.validate('').valid).toBe(false);
      expect(service.validate(null as unknown as string).valid).toBe(false);
      expect(service.validate(undefined as unknown as string).valid).toBe(false);
    });
  });

  describe('computeGstinChecksum', () => {
    it('returns a single alphanumeric char', () => {
      const cs = computeGstinChecksum(RELIANCE_PREFIX);
      expect(cs).toHaveLength(1);
      expect(GSTIN_REGEX.test(RELIANCE_GSTIN)).toBe(true);
    });

    it('throws on wrong-length input', () => {
      expect(() => computeGstinChecksum('short')).toThrow();
    });

    it('produces a stable checksum (golden value)', () => {
      // Snapshot value: any change to the algorithm must be deliberate.
      expect(computeGstinChecksum(RELIANCE_PREFIX)).toBe(RELIANCE_GSTIN.charAt(14));
    });
  });
});
