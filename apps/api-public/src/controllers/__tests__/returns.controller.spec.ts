/**
 * Pure unit tests for the returns controller's response shaping logic.
 *
 * NOTE: We deliberately avoid importing `returns.controller.ts` here because
 * tsoa's runtime pulls in `@tsoa/cli` (which depends on `merge-anything`) at
 * decorator-evaluation time, and that dep is not installed in this app's
 * package.json. Full controller behavior is covered by the e2e suite under
 * `apps/api-e2e/`; this file pins down the pure response-shaping helpers
 * that the controller delegates to.
 */
import { shapeReturnResponse } from '../shapers';

describe('shapeReturnResponse', () => {
  it('uppercases the status and adds an audit timestamp', () => {
    const out = shapeReturnResponse(
      { id: 'r-1', status: 'requested' } as never,
      new Date('2026-06-01T00:00:00.000Z'),
    );
    expect(out.id).toBe('r-1');
    expect(out.status).toBe('REQUESTED');
    expect(out.auditedAt).toBe('2026-06-01T00:00:00.000Z');
  });

  it('handles already-uppercase status without double-conversion', () => {
    const out = shapeReturnResponse(
      { id: 'r-2', status: 'APPROVED' } as never,
      new Date('2026-06-02T00:00:00.000Z'),
    );
    expect(out.status).toBe('APPROVED');
  });
});
