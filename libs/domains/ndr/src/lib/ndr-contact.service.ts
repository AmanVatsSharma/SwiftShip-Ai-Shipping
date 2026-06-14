import { BadRequestException, Injectable } from '@nestjs/common';
import { NdrCaseStatus, ShipmentEntity } from '@swiftship/platform-typeorm';
import { ExotelService, WatiService } from '@swiftship/domains-notifications';
import { StructuredLogger } from '@swiftship/observability';
import { NdrService } from './ndr.service';

export type CustomerIntent = 'reschedule' | 'new_address' | 'cancel';

export type ContactChannel = 'whatsapp' | 'call' | 'none';

export interface ContactResult {
  channel: ContactChannel;
  messageId?: string;
}

/**
 * NdrContactService — orchestrates the outbound customer-contact flow
 * for an open NDR case.
 *
 * Strategy (per the SS-018 spec):
 *   1. Try WhatsApp first (templated, Meta-approved templates only).
 *   2. On WATI failure, fall back to an Exotel voice call (IVR).
 *   3. If both fail, log and return `{ channel: 'none' }` — the case
 *      stays in PENDING and the retry loop / cron can re-attempt.
 *
 * Idempotency: this service is read-only with respect to the NDR
 * status. It calls `NdrService.transitionNdr` which delegates to the
 * state machine; if the case is already in a contact-attempted state
 * the state machine will reject the transition. Callers should
 * `getNdr` first if they want to short-circuit.
 *
 * The `contactCustomer` method does NOT advance the NDR to
 * RESCHEDULED — only a confirmed customer reply does (via
 * `handleCustomerReply`).
 */
@Injectable()
export class NdrContactService {
  private readonly logger = new StructuredLogger(NdrContactService.name);

  constructor(
    private readonly ndrService: NdrService,
    private readonly wati: WatiService,
    private readonly exotel: ExotelService,
  ) {}

  /**
   * Try WhatsApp; on failure fall back to voice call.
   * Records the contact attempt in the NDR's state machine.
   */
  async contactCustomer(
    ndrId: number,
    shipment: ShipmentEntity | null,
    customerName: string,
    orderId: string,
  ): Promise<ContactResult> {
    const ndr = await this.ndrService.getNdr(ndrId);
    const phone =
      (shipment as unknown as { customerPhone?: string | null } | null)
        ?.customerPhone ?? ndr.customerPhone ?? null;
    if (!phone) {
      this.logger.warn(`NDR #${ndrId} has no customer phone; skipping contact`);
      return { channel: 'none' };
    }

    // 1. Try WhatsApp first.
    try {
      const messageId = await this.wati.sendNdrAttemptFailed(phone, {
        orderId,
        awbNumber: shipment?.trackingNumber ?? ndr.awbNumber ?? '',
        attemptCount: ndr.attemptCount ?? 0,
        customerName,
      });
      await this.ndrService.transitionNdr(
        ndrId,
        NdrCaseStatus.WHATSAPP_SENT,
        `WA message ${messageId}`,
      );
      return { channel: 'whatsapp', messageId };
    } catch (err) {
      this.logger.error(
        `WhatsApp failed for NDR #${ndrId}: ${(err as Error).message}`,
        (err as Error).stack,
        NdrContactService.name,
      );
    }

    // 2. Fall back to voice call.
    try {
      const callSid = await this.exotel.placeIvrCall(phone, {
        orderId,
        customerName,
        webhookUrl:
          process.env.NDR_WEBHOOK_URL ??
          'https://api.swiftship.ai/ndr/voice-webhook',
      });
      await this.ndrService.transitionNdr(
        ndrId,
        NdrCaseStatus.CALL_ATTEMPTED,
        `Exotel call ${callSid}`,
      );
      return { channel: 'call', messageId: callSid };
    } catch (err) {
      this.logger.error(
        `Exotel call also failed for NDR #${ndrId}: ${(err as Error).message}`,
        (err as Error).stack,
        NdrContactService.name,
      );
      return { channel: 'none' };
    }
  }

  /**
   * Handle a customer's reply (WhatsApp button click OR Exotel DTMF).
   * Advances the state machine based on the customer's intent.
   *
   *  - reschedule | new_address → RESCHEDULED
   *  - cancel                   → RTO_INITIATED (via `initiateRto`)
   */
  async handleCustomerReply(
    ndrId: number,
    intent: CustomerIntent,
    metadata: Record<string, any> = {},
  ): Promise<void> {
    switch (intent) {
      case 'reschedule':
        await this.ndrService.transitionNdr(
          ndrId,
          NdrCaseStatus.RESCHEDULED,
          'customer requested reschedule',
          metadata,
        );
        return;
      case 'new_address':
        await this.ndrService.transitionNdr(
          ndrId,
          NdrCaseStatus.RESCHEDULED,
          'customer provided new address',
          metadata,
        );
        return;
      case 'cancel':
        await this.ndrService.initiateRto(ndrId);
        return;
      default:
        throw new BadRequestException(`Unknown customer intent: ${intent}`);
    }
  }
}
