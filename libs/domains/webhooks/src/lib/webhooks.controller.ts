import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TrackingEventEntity } from '@swiftship/platform-typeorm';
import { WebhooksService } from './webhooks.service';

/** Loose shape of an inbound carrier tracking webhook payload. */
interface CarrierTrackingPayload {
  shipmentId?: number | string;
  shipment_id?: number | string;
  awb?: string;
  tracking_number?: string;
  status?: string;
  scan?: string;
  remarks?: string;
  description?: string;
  location?: string;
  scan_date?: string | number;
  occurred_at?: string | number;
  event_id?: string;
  id?: string;
}

@Controller('carrier-webhook')
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhooksService,
    @InjectRepository(TrackingEventEntity)
    private readonly trackingEvents: Repository<TrackingEventEntity>,
  ) {}

  // Placeholder endpoint to receive generic carrier tracking webhooks
  @Post('tracking')
  @HttpCode(200)
  async tracking(
    @Body() body: CarrierTrackingPayload,
    @Headers() headers: Record<string, string>,
  ) {
    console.log('[CarrierWebhook] tracking', { headers, body });
    // Optional: simple HMAC validation if header & secret available
    const signature =
      headers['x-delhivery-signature'] ||
      headers['x-hub-signature'] ||
      undefined;
    const secret = process.env.DELHIVERY_WEBHOOK_SECRET || undefined;
    if (secret && signature) {
      try {
        const crypto = await import('crypto');
        const h = crypto
          .createHmac('sha256', secret)
          .update(JSON.stringify(body))
          .digest('hex');
        if (h !== signature)
          throw new UnauthorizedException('Invalid signature');
      } catch {
        throw new UnauthorizedException('Invalid signature');
      }
    }
    await this.webhooks.dispatch('tracking', body);
    try {
      // Basic mapper for Delhivery-like payloads; extend per carrier
      // (SS-101: prisma.trackingEvent.* → TrackingEventEntity repository).
      const shipmentId = Number(body?.shipmentId || body?.shipment_id);
      const trackingNumber = String(body?.awb || body?.tracking_number || '');
      const status = String(body?.status || body?.scan || 'EVENT');
      const description = body?.remarks || body?.description || undefined;
      const location = body?.location || undefined;
      const occurredAt = new Date(
        body?.scan_date || body?.occurred_at || Date.now(),
      );
      const externalId: string | undefined =
        body?.event_id || body?.id || undefined;
      if (!Number.isNaN(shipmentId) && trackingNumber) {
        // idempotency on externalId when present
        if (externalId) {
          const existing = await this.trackingEvents.findOne({
            where: { externalId },
          });
          if (existing) return { ok: true };
        }
        await this.trackingEvents.insert({
          shipmentId,
          trackingNumber,
          status,
          description: description ?? null,
          location: location ?? null,
          subStatus: null,
          eventCode: null,
          occurredAt,
          externalId: externalId ?? null,
        });
      }
    } catch (e) {
      console.error(
        '[CarrierWebhook] tracking ingest failed',
        toErrorMessage(e),
      );
    }
    return { ok: true };
  }
}

/** Describe an unknown thrown value for logging. */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
