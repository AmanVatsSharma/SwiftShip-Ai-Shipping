import { Injectable, Logger } from '@nestjs/common';
import { StructuredLogger } from '@swiftship/observability';
import { ChannelAdapter } from '../channel-adapter.interface';
import {
  ChannelOrder,
  ChannelReturn,
  PullOrdersRequest,
  PushTrackingRequest,
  SyncInventoryRequest,
  PullReturnsRequest,
} from '../channel.types';
import { MyntraAuthService } from '../myntra-auth.service';

/**
 * MyntraAdapter
 *
 * Integration with the Myntra Partner API.
 * Handles order pulls, tracking push, inventory sync, and returns reconciliation.
 *
 * API Base: https://api.myntra.com
 * Auth: Bearer token (per partner) — see MyntraAuthService.
 *
 * STUBBED IMPLEMENTATION:
 * - HTTP calls return synthetic data
 * - Myntra is a luxury-fashion channel — typical orders are high-AOV,
 *   single-item purchases
 * - Inventory sync uses the Partner Inventory Feed (CSV) — not yet implemented
 * - Returns are stubbed with synthetic data
 */
@Injectable()
export class MyntraAdapter implements ChannelAdapter {
  public readonly code = 'MYNTRA' as const;

  private readonly log = new StructuredLogger();
  private readonly nestLog = new Logger(MyntraAdapter.name);
  private readonly baseUrl = 'https://api.myntra.com';

  constructor(private readonly auth: MyntraAuthService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config('MYNTRA_API_KEY') && this.config('MYNTRA_PARTNER_ID'),
    );
  }

  // ---- pullOrders
  async pullOrders(input: PullOrdersRequest): Promise<ChannelOrder[]> {
    this.nestLog.log(`Pulling Myntra orders for tenant ${input.tenantId}`);
    const path = '/orders/v1/search';
    const queryParams = new URLSearchParams();
    if (input.createdAfter) queryParams.set('from_date', input.createdAfter);
    if (input.lastUpdatedAfter) queryParams.set('to_date', input.lastUpdatedAfter);
    if (input.marketplaceId) queryParams.set('marketplaceId', input.marketplaceId);
    if (input.pageSize) queryParams.set('pageSize', String(input.pageSize));
    if (input.nextToken) queryParams.set('nextToken', input.nextToken);
    void path;
    void queryParams;

    const now = new Date().toISOString();
    return [
      {
        externalOrderId: 'MNR987654',
        channelCode: this.code,
        status: 'CONFIRMED',
        createdAt: now,
        updatedAt: now,
        shippingAddress: {
          name: 'Aanya Iyer',
          phone: '+919900112233',
          line1: '12, Indiranagar 100ft Road',
          line2: 'Above Third Wave Coffee',
          city: 'Bangalore',
          state: 'Karnataka',
          postalCode: '560038',
          country: 'IN',
        },
        customer: {
          externalId: 'MNR-CUST-001',
          name: 'Aanya Iyer',
          email: 'aanya.iyer@example.com',
          phone: '+919900112233',
        },
        items: [
          {
            sku: 'SKU-MYN-LUX-001',
            title: 'Designer Silk Saree',
            quantity: 1,
            unitPrice: 1499900,
            hsn: '5007',
          },
        ],
        currency: 'INR',
        total: 1499900,
      },
    ];
  }

  // ---- pushTracking
  async pushTracking(input: PushTrackingRequest): Promise<void> {
    this.nestLog.log(
      `Pushing tracking to Myntra for tenant ${input.tenantId}, order ${input.externalOrderId}`,
    );
    const body = {
      order_id: input.externalOrderId,
      awb_number: input.trackingNumber,
      courier_name: input.carrierCode,
    };
    await this.request(
      'POST',
      `/orders/${input.externalOrderId}/dispatch`,
      body,
    );
  }

  async syncInventory(_input: SyncInventoryRequest): Promise<void> {
    throw new Error(
      'Myntra inventory via Partner Inventory Feed; not yet implemented',
    );
  }

  async pullReturns(_input: PullReturnsRequest): Promise<ChannelReturn[]> {
    this.nestLog.log(`Pulling Myntra returns for tenant ${_input.tenantId}`);
    const now = new Date().toISOString();
    return [
      {
        externalReturnId: 'MNRRET-2001',
        externalOrderId: 'MNR200200',
        channelCode: this.code,
        status: 'RETURNED',
        reason: 'size_issue',
        createdAt: now,
        updatedAt: now,
        items: [{ sku: 'SKU-MYN-LUX-001', quantity: 1 }],
      },
    ];
  }

  // ===========================================================
  // private
  // ===========================================================

  private async request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<{ success: boolean; method: string; url: string; timestamp: string }> {
    const url = `${this.baseUrl}${path}`;
    const headers = await this.auth.getAuthHeaders('stub-tenant');
    this.nestLog.debug(`${method} ${url}`);
    this.log.info('myntra.request', { method, url, headers, body });
    return {
      success: true,
      method,
      url,
      timestamp: new Date().toISOString(),
    };
  }

  private config(key: string): string | undefined {
    return process.env[key];
  }
}
