import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
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
import { FlipkartAuthService } from '../flipkart-auth.service';

/**
 * FlipkartAdapter
 *
 * Integration with the Flipkart Seller API (also known as Flipkart Marketplace API).
 * Handles order pulls, tracking push, inventory sync, and returns reconciliation.
 *
 * API Base: https://api.flipkart.net
 * Auth: OAuth 1.0 (HMAC-SHA1) — see FlipkartAuthService.
 *
 * STUBBED IMPLEMENTATION:
 * - HTTP calls return synthetic data
 * - OAuth signing is mocked (see FlipkartAuthService)
 * - Inventory sync and returns are not yet implemented
 */
@Injectable()
export class FlipkartAdapter implements ChannelAdapter {
  public readonly code = 'FLIPKART' as const;

  private readonly log = new StructuredLogger();
  private readonly nestLog = new Logger(FlipkartAdapter.name);
  private readonly baseUrl = 'https://api.flipkart.net';

  constructor(private readonly auth: FlipkartAuthService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config('FLIPKART_APP_ID') &&
        this.config('FLIPKART_APP_SECRET') &&
        this.config('FLIPKART_SELLER_ID'),
    );
  }

  // ---- pullOrders
  async pullOrders(input: PullOrdersRequest): Promise<ChannelOrder[]> {
    this.nestLog.log(`Pulling Flipkart orders for tenant ${input.tenantId}`);

    const path = '/sellers/v2/orders/search';
    const queryParams = new URLSearchParams();
    if (input.createdAfter) queryParams.set('orderDateFrom', input.createdAfter);
    if (input.lastUpdatedAfter)
      queryParams.set('orderDateTo', input.lastUpdatedAfter);
    if (input.marketplaceId) queryParams.set('marketplaceId', input.marketplaceId);
    if (input.pageSize) queryParams.set('pageSize', String(input.pageSize));
    if (input.nextToken) queryParams.set('nextToken', input.nextToken);

    // STUB: return synthetic order data shaped like Flipkart's
    const now = new Date().toISOString();
    const synthetic = [
      {
        orderId: 'OD0123456789',
        orderDate: now,
        status: 'APPROVED',
        customer: {
          externalId: 'FK-CUST-001',
          name: 'Rajesh Kumar',
          email: 'rajesh.kumar@example.com',
          phone: '+919876543210',
        },
        shippingAddress: {
          name: 'Rajesh Kumar',
          phone: '+919876543210',
          line1: '123, MG Road',
          line2: 'Near Metro Station',
          city: 'Bangalore',
          state: 'Karnataka',
          postalCode: '560001',
          country: 'IN',
        },
        items: [
          {
            sku: 'FK-SKU-001',
            title: 'Wireless Headphones',
            quantity: 1,
            unitPrice: 249900,
            tax: 0,
            discount: 0,
            hsn: '8518',
          },
        ],
        total: 249900,
        currency: 'INR',
      },
    ];

    void path;
    void queryParams;
    return synthetic.map((o) => this.toChannelOrder(o));
  }

  // ---- pushTracking
  async pushTracking(input: PushTrackingRequest): Promise<void> {
    this.nestLog.log(
      `Pushing tracking to Flipkart for tenant ${input.tenantId}, order ${input.externalOrderId}`,
    );

    const body = {
      orderId: input.externalOrderId,
      awbNumber: input.trackingNumber,
      courierName: input.carrierCode,
    };
    await this.request('POST', '/sellers/v2/orders/shipment/dispatch', body);
  }

  async syncInventory(_input: SyncInventoryRequest): Promise<void> {
    throw new NotImplementedException(
      'Flipkart inventory sync uses the Flipkart Listing API; not yet implemented',
    );
  }

  async pullReturns(_input: PullReturnsRequest): Promise<ChannelReturn[]> {
    throw new NotImplementedException(
      'Flipkart returns via the Seller API; not yet implemented',
    );
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
    this.log.info('flipkart.request', { method, url, headers, body });
    return {
      success: true,
      method,
      url,
      timestamp: new Date().toISOString(),
    };
  }

  private toChannelOrder(o: {
    orderId: string;
    orderDate: string;
    status: string;
    customer: {
      externalId: string;
      name: string;
      email: string;
      phone: string;
    };
    shippingAddress: {
      name: string;
      phone: string;
      line1: string;
      line2?: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
    items: Array<{
      sku: string;
      title: string;
      quantity: number;
      unitPrice: number;
      tax?: number;
      discount?: number;
      hsn?: string;
    }>;
    total: number;
    currency: string;
  }): ChannelOrder {
    return {
      externalOrderId: o.orderId,
      channelCode: this.code,
      status: o.status,
      createdAt: o.orderDate,
      updatedAt: o.orderDate,
      shippingAddress: {
        name: o.shippingAddress.name,
        phone: o.shippingAddress.phone,
        line1: o.shippingAddress.line1,
        line2: o.shippingAddress.line2,
        city: o.shippingAddress.city,
        state: o.shippingAddress.state,
        postalCode: o.shippingAddress.postalCode,
        country: o.shippingAddress.country,
      },
      customer: {
        externalId: o.customer.externalId,
        name: o.customer.name,
        email: o.customer.email,
        phone: o.customer.phone,
      },
      items: o.items.map((i) => ({
        sku: i.sku,
        title: i.title,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        tax: i.tax,
        discount: i.discount,
        hsn: i.hsn,
      })),
      currency: o.currency,
      total: o.total,
      raw: o,
    };
  }

  private config(key: string): string | undefined {
    return process.env[key];
  }
}
