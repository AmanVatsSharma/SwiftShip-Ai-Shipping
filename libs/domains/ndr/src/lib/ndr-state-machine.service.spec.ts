import { BadRequestException } from '@nestjs/common';
import { NdrCaseStatus } from '@swiftship/platform-typeorm';
import { NdrStateMachine } from './ndr-state-machine.service';

/**
 * SS-017 — NdrStateMachine unit tests.
 *
 * Covers the full state transition graph: legal transitions, illegal
 * transitions, terminal states, attempt-count semantics (RESCHEDULED
 * does NOT increment), lastAttemptAt stamping, and the audit trail in
 * `metadata.transitionHistory`.
 */
describe('NdrStateMachine', () => {
  let sm: NdrStateMachine;

  beforeEach(() => {
    sm = new NdrStateMachine();
  });

  // ----------------------------------------------------------------
  // Legal transitions
  // ----------------------------------------------------------------

  const legalCases: [NdrCaseStatus, NdrCaseStatus][] = [
    [NdrCaseStatus.PENDING, NdrCaseStatus.CALL_ATTEMPTED],
    [NdrCaseStatus.PENDING, NdrCaseStatus.CANCELLED],
    [NdrCaseStatus.CALL_ATTEMPTED, NdrCaseStatus.WHATSAPP_SENT],
    [NdrCaseStatus.CALL_ATTEMPTED, NdrCaseStatus.EMAIL_SENT],
    [NdrCaseStatus.CALL_ATTEMPTED, NdrCaseStatus.RESCHEDULED],
    [NdrCaseStatus.WHATSAPP_SENT, NdrCaseStatus.CALL_ATTEMPTED],
    [NdrCaseStatus.WHATSAPP_SENT, NdrCaseStatus.EMAIL_SENT],
    [NdrCaseStatus.WHATSAPP_SENT, NdrCaseStatus.RESCHEDULED],
    [NdrCaseStatus.WHATSAPP_SENT, NdrCaseStatus.DELIVERED],
    [NdrCaseStatus.EMAIL_SENT, NdrCaseStatus.CALL_ATTEMPTED],
    [NdrCaseStatus.EMAIL_SENT, NdrCaseStatus.WHATSAPP_SENT],
    [NdrCaseStatus.EMAIL_SENT, NdrCaseStatus.RESCHEDULED],
    [NdrCaseStatus.EMAIL_SENT, NdrCaseStatus.DELIVERED],
    [NdrCaseStatus.RESCHEDULED, NdrCaseStatus.DELIVERED],
    [NdrCaseStatus.RESCHEDULED, NdrCaseStatus.RTO_INITIATED],
    [NdrCaseStatus.RTO_INITIATED, NdrCaseStatus.RTO],
  ];

  it.each(legalCases)(
    'allows %s → %s',
    (from, to) => {
      expect(sm.canTransition(from, to)).toBe(true);
    },
  );

  // ----------------------------------------------------------------
  // Illegal transitions
  // ----------------------------------------------------------------

  it('rejects PENDING → DELIVERED (must go through contact attempts first)', () => {
    expect(sm.canTransition(NdrCaseStatus.PENDING, NdrCaseStatus.DELIVERED)).toBe(false);
  });

  it('rejects PENDING → WHATSAPP_SENT (must call-attempt first)', () => {
    expect(sm.canTransition(NdrCaseStatus.PENDING, NdrCaseStatus.WHATSAPP_SENT)).toBe(false);
  });

  it('rejects CALL_ATTEMPTED → RTO_INITIATED (must reschedule first)', () => {
    expect(sm.canTransition(NdrCaseStatus.CALL_ATTEMPTED, NdrCaseStatus.RTO_INITIATED)).toBe(false);
  });

  it('throws BadRequestException for an illegal transition', () => {
    const ndr: any = { status: NdrCaseStatus.PENDING, attemptCount: 0 };
    expect(() => sm.transition(ndr, NdrCaseStatus.DELIVERED)).toThrow(BadRequestException);
  });

  // ----------------------------------------------------------------
  // Terminal states
  // ----------------------------------------------------------------

  it('treats DELIVERED as terminal (no outgoing transitions)', () => {
    expect(sm.isTerminal(NdrCaseStatus.DELIVERED)).toBe(true);
    expect(sm.validTransitions(NdrCaseStatus.DELIVERED)).toEqual([]);
  });

  it('treats RTO as terminal', () => {
    expect(sm.isTerminal(NdrCaseStatus.RTO)).toBe(true);
  });

  it('treats CANCELLED as terminal', () => {
    expect(sm.isTerminal(NdrCaseStatus.CANCELLED)).toBe(true);
  });

  it('rejects any transition out of DELIVERED', () => {
    const ndr: any = { status: NdrCaseStatus.DELIVERED, attemptCount: 0 };
    expect(() => sm.transition(ndr, NdrCaseStatus.CANCELLED)).toThrow(BadRequestException);
    expect(() => sm.transition(ndr, NdrCaseStatus.RTO_INITIATED)).toThrow(BadRequestException);
    expect(() => sm.transition(ndr, NdrCaseStatus.RESCHEDULED)).toThrow(BadRequestException);
  });

  // ----------------------------------------------------------------
  // attemptCount semantics
  // ----------------------------------------------------------------

  it('increments attemptCount for non-RESCHEDULED transitions', () => {
    const ndr: any = {
      status: NdrCaseStatus.PENDING,
      attemptCount: 0,
      metadata: {},
    };
    sm.transition(ndr, NdrCaseStatus.CALL_ATTEMPTED);
    expect(ndr.attemptCount).toBe(1);
    expect(ndr.status).toBe(NdrCaseStatus.CALL_ATTEMPTED);
  });

  it('does NOT increment attemptCount for RESCHEDULED transitions', () => {
    const ndr: any = {
      status: NdrCaseStatus.CALL_ATTEMPTED,
      attemptCount: 1,
      metadata: {},
    };
    sm.transition(ndr, NdrCaseStatus.RESCHEDULED);
    expect(ndr.attemptCount).toBe(1);
    expect(ndr.status).toBe(NdrCaseStatus.RESCHEDULED);
  });

  // ----------------------------------------------------------------
  // Stamps & history
  // ----------------------------------------------------------------

  it('sets lastAttemptAt on every transition', () => {
    const ndr: any = {
      status: NdrCaseStatus.PENDING,
      attemptCount: 0,
      metadata: {},
    };
    const before = new Date();
    sm.transition(ndr, NdrCaseStatus.CALL_ATTEMPTED);
    expect(ndr.lastAttemptAt).toBeInstanceOf(Date);
    expect(ndr.lastAttemptAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('records a transitionHistory entry in metadata', () => {
    const ndr: any = {
      id: 42,
      status: NdrCaseStatus.PENDING,
      attemptCount: 0,
      metadata: {},
    };
    sm.transition(ndr, NdrCaseStatus.CALL_ATTEMPTED, 'carrier reported customer unavailable');
    expect(ndr.metadata.transitionHistory).toHaveLength(1);
    expect(ndr.metadata.transitionHistory[0]).toMatchObject({
      from: NdrCaseStatus.PENDING,
      to: NdrCaseStatus.CALL_ATTEMPTED,
      reason: 'carrier reported customer unavailable',
    });
    expect(ndr.metadata.lastTransitionReason).toBe('carrier reported customer unavailable');

    sm.transition(ndr, NdrCaseStatus.WHATSAPP_SENT, 'fallback to WhatsApp');
    expect(ndr.metadata.transitionHistory).toHaveLength(2);
    expect(ndr.metadata.transitionHistory[1].to).toBe(NdrCaseStatus.WHATSAPP_SENT);
  });

  it('preserves prior transitionHistory entries across transitions', () => {
    const ndr: any = {
      status: NdrCaseStatus.PENDING,
      attemptCount: 0,
      metadata: {
        transitionHistory: [
          { from: 'PENDING', to: 'PENDING', at: '2026-01-01T00:00:00Z', reason: 'synthetic' },
        ],
      },
    };
    sm.transition(ndr, NdrCaseStatus.CALL_ATTEMPTED);
    expect(ndr.metadata.transitionHistory).toHaveLength(2);
    expect(ndr.metadata.transitionHistory[0].reason).toBe('synthetic');
  });
});
