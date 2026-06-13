import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import * as crypto from 'crypto';
import axios from 'axios';
import { PrismaService } from '../../../prisma/prisma.service';
import { ShopifyIntegrationService } from './services/shopify-integration.service';

@Controller('shopify')
export class ShopifyController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly shopifyIntegration: ShopifyIntegrationService,
  ) {}

  @Get('oauth/start')
  start(@Query('shop') shop: string, @Res() res: Response) {
    if (!shop) throw new BadRequestException('Missing shop param');
    const appUrl = this.config.get<string>('ecommerceIntegrations.shopify.appUrl') ?? '';
    const apiKey = this.config.get<string>('ecommerceIntegrations.shopify.apiKey') ?? '';
    const scopes = this.config.get<string>('ecommerceIntegrations.shopify.scopes') ?? '';
    const state = crypto.randomBytes(16).toString('hex');
    const redirectUri = encodeURIComponent(`${appUrl}/shopify/oauth/callback`);
    const url = `https://${shop}/admin/oauth/authorize?client_id=${apiKey}&scope=${encodeURIComponent(scopes)}&redirect_uri=${redirectUri}&state=${state}`;
    res.redirect(url);
  }

  @Get('oauth/callback')
  async callback(
    @Query('shop') shop: string,
    @Query('code') code: string,
    @Query('hmac') hmac: string,
    @Res() res: Response,
  ) {
    if (!shop || !code || !hmac) throw new BadRequestException('Missing params');
    const secret = this.config.get<string>('ecommerceIntegrations.shopify.apiSecret') ?? '';
    const params = new URLSearchParams({ shop, code });
    const message = params.toString();
    const computed = crypto.createHmac('sha256', secret).update(message).digest('hex');
    if (computed !== hmac) throw new BadRequestException('Invalid HMAC');

    // Exchange code for access token
    const tokenUrl = `https://${shop}/admin/oauth/access_token`;
    const client_id = this.config.get<string>('ecommerceIntegrations.shopify.apiKey') ?? '';
    const client_secret = secret;
    const tokenResp = await axios.post(tokenUrl, { client_id, client_secret, code }, { timeout: 8000 });
    const accessToken = tokenResp.data?.access_token as string;
    if (!accessToken) throw new BadRequestException('Failed to obtain access token');

    // Persist store
    await this.prisma.shopifyStore.upsert({
      where: { shopDomain: shop },
      update: { accessToken },
      create: { shopDomain: shop, accessToken },
    });

    // Register default webhooks
    await this.shopifyIntegration.registerDefaultWebhooks(shop, accessToken);

    // Redirect to GraphQL (or app dashboard)
    res.redirect('/graphql');
  }
}
