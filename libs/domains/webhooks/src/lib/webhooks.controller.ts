import { Body, Controller, Headers, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('carrier-webhook')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService, private readonly prisma: PrismaService) {}

  // Placeholder endpoint to receive generic carrier tracking webhooks
  @Post('tracking')
  @HttpCode(200)
  async tracking(@Body() body: any, @Headers() headers: Record<string, string>) {
    // eslint-disable-next-line no-console
    console.log('[CarrierWebhook] tracking', { headers, body });
    // Optional: simple HMAC validation if header & secret available
    const signature = headers['x-delhivery-signature'] || headers['x-hub-signature'] || undefined;
    const secret = process.env.DELHIVERY_WEBHOOK_SECRET || undefined;
    if (secret && signature) {
      try {
        const crypto = await import('crypto');
        const h = crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
        if (h !== signature) throw new UnauthorizedException('Invalid signature');
      } catch (e) {
        throw new UnauthorizedException('Invalid signature');
      }
    }
    await this.webhooks.dispatch('tracking', body);
    try {
      // Basic mapper for Delhivery-like payloads; extend per carrier
      const shipmentId = Number(body?.shipmentId || body?.shipment_id);
      const trackingNumber = String(body?.awb || body?.tracking_number || '');
      const status = String(body?.status || body?.scan || 'EVENT');
      const description = body?.remarks || body?.description || undefined;
      const location = body?.location || undefined;
      const occurredAt = new Date(body?.scan_date || body?.occurred_at || Date.now());
      const externalId: string | undefined = body?.event_id || body?.id || undefined;
      if (!Number.isNaN(shipmentId) && trackingNumber) {
        // idempotency on externalId when present
        if (externalId) {
          const existing = await this.prisma.trackingEvent.findUnique({ where: { externalId } });
          if (existing) return { ok: true };
        }
        await this.prisma.trackingEvent.create({
          data: {
            shipmentId,
            trackingNumber,
            status,
            description: description ?? null,
            location: location ?? null,
            subStatus: null,
            eventCode: null,
            occurredAt,
            externalId: externalId ?? null,
          },
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[CarrierWebhook] tracking ingest failed', (e as Error).message);
    }
    return { ok: true };
  }
}
