/**
 * SS-027a — unit spec for ShippingRatesController's response shaping.
 *
 * NOTE: We deliberately avoid importing `shipping-rates.controller.ts` here
 * because tsoa's runtime pulls in `@tsoa/cli` (which depends on
 * `merge-anything`) at decorator-evaluation time, and that dep is not
 * installed in this app's package.json. Full controller behavior is covered
 * by the e2e suite under `apps/api-e2e/`; this file pins down the pure
 * response-shaping helper that the controller delegates to.
 */
import { toRateResponse } from '../shapers';

describe('toRateResponse', () => {
  it('coerces the rate column to a number', () => {
    const created = new Date('2026-01-01T00:00:00.000Z');
    const updated = new Date('2026-01-02T00:00:00.000Z');
    const out = toRateResponse({
      id: 1,
      carrierId: 7,
      serviceName: 'Standard',
      rate: '49.50', // pg numeric columns often come back as strings
      estimatedDeliveryDays: 3,
      createdAt: created,
      updatedAt: updated,
    });
    expect(out).toEqual({
      id: 1,
      carrierId: 7,
      serviceName: 'Standard',
      rate: 49.5,
      estimatedDeliveryDays: 3,
      createdAt: created,
      updatedAt: updated,
    });
  });

  it('preserves integer rate values without appending a decimal', () => {
    const out = toRateResponse({
      id: 2,
      carrierId: 8,
      serviceName: 'Express',
      rate: 100,
      estimatedDeliveryDays: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(out.rate).toBe(100);
  });
});
