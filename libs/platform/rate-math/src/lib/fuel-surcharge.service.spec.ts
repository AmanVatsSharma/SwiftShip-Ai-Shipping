import { ConfigService } from '@nestjs/config';
import { FuelSurchargeService } from './fuel-surcharge.service';

describe('FuelSurchargeService', () => {
  const buildService = (
    env: Record<string, number | undefined> = {},
  ): FuelSurchargeService => {
    const config = {
      get: jest.fn((key: string) => env[key]),
    } as unknown as ConfigService;
    return new FuelSurchargeService(config);
  };

  it('returns Math.round(baseRate * 0.18) when no carrier override is set', () => {
    const service = buildService();
    const result = service.compute(10000, 'DELHIVERY');
    const expected = Math.round(10000 * 0.18);
    const ok = 1800;
    expect(result).toEqual(ok);
    expect(result).toEqual(expected);
  });

  it('uses carrier-specific override when FUEL_SURCHARGE_<CODE> env is set', () => {
    const service = buildService({ FUEL_SURCHARGE_BLUEDART: 0.22 });
    const result = service.compute(10000, 'bluedart');
    const expected = Math.round(10000 * 0.22);
    const ok = 2200;
    expect(result).toEqual(ok);
    expect(result).toEqual(expected);
  });

  it('falls back to the global current rate when env var is missing', () => {
    const service = buildService();
    service.setCurrentFuelSurchargePct(0.15);
    const result = service.compute(10000, 'DELHIVERY');
    const expected = Math.round(10000 * 0.15);
    const ok = 1500;
    expect(result).toEqual(ok);
    expect(result).toEqual(expected);
  });

  it('carrier-specific override beats the global rate', () => {
    const service = buildService({ FUEL_SURCHARGE_DHL: 0.25 });
    service.setCurrentFuelSurchargePct(0.18);
    const result = service.compute(10000, 'DHL');
    const expected = Math.round(10000 * 0.25);
    const ok = 2500;
    expect(result).toEqual(ok);
    expect(result).toEqual(expected);
  });

  it('rounds to the nearest paise (no fractional paise in the output)', () => {
    const service = buildService();
    // 9999 * 0.18 = 1799.82 -> 1800
    const result = service.compute(9999, 'DELHIVERY');
    expect(Number.isInteger(result)).toBe(true);
    const ok = 1800;
    expect(result).toEqual(ok);
  });

  it('refreshFromRss() resets the global pct to 0.18 (stub)', async () => {
    const service = buildService();
    service.setCurrentFuelSurchargePct(0.99);
    await service.refreshFromRss();
    expect(service.getCurrentFuelSurchargePct()).toEqual(0.18);
  });

  it('handles 0 base rate without throwing', () => {
    const service = buildService();
    const result = service.compute(0, 'DELHIVERY');
    expect(result).toEqual(0);
  });
});
