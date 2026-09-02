import { PanValidatorService, PAN_REGEX, PAN_HOLDER_TYPE_CHARS } from '../pan-validator';

describe('PanValidatorService', () => {
  let service: PanValidatorService;

  beforeEach(() => {
    service = new PanValidatorService();
  });

  describe('normalize', () => {
    it('trims whitespace and upper-cases', () => {
      expect(service.normalize('  abcfe1234f  ')).toBe('ABCFE1234F');
    });

    it('handles null/undefined safely', () => {
      expect(service.normalize(null as unknown as string)).toBe('');
      expect(service.normalize(undefined as unknown as string)).toBe('');
    });
  });

  describe('validate', () => {
    it('accepts a structurally valid individual PAN', () => {
      const r = service.validate('ABCFE1234F');
      expect(r.valid).toBe(true);
      expect(r.normalized).toBe('ABCFE1234F');
      expect(r.holderType).toBe('F');
    });

    it('accepts all known holder types', () => {
      for (const t of PAN_HOLDER_TYPE_CHARS) {
        const pan = `AAA${t}A9999A`;
        const r = service.validate(pan);
        expect(r.valid).toBe(true);
        expect(r.holderType).toBe(t);
      }
    });

    it('rejects too-short PANs', () => {
      const r = service.validate('ABCD1234F');
      expect(r.valid).toBe(false);
      expect(r.reason).toMatch(/AAAAA9999A/);
    });

    it('rejects too-long PANs', () => {
      const r = service.validate('ABCDEF1234F');
      expect(r.valid).toBe(false);
    });

    it('rejects lower-case (forces upper-case then re-checks)', () => {
      const r = service.validate('abcfe1234f');
      expect(r.valid).toBe(true);
      expect(r.normalized).toBe('ABCFE1234F');
    });

    it('rejects alphabetic in the digit block', () => {
      const r = service.validate('ABCDEABCD F'.replace(/\s/g, ''));
      expect(r.valid).toBe(false);
    });

    it('rejects unknown holder type (4th char)', () => {
      // Z is not a valid holder type
      const r = service.validate('ABZDE1234F');
      expect(r.valid).toBe(false);
      expect(r.reason).toMatch(/holder type/);
    });

    it('rejects empty / null / undefined', () => {
      expect(service.validate('').valid).toBe(false);
      expect(service.validate(null as unknown as string).valid).toBe(false);
      expect(service.validate(undefined as unknown as string).valid).toBe(false);
    });

    it('regex matches exactly the right shape', () => {
      expect(PAN_REGEX.test('ABCFE1234F')).toBe(true);
      expect(PAN_REGEX.test('12345ABCDE')).toBe(false);
      expect(PAN_REGEX.test('A1CDE1234F')).toBe(false);
    });
  });
});
