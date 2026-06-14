import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLogger } from '@swiftship/observability';

/**
 * WatiService — sends templated WhatsApp messages via the WATI REST API.
 *
 * Templates must be pre-approved by Meta and configured in the WATI
 * dashboard before they can be sent. Free-form text is not supported
 * by the WhatsApp Business Platform; WATI exposes only the templated
 * `sendTemplateMessage` endpoint we use here.
 *
 * On delivery / read / button-click, WATI posts to a webhook we
 * register at account level. We track the message ID returned here
 * so the NDR case's `metadata.watiMessageId` can be cross-referenced
 * with those inbound events.
 */
@Injectable()
export class WatiService {
  private readonly logger = new StructuredLogger(WatiService.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiUrl =
      this.config.get<string>('WATI_API_URL') ?? 'https://app.wati.io/api/v1';
    this.apiKey = this.config.get<string>('WATI_API_KEY') ?? '';
  }

  /**
   * Send a pre-approved template to a single WhatsApp number.
   * Returns the WATI message ID (used to correlate with delivery webhooks).
   */
  async sendTemplate(
    to: string,
    templateName: string,
    params: Record<string, string>,
  ): Promise<string> {
    if (!this.apiKey) {
      this.logger.warn(
        `WATI_API_KEY not configured; skipping template '${templateName}' to ${to}`,
      );
      return '';
    }
    const url = `${this.apiUrl}/sendTemplateMessage?whatsappNumber=${encodeURIComponent(
      to,
    )}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        template_name: templateName,
        parameters: Object.entries(params).map(([name, value]) => ({
          name,
          value,
        })),
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      this.logger.error(
        `WATI send failed: ${res.status} ${err}`,
        WatiService.name,
      );
      throw new Error(`WATI send failed: ${res.status} ${err}`);
    }
    const data = (await res.json()) as { id?: string; messageId?: string };
    return data.id ?? data.messageId ?? '';
  }

  /**
   * NDR-specific template: "Your order #{{order_id}} delivery was attempted.
   * Tap to reschedule / confirm address / cancel."
   */
  async sendNdrAttemptFailed(
    to: string,
    params: {
      orderId: string;
      awbNumber: string;
      attemptCount: number;
      customerName: string;
    },
  ): Promise<string> {
    return this.sendTemplate(to, 'ndr_attempt_failed', {
      customer_name: params.customerName,
      order_id: params.orderId,
      awb_number: params.awbNumber,
      attempt_count: String(params.attemptCount),
    });
  }

  /**
   * Confirmation template after a customer reschedules.
   */
  async sendNdrRescheduleConfirm(
    to: string,
    params: { orderId: string; rescheduleDate: string; customerName: string },
  ): Promise<string> {
    return this.sendTemplate(to, 'ndr_reschedule_confirm', {
      customer_name: params.customerName,
      order_id: params.orderId,
      reschedule_date: params.rescheduleDate,
    });
  }
}
