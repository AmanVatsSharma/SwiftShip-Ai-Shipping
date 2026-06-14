import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLogger } from '@swiftship/observability';

/**
 * ExotelService — places automated voice calls via the Exotel REST API.
 *
 * Uses the "connect" endpoint which dials the caller from the exophone
 * and plays an IVR URL (configured by the merchant in their Exotel
 * dashboard). The IVR should offer:
 *   "Press 1 to reschedule delivery, press 2 to confirm address, press 3 to speak to support"
 *
 * After the caller presses a digit, Exotel POSTs to our webhook
 * (NdrVoiceWebhookController.reply). We also receive call-status
 * events at NdrVoiceWebhookController.status.
 *
 * The call SID is stored in NDR `metadata.exotelCallSid` so we can
 * reconcile status callbacks with cases.
 */
@Injectable()
export class ExotelService {
  private readonly logger = new StructuredLogger(ExotelService.name);
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly callerNumber: string;
  private readonly exophone: string;

  constructor(private readonly config: ConfigService) {
    this.accountSid = this.config.get<string>('EXOTEL_ACCOUNT_SID') ?? '';
    this.authToken = this.config.get<string>('EXOTEL_AUTH_TOKEN') ?? '';
    this.callerNumber = this.config.get<string>('EXOTEL_CALLER_NUMBER') ?? '';
    this.exophone = this.config.get<string>('EXOTEL_EXOPHONE') ?? '';
  }

  /**
   * Place a voice call. The merchant supplies an IVR URL (hosted on their
   * Exotel applet) that plays the prompt and collects DTMF digits.
   *
   * Returns the Exotel Call SID so the caller can correlate status
   * webhooks with the originating request.
   */
  async placeIvrCall(
    to: string,
    params: {
      orderId: string;
      customerName: string;
      webhookUrl: string;
    },
  ): Promise<string> {
    if (!this.accountSid || !this.authToken) {
      this.logger.warn('Exotel credentials not configured; skipping call');
      return '';
    }
    const url =
      `https://api.exotel.com/v1/Accounts/${encodeURIComponent(
        this.accountSid,
      )}/Calls/connect`;
    const auth = Buffer.from(
      `${this.accountSid}:${this.authToken}`,
    ).toString('base64');
    const body = new URLSearchParams({
      From: to,
      To: this.callerNumber,
      CallerId: this.exophone,
      Url: params.webhookUrl,
      StatusCallback: `${params.webhookUrl}/status`,
      CustomField: `order_id=${params.orderId}`,
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) {
      const err = await res.text();
      this.logger.error(
        `Exotel call failed: ${res.status} ${err}`,
        ExotelService.name,
      );
      throw new Error(`Exotel call failed: ${res.status} ${err}`);
    }
    const data = (await res.json()) as {
      Call?: { Sid?: string; [k: string]: any };
    };
    return data.Call?.Sid ?? '';
  }
}
