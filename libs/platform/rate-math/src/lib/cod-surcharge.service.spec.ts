import { ConfigService } from '@nestjs/config';
import { CodSurchargeService } from './cod-surcharge.service';

describe('CodSurchargeService', () => {
  const buildService = (
    env: Record<string, unknown> = {},
  ): CodSurchargeService => {
    const config = {
      get: jest.fn((key: string) => env[key]),
    } as unknown as ConfigService;
    return new CodSurchargeService(config);
  };

  it('returns the default flat ₹50 (5000 paise) when no config is set', () => {
    const service = buildService();
    const result = service.compute(100000, 'DELHIVERY');
    const ok = 5000;
    expect(result).toEqual(ok);
  });

  it('returns the carrier-specific flat value when COD_SURCHARGE_<CODE>.flat is set', () => {
    const service = buildService({ COD_SURCHARGE_DTDC: { flat: 7000 } });
    const result = service.compute(100000, 'dtdc'); // case-insensitive
    const ok = 7000;
    expect(result).toEqual(ok);
  });

  it('uses pct-based pricing when COD_SURCHARGE_<CODE>.pct is set', () => {
    const service = buildService({
      COD_SURCHARGE_DELHIVERY: { pct: 0.015, min: 5000, max: 20000 },
    });
    // 1.5% of 100000 paise = 1500 paise -> clamped to min 5000
    const result = service.compute(100000, 'DELHIVERY');
    const ok = 5000;
    expect(result).toEqual(ok);
  });

  it('clamps to max when pct charge exceeds it', () => {
    const service = buildService({
      COD_SURCHARGE_DHL: { pct: 0.02, min: 5000, max: 12000 },
    });
    // 2% of 1000000 paise = 20000 paise -> clamped to max 12000
    const result = service.compute(1000000, 'DHL');
    const ok = 12000;
    expect(result).toEqual(ok);
  });

  it('returns the unclamped pct charge when within [min, max]', () => {
    const service = buildService({
      COD_SURCHARGE_DHL: { pct: 0.02, min: 5000, max: 20000 },
    });
    // 2% of 500000 paise = 10000 paise -> within range
    const result = service.compute(500000, 'DHL');
    const ok = 10000;
    expect(result).toEqual(ok);
  });

  it('rounds to the nearest paise (no fractional paise)', () => {
    const service = buildService({
      COD_SURCHARGE_X: { pct: 0.015 },
    });
    // 1.5% of 1001 paise = 15.015 paise -> 15
    const result = service.compute(1001, 'X');
    const ok = 15;
    expect(result).toEqual(ok);
  });

  it('falls back to flat when pct is undefined (not just null)', () => {
    const service = buildService({
      COD_SURCHARGE_Y: { flat: 3000 }, // pct absent
    });
    const result = service.compute(100000, 'Y');
    const ok = 3000;
    expect(result).toEqual(ok);
  });

  it('returns 0 for an explicit flat: 0 (PREPAID-style override)', () => {
    const service = buildService({
      COD_SURCHARGE_Z: { flat: 0 },
    });
    const result = service.compute(100000, 'Z');
    expect(result).toEqual(0);
  });
});
