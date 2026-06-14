import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { NdrCaseStatus } from '@swiftship/platform-typeorm';

/**
 * NDR state machine.
 *
 * Pure (no DB) — the NdrService is the only thing that touches the database.
 * The state machine is responsible for:
 *   1. Knowing which transitions are legal.
 *   2. Stamping `lastAttemptAt`, incrementing `attemptCount` (except for
 *      RESCHEDULED, which is a "pause + retry" — not a new contact attempt).
 *   3. Recording a `transitionHistory` in `metadata` for auditability.
 *
 * Terminal states (no outgoing transitions): DELIVERED, RTO, CANCELLED.
 */
@Injectable()
export class NdrStateMachine {
  private readonly logger = new Logger(NdrStateMachine.name);

  /**
   * Map of legal forward transitions. A state not in this map (or with
   * an empty array) is terminal.
   */
  private static readonly VALID_TRANSITIONS: Record<NdrCaseStatus, NdrCaseStatus[]> = {
    [NdrCaseStatus.PENDING]: [
      NdrCaseStatus.CALL_ATTEMPTED,
      NdrCaseStatus.CANCELLED,
    ],
    [NdrCaseStatus.CALL_ATTEMPTED]: [
      NdrCaseStatus.WHATSAPP_SENT,
      NdrCaseStatus.EMAIL_SENT,
      NdrCaseStatus.RESCHEDULED,
    ],
    [NdrCaseStatus.WHATSAPP_SENT]: [
      NdrCaseStatus.CALL_ATTEMPTED,
      NdrCaseStatus.EMAIL_SENT,
      NdrCaseStatus.RESCHEDULED,
      NdrCaseStatus.DELIVERED,
    ],
    [NdrCaseStatus.EMAIL_SENT]: [
      NdrCaseStatus.CALL_ATTEMPTED,
      NdrCaseStatus.WHATSAPP_SENT,
      NdrCaseStatus.RESCHEDULED,
      NdrCaseStatus.DELIVERED,
    ],
    [NdrCaseStatus.RESCHEDULED]: [
      NdrCaseStatus.DELIVERED,
      NdrCaseStatus.RTO_INITIATED,
    ],
    [NdrCaseStatus.DELIVERED]: [],
    [NdrCaseStatus.RTO_INITIATED]: [NdrCaseStatus.RTO],
    [NdrCaseStatus.RTO]: [],
    [NdrCaseStatus.CANCELLED]: [],
  };

  /** Returns the legal forward transitions from a given state. */
  validTransitions(from: NdrCaseStatus): NdrCaseStatus[] {
    return NdrStateMachine.VALID_TRANSITIONS[from] ?? [];
  }

  /** True iff `from → to` is a legal transition. */
  canTransition(from: NdrCaseStatus, to: NdrCaseStatus): boolean {
    return this.validTransitions(from).includes(to);
  }

  /** True iff the state has no outgoing transitions. */
  isTerminal(state: NdrCaseStatus): boolean {
    return this.validTransitions(state).length === 0;
  }

  /**
   * Mutates `ndr` in place: validates the transition, sets the new status,
   * stamps `lastAttemptAt`, increments `attemptCount` (unless transitioning
   * to RESCHEDULED), and records a `transitionHistory` entry in `metadata`.
   *
   * Throws `BadRequestException` if the transition is not legal.
   */
  transition(
    ndr: {
      id?: number;
      status: NdrCaseStatus;
      attemptCount: number;
      lastAttemptAt?: Date | null;
      metadata?: Record<string, any> | null;
    },
    to: NdrCaseStatus,
    reason?: string,
  ): void {
    const from = ndr.status;
    if (!this.canTransition(from, to)) {
      const valid = this.validTransitions(from);
      const validStr = valid.length > 0 ? valid.join(', ') : 'none (terminal)';
      throw new BadRequestException(
        `Invalid NDR transition: ${from} → ${to}. Valid: ${validStr}`,
      );
    }

    const now = new Date();
    ndr.status = to;
    // Rescheduling is a "pause and retry" — it doesn't count as a new
    // outbound contact attempt. All other transitions do.
    if (to !== NdrCaseStatus.RESCHEDULED) {
      ndr.attemptCount = (ndr.attemptCount ?? 0) + 1;
    }
    ndr.lastAttemptAt = now;

    const history: any[] = Array.isArray(ndr.metadata?.transitionHistory)
      ? [...(ndr.metadata!.transitionHistory as any[])]
      : [];
    history.push({ from, to, at: now.toISOString(), reason: reason ?? null });

    ndr.metadata = {
      ...(ndr.metadata ?? {}),
      lastTransitionReason: reason ?? null,
      lastTransitionAt: now.toISOString(),
      transitionHistory: history,
    };

    this.logger.log(
      `NDR #${ndr.id ?? '?'}: ${from} → ${to}${reason ? ` (${reason})` : ''}`,
    );
  }
}
