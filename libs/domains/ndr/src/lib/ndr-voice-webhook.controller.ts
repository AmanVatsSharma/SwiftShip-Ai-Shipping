import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { NdrContactService } from './ndr-contact.service';

/**
 * NdrVoiceWebhookController — receives Exotel webhooks for the IVR
 * calls placed by NdrContactService.
 *
 * Routes:
 *   POST /ndr/voice-webhook/status   — call lifecycle events (ringing, in-progress, completed)
 *   POST /ndr/voice-webhook/reply    — caller pressed a digit (1=reschedule, 2=new_address, 3=cancel)
 *
 * Public (no TenantGuard) — Exotel cannot authenticate to our service.
 * In production we should additionally:
 *   1. Verify the Exotel signature header (`X-Exotel-Signature`),
 *   2. Or rate-limit per CallSid at the gateway layer.
 */
interface ExotelPassthru {
  CallSid: string;
  CustomField?: string;
  Digits?: string;
  Status?: string;
}

interface ExotelReplyBody extends ExotelPassthru {
  orderId?: string;
  ndrId?: number;
}

@Controller('ndr/voice-webhook')
export class NdrVoiceWebhookController {
  private readonly logger = new Logger(NdrVoiceWebhookController.name);

  constructor(private readonly contact: NdrContactService) {}

  @Post('status')
  @HttpCode(200)
  async status(@Body() body: ExotelPassthru): Promise<{ received: true }> {
    this.logger.log(
      `Exotel call ${body.CallSid} status: ${body.Status ?? 'unknown'}`,
    );
    return { received: true };
  }

  @Post('reply')
  @HttpCode(200)
  async reply(
    @Body() body: ExotelReplyBody,
  ): Promise<{ received: true; intent?: string }> {
    const intent =
      body.Digits === '1'
        ? 'reschedule'
        : body.Digits === '2'
          ? 'new_address'
          : body.Digits === '3'
            ? 'cancel'
            : null;
    if (intent && typeof body.ndrId === 'number') {
      await this.contact.handleCustomerReply(body.ndrId, intent as any, {
        callSid: body.CallSid,
        orderId: body.orderId,
      });
    } else {
      this.logger.warn(
        `Exotel reply received with no actionable intent (Digits=${body.Digits}, ndrId=${body.ndrId})`,
      );
    }
    return { received: true, intent: intent ?? undefined };
  }
}
