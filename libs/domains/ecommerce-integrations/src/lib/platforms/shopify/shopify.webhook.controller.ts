import { BadRequestException, Controller, Headers, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';

@Controller('shopify')
export class ShopifyWebhookController {
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {}

  @Post('webhook')
  async handleWebhook(
    @Headers('x-shopify-hmac-sha256') hmac: string,
    @Headers('x-shopify-topic') topic: string,
    @Headers('x-shopify-shop-domain') shopDomain: string,
    @Req() req: Request,
  ) {
    if (!hmac) throw new BadRequestException('Missing HMAC header');
    const secret = this.config.get<string>('ecommerceIntegrations.shopify.apiSecret') ?? '';
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const computed = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
    if (computed !== hmac) throw new BadRequestException('Invalid HMAC');

    // Persist idempotency key to prevent reprocessing
    const eventId = req.headers['x-shopify-topic'] + ':' + (req.headers['x-request-id'] as string | undefined ?? crypto.randomUUID());
    try {
      await this.prisma.shopifyWebhookEvent.create({ data: { id: eventId, topic, shopDomain: shopDomain ?? 'unknown' } });
    } catch {
      // Already processed
      return { ok: true, duplicate: true };
    }

    // TODO: dispatch to background job in future
    return { ok: true };
  }
}
