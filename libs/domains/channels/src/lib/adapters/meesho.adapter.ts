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
import { MeeshoAuthService } from '../meesho-auth.service';

/**
 * MeeshoAdapter
 *
 * Integration with the Meesho Supplier Panel API.
 * Handles order pulls, tracking push, inventory sync, and returns reconciliation.
 *
 * API Base: https://supplier.meesho.com
 * Auth: Bearer token (per supplier) — see MeeshoAuthService.
 *
 * STUBBED IMPLEMENTATION:
 * - HTTP calls return synthetic data
 * - Meesho orders are characteristically bulk (single SKU per order, large qty)
 * - Inventory sync uses bulk CSV upload — not yet implemented
 * - Returns are stubbed with synthetic data
 */
@Injectable()
export class MeeshoAdapter implements ChannelAdapter {
  public readonly code = 'MEESHO' as const;

  private readonly log = new StructuredLogger();
  private readonly nestLog = new Logger(MeeshoAdapter.name);
  private readonly baseUrl = 'https://supplier.meesho.com';

  constructor(private readonly auth: MeeshoAuthService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config('MEESHO_API_KEY') && this.config('MEESHO_SUPPLIER_ID'),
    );
  }

  // ---- pullOrders
  async pullOrders(input: PullOrdersRequest): Promise<ChannelOrder[]> {
    this.nestLog.log(`Pulling Meesho orders for tenant ${input.tenantId}`);
    const path = '/orders/v2/orders';
    const queryParams = new URLSearchParams();
    if (input.createdAfter) queryParams.set('from_date', input.createdAfter);
    if (input.lastUpdatedAfter) queryParams.set('to_date', input.lastUpdatedAfter);
    if (input.marketplaceId) queryParams.set('marketplaceId', input.marketplaceId);
    if (input.pageSize) queryParams.set('pageSize', String(input.pageSize));
    if (input.nextToken) queryParams.set('nextToken', input.nextToken);
    void path;
    void queryParams;

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const orders: ChannelOrder[] = [
      {
        externalOrderId: 'MSH123456',
        channelCode: this.code,
        status: 'READY_TO_DISPATCH',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        shippingAddress: {
          name: 'Priya Sharma',
          phone: '+919812345670',
          line1: '45, Lajpat Nagar',
          line2: 'Near Central Market',
          city: 'New Delhi',
          state: 'Delhi',
          postalCode: '110024',
          country: 'IN',
        },
        customer: {
          externalId: 'MSH-CUST-001',
          name: 'Priya Sharma',
          email: 'priya.sharma@example.com',
          phone: '+919812345670',
        },
        items: [
          {
            sku: 'SKU-MESH-001',
            title: 'Cotton Kurti (Bulk Pack)',
            quantity: 5,
            unitPrice: 49900,
            hsn: '6104',
          },
        ],
        currency: 'INR',
        total: 249500,
      },
      {
        externalOrderId: 'MSH789012',
        channelCode: this.code,
        status: 'READY_TO_DISPATCH',
        createdAt: yesterday.toISOString(),
        updatedAt: yesterday.toISOString(),
        shippingAddress: {
          name: 'Anita Verma',
          phone: '+919876543211',
          line1: '78, Park Street',
          line2: 'Near Saloon Junction',
          city: 'Kolkata',
          state: 'West Bengal',
          postalCode: '700016',
          country: 'IN',
        },
        customer: {
          externalId: 'MSH-CUST-002',
          name: 'Anita Verma',
          email: 'anita.verma@example.com',
          phone: '+919876543211',
        },
        items: [
          {
            sku: 'SKU-MESH-002',
            title: 'Designer Saree (Bulk Pack)',
            quantity: 3,
            unitPrice: 89900,
            hsn: '5407',
          },
        ],
        currency: 'INR',
        total: 269700,
      },
    ];
    return orders;
  }

  // ---- pushTracking
  async pushTracking(input: PushTrackingRequest): Promise<void> {
    this.nestLog.log(
      `Pushing tracking to Meesho for tenant ${input.tenantId}, order ${input.externalOrderId}`,
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
      'Meesho inventory sync uses bulk upload files; not yet implemented',
    );
  }

  async pullReturns(_input: PullReturnsRequest): Promise<ChannelReturn[]> {
    this.nestLog.log(`Pulling Meesho returns for tenant ${_input.tenantId}`);
    const now = new Date().toISOString();
    return [
      {
        externalReturnId: 'MSHRET-1001',
        externalOrderId: 'MSH100100',
        channelCode: this.code,
        status: 'RETURNED',
        reason: 'return_request',
        createdAt: now,
        updatedAt: now,
        items: [{ sku: 'SKU-MESH-001', quantity: 1 }],
      },
      {
        externalReturnId: 'MSHRET-1002',
        externalOrderId: 'MSH100102',
        channelCode: this.code,
        status: 'RETURNED',
        reason: 'return_request',
        createdAt: now,
        updatedAt: now,
        items: [{ sku: 'SKU-MESH-002', quantity: 1 }],
      },
      {
        externalReturnId: 'MSHRET-1003',
        externalOrderId: 'MSH100103',
        channelCode: this.code,
        status: 'RETURNED',
        reason: 'return_request',
        createdAt: now,
        updatedAt: now,
        items: [{ sku: 'SKU-MESH-001', quantity: 2 }],
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
    this.log.info('meesho.request', { method, url, headers, body });
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
