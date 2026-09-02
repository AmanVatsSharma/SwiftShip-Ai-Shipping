import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { ShopifyWebhookEventEntity } from '@swiftship/platform-typeorm';

@Controller('shopify')
export class ShopifyWebhookController {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(ShopifyWebhookEventEntity)
    private readonly webhookEvents: Repository<ShopifyWebhookEventEntity>,
  ) {}

  @Post('webhook')
  async handleWebhook(
    @Headers('x-shopify-hmac-sha256') hmac: string,
    @Headers('x-shopify-topic') topic: string,
    @Headers('x-shopify-shop-domain') shopDomain: string,
    @Req() req: Request,
  ) {
    if (!hmac) throw new BadRequestException('Missing HMAC header');
    const secret =
      this.config.get<string>('ecommerceIntegrations.shopify.apiSecret') ?? '';
    const rawBodyRequest = req as Request & { rawBody?: Buffer };
    const rawBody = rawBodyRequest.rawBody
      ? rawBodyRequest.rawBody.toString('utf8')
      : JSON.stringify(req.body);
    const computed = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('base64');
    if (computed !== hmac) throw new BadRequestException('Invalid HMAC');

    // Persist idempotency key to prevent reprocessing (insert violates the
    // primary key on replay — the SS-101 TypeORM port of the former
    // prisma.shopifyWebhookEvent.create duplicate guard).
    const topicHeader = headerToString(req.headers['x-shopify-topic'], topic);
    const requestIdHeader = headerToString(
      req.headers['x-request-id'],
      crypto.randomUUID(),
    );
    const eventId = `${topicHeader}:${requestIdHeader}`;
    try {
      await this.webhookEvents.insert({
        id: eventId,
        topic,
        shopDomain: shopDomain ?? 'unknown',
      });
    } catch {
      // Already processed
      return { ok: true, duplicate: true };
    }

    // TODO: dispatch to background job in future
    return { ok: true };
  }
}

/** Coerce a possibly-array/undefined express header to a single string. */
function headerToString(
  header: string | string[] | undefined,
  fallback: string,
): string {
  if (Array.isArray(header)) return header[0] ?? fallback;
  return header ?? fallback;
}
