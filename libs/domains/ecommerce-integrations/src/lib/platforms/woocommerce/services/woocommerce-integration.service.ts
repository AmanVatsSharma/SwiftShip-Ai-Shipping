import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

/**
 * WooCommerce Integration Service
 * 
 * Handles WooCommerce store connection and management.
 * 
 * Features:
 * - Store connection via OAuth 1.0a
 * - Store verification
 * - Store management
 * 
 * Flow:
 * 1. User provides store URL and API credentials
 * 2. Service verifies credentials
 * 3. Store is saved to database
 * 4. Store can be used for order/product sync
 * 
 * Error Handling:
 * - Validates store URL format
 * - Verifies API credentials
 * - Handles WooCommerce API errors
 * - Comprehensive logging
 */
@Injectable()
export class WooCommerceIntegrationService {
  private readonly logger = new Logger(WooCommerceIntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Connect a WooCommerce store
   * @param userId - User ID
   * @param storeUrl - WooCommerce store URL
   * @param consumerKey - WooCommerce consumer key
   * @param consumerSecret - WooCommerce consumer secret
   * @returns Created store record
   */
  async connectStore(
    userId: number,
    storeUrl: string,
    consumerKey: string,
    consumerSecret: string,
  ) {
    this.logger.log('Connecting WooCommerce store', {
      userId,
      storeUrl,
      hasConsumerKey: !!consumerKey,
      hasConsumerSecret: !!consumerSecret,
    });

    // Validate store URL
    const normalizedUrl = this.normalizeStoreUrl(storeUrl);
    if (!normalizedUrl) {
      throw new BadRequestException('Invalid store URL format');
    }

    // Verify credentials
    await this.verifyCredentials(normalizedUrl, consumerKey, consumerSecret);

    // Check if store already exists
    const existingStore = await this.prisma.wooCommerceStore.findUnique({
      where: { storeUrl: normalizedUrl },
    });

    if (existingStore) {
      throw new BadRequestException('Store is already connected');
    }

    // Create store record
    const store = await this.prisma.wooCommerceStore.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        storeUrl: normalizedUrl,
        consumerKey,
        consumerSecret,
        connectedAt: new Date(),
      },
    });

    this.logger.log('WooCommerce store connected', {
      storeId: store.id,
      storeUrl: normalizedUrl,
    });

    return store;
  }

  /**
   * Get store by ID
   */
  async getStore(storeId: string, userId: number) {
    const store = await this.prisma.wooCommerceStore.findUnique({
      where: { id: storeId },
    });

    if (!store) {
      throw new NotFoundException(`Store with ID ${storeId} not found`);
    }

    if (store.userId !== userId) {
      throw new BadRequestException('Store does not belong to user');
    }

    return store;
  }

  /**
   * Get all stores for a user
   */
  async getStoresByUser(userId: number) {
    return this.prisma.wooCommerceStore.findMany({
      where: { userId },
      orderBy: { connectedAt: 'desc' },
    });
  }

  /**
   * Disconnect a store
   */
  async disconnectStore(storeId: string, userId: number) {
    const store = await this.getStore(storeId, userId);

    await this.prisma.wooCommerceStore.delete({
      where: { id: storeId },
    });

    this.logger.log('WooCommerce store disconnected', {
      storeId,
      storeUrl: store.storeUrl,
    });

    return { success: true };
  }

  /**
   * Verify WooCommerce API credentials
   */
  private async verifyCredentials(
    storeUrl: string,
    consumerKey: string,
    consumerSecret: string,
  ): Promise<void> {
    try {
      const apiUrl = `${storeUrl}/wp-json/wc/v3/system_status`;
      const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

      const response = await firstValueFrom(
        this.httpService.get(apiUrl, {
          headers: {
            Authorization: `Basic ${auth}`,
          },
          timeout: 10000,
        })
      );

      if (response.status !== 200) {
        throw new Error('Failed to verify credentials');
      }

      this.logger.log('WooCommerce credentials verified', { storeUrl });
    } catch (error: any) {
      this.logger.error('Failed to verify WooCommerce credentials', {
        storeUrl,
        error: error?.response?.data || error?.message || 'Unknown error',
      });

      if (error?.response?.status === 401) {
        throw new BadRequestException('Invalid API credentials');
      }

      throw new BadRequestException('Failed to verify store credentials');
    }
  }

  /**
   * Normalize store URL
   */
  private normalizeStoreUrl(url: string): string | null {
    try {
      // Remove trailing slash
      let normalized = url.trim().replace(/\/+$/, '');

      // Add https:// if no protocol
      if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
        normalized = `https://${normalized}`;
      }

      // Validate URL
      const urlObj = new URL(normalized);
      if (!urlObj.hostname) {
        return null;
      }

      return normalized;
    } catch {
      return null;
    }
  }
}
