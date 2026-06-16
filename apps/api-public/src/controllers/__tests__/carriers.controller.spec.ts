/**
 * SS-027a — unit spec for CarriersController's response shaping.
 *
 * NOTE: We deliberately avoid importing `carriers.controller.ts` here because
 * tsoa's runtime pulls in `@tsoa/cli` (which depends on `merge-anything`) at
 * decorator-evaluation time, and that dep is not installed in this app's
 * package.json. Full controller behavior is covered by the e2e suite under
 * `apps/api-e2e/`; this file pins down the pure response-shaping helper
 * that the controller delegates to.
 */
import { toCarrierResponse } from '../shapers';

describe('toCarrierResponse', () => {
  it('passes through id, name, apiKey, createdAt, updatedAt', () => {
    const created = new Date('2026-01-01T00:00:00.000Z');
    const updated = new Date('2026-01-02T00:00:00.000Z');
    const out = toCarrierResponse({
      id: 1,
      name: 'Delhivery',
      apiKey: 'k1',
      createdAt: created,
      updatedAt: updated,
    });
    expect(out).toEqual({
      id: 1,
      name: 'Delhivery',
      apiKey: 'k1',
      createdAt: created,
      updatedAt: updated,
    });
  });

  it('preserves null/undefined timestamps', () => {
    const out = toCarrierResponse({
      id: 2,
      name: 'X',
      apiKey: null,
      createdAt: null,
      updatedAt: undefined,
    });
    expect(out.id).toBe(2);
    expect(out.name).toBe('X');
    expect(out.apiKey).toBeNull();
    expect(out.createdAt).toBeNull();
    expect(out.updatedAt).toBeUndefined();
  });
});
