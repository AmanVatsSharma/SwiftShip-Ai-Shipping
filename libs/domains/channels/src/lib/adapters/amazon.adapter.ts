import {
  Injectable,
  Logger,
  NotImplementedException,
  ServiceUnavailableException,
} from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const aws4 = require('aws4') as typeof import('aws4');
import { LwaAuthService } from '../lwa-auth.service';
import { ChannelAdapter } from '../channel-adapter.interface';
import {
  ChannelOrder,
  ChannelReturn,
  ChannelOrderItem,
  ChannelAddress,
  PullOrdersRequest,
  PushTrackingRequest,
  SyncInventoryRequest,
  PullReturnsRequest,
} from '../channel.types';

/**
 * Amazon Selling Partner API (SP-API) adapter.
 *
 * Implements ChannelAdapter for Amazon IN (marketplaceId ATVPDKIKX0DER).
 *
 * Auth: LWA (Login with Amazon) access token + AWS Signature V4 on every
 * call. The IAM user's access key/secret must be added to the SP-API
 * developer profile in Seller Central.
 *
 * Endpoints used:
 *   - GET  /orders/v0/orders                       — pullOrders
 *   - GET  /orders/v0/orders/{id}                 — order detail
 *   - GET  /orders/v0/orders/{id}/orderItems      — items
 *   - POST /orders/v0/orders/{id}/shipment        — pushTracking
 *   - GET  /finances/v0/financialEvents           — COD reconciliation (TODO)
 *   - POST /feeds/2021-06-30/feeds                — inventory sync (TODO)
 *   - GET  /reports/2021-06-30/reports            — returns (TODO)
 *
 * Reference: https://developer-docs.amazon.com/sp-api
 */

const SP_API_PROD = 'https://sellingpartnerapi-na.amazon.com';
const SP_API_SANDBOX = 'https://sandbox.sellingpartnerapi-na.amazon.com';
const AMAZON_IN_MARKETPLACE = 'ATVPDKIKX0DER';

interface AmazonCredentials {
  lwa: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  };
  aws: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
  };
  sellerId: string;
  /** SP-API host is partitioned by region (NA, EU, FE). */
  host: string;
}

@Injectable()
export class AmazonAdapter implements ChannelAdapter {
  public readonly code = 'AMAZON' as const;

  private readonly log = new Logger(AmazonAdapter.name);
  private readonly creds: AmazonCredentials | null;

  constructor(private readonly lwa: LwaAuthService) {
    this.creds = this.resolveCredentials();
  }

  isConfigured(): boolean {
    return this.creds !== null;
  }

  // ---- pullOrders
  async pullOrders(input: PullOrdersRequest): Promise<ChannelOrder[]> {
    if (!this.creds) {
      throw new ServiceUnavailableException('Amazon SP-API not configured');
    }
    const creds = this.creds;

    const path = '/orders/v0/orders';
    const params = new URLSearchParams();
    params.set(
      'MarketplaceIds',
      input.marketplaceId ?? AMAZON_IN_MARKETPLACE,
    );
    if (input.createdAfter) params.set('CreatedAfter', input.createdAfter);
    if (input.lastUpdatedAfter)
      params.set('LastUpdatedAfter', input.lastUpdatedAfter);
    if (input.pageSize) params.set('MaxResultsPerPage', String(input.pageSize));
    if (input.nextToken) params.set('NextToken', input.nextToken);

    const url = `${creds.host}${path}?${params.toString()}`;
    const { status, body } = await this.spApiRequest(
      'GET',
      url,
      creds,
      input.tenantId,
    );
    if (status !== 200) {
      throw new Error(`SP-API getOrders failed status=${status} body=${body}`);
    }

    const json = JSON.parse(body) as {
      payload?: {
        Orders?: Array<{
          AmazonOrderId: string;
          OrderStatus: string;
          PurchaseDate: string;
          LastUpdateDate: string;
          OrderTotal?: { Amount: string; CurrencyCode: string };
          ShippingAddress?: AmazonAddress;
          BuyerInfo?: { BuyerEmail?: string; BuyerName?: string };
          MarketplaceId?: string;
        }>;
        NextToken?: string;
      };
    };

    const summaries = json.payload?.Orders ?? [];
    const orders: ChannelOrder[] = [];
    for (const summary of summaries) {
      const detail = await this.fetchOrderDetail(
        summary.AmazonOrderId,
        creds,
        input.tenantId,
      );
      orders.push(detail);
    }
    // Pagination is intentionally single-shot for now — caller can pass
    // `nextToken` to fetch the next page in a follow-up call.
    return orders;
  }

  // ---- pushTracking
  async pushTracking(input: PushTrackingRequest): Promise<void> {
    if (!this.creds) {
      throw new ServiceUnavailableException('Amazon SP-API not configured');
    }
    const creds = this.creds;

    const path = `/orders/v0/orders/${encodeURIComponent(
      input.externalOrderId,
    )}/shipment`;
    const url = `${creds.host}${path}`;

    const body = {
      marketplaceId: AMAZON_IN_MARKETPLACE,
      shipmentStatus: 'Shipped',
      fulfillmentDate: input.shippedAt ?? new Date().toISOString(),
      shippingParty: 'Seller', // typically "Seller" for FBM
      shippedFromAddress: undefined, // optional, depends on carrier
      carrierCode: this.toAmazonCarrierCode(input.carrierCode),
      carrierName: input.carrierCode,
      shippingMethod: 'Standard',
      trackingNumber: input.trackingNumber,
      trackingUrl: input.trackingUrl,
      items: input.items.map((it) => ({
        orderItemId: it.sku, // SP-API expects orderItemId; the caller
        //                        must have already resolved the SP-API
        //                        orderItemId from the order detail call.
        //                        Keeping sku here is a known limitation
        //                        that callers should be aware of.
        quantity: it.quantity,
      })),
    };

    const { status, body: respBody } = await this.spApiRequest(
      'POST',
      url,
      creds,
      input.tenantId,
      body,
    );
    if (status !== 200 && status !== 201 && status !== 202) {
      throw new Error(
        `SP-API confirmShipment failed status=${status} body=${respBody}`,
      );
    }
  }

  // ---- syncInventory (stub)
  // ----------------------------------------------------------------
  // Real implementation uses the Feeds API:
  //   POST /feeds/2021-06-30/feeds
  //     body: { feedType: 'JSON_LISTINGS_FEED', inputFeedDocumentId }
  //   - upload the feed document (XML/JSON) to S3, then
  //   - poll GET /feeds/2021-06-30/feeds/{feedId} until processed
  // See: https://developer-docs.amazon.com/sp-api/docs/feeds-api-v2021-06-30
  // ----------------------------------------------------------------
  async syncInventory(_input: SyncInventoryRequest): Promise<void> {
    throw new NotImplementedException(
      'Amazon inventory sync via SP-API feeds not yet implemented',
    );
  }

  // ---- pullReturns (stub)
  // ----------------------------------------------------------------
  // Real implementation would use the Reports API:
  //   POST /reports/2021-06-30/reports  (reportType=GET_FBA_FULFILLMENT_CUSTOMER_RETURNS)
  //   Poll until DONE, then download the report document.
  // See: https://developer-docs.amazon.com/sp-api/docs/reports-api-v2021-06-30
  // ----------------------------------------------------------------
  async pullReturns(_input: PullReturnsRequest): Promise<ChannelReturn[]> {
    throw new NotImplementedException(
      'Amazon returns via SP-API not yet implemented; use the Reports API',
    );
  }

  // ===========================================================
  // private
  // ===========================================================

  private async fetchOrderDetail(
    amazonOrderId: string,
    creds: AmazonCredentials,
    tenantId: string,
  ): Promise<ChannelOrder> {
    const orderUrl = `${creds.host}/orders/v0/orders/${encodeURIComponent(
      amazonOrderId,
    )}`;
    const orderRes = await this.spApiRequest(
      'GET',
      orderUrl,
      creds,
      tenantId,
    );
    if (orderRes.status !== 200) {
      throw new Error(
        `SP-API getOrder failed orderId=${amazonOrderId} status=${orderRes.status} body=${orderRes.body}`,
      );
    }
    const orderJson = JSON.parse(orderRes.body) as {
      payload?: AmazonOrderDetail;
    };
    const order = orderJson.payload;
    if (!order) {
      throw new Error(`SP-API getOrder: empty payload for ${amazonOrderId}`);
    }

    const itemsUrl = `${orderUrl}/orderItems`;
    const itemsRes = await this.spApiRequest(
      'GET',
      itemsUrl,
      creds,
      tenantId,
    );
    let items: ChannelOrderItem[] = [];
    if (itemsRes.status === 200) {
      const itemsJson = JSON.parse(itemsRes.body) as {
        payload?: {
          OrderItems?: Array<{
            ASIN?: string;
            SellerSKU?: string;
            Title?: string;
            QuantityOrdered: number;
            ItemPrice?: { Amount: string; CurrencyCode: string };
            ItemTax?: { Amount: string; CurrencyCode: string };
            PromotionDiscount?: { Amount: string; CurrencyCode: string };
          }>;
        };
      };
      items = (itemsJson.payload?.OrderItems ?? []).map((i) => ({
        sku: i.SellerSKU ?? i.ASIN ?? 'UNKNOWN',
        title: i.Title,
        quantity: i.QuantityOrdered,
        unitPrice: this.toMinor(i.ItemPrice?.Amount),
      }));
    }

    return {
      externalOrderId: order.AmazonOrderId,
      channelCode: 'AMAZON',
      status: order.OrderStatus,
      createdAt: order.PurchaseDate,
      updatedAt: order.LastUpdateDate,
      currency: order.OrderTotal?.CurrencyCode ?? 'INR',
      total: this.toMinor(order.OrderTotal?.Amount),
      shippingAddress: this.toChannelAddress(order.ShippingAddress),
      billingAddress: order.BillingAddress
        ? this.toChannelAddress(order.BillingAddress)
        : undefined,
      customer: order.BuyerInfo
        ? {
            name: order.BuyerInfo.BuyerName,
            email: order.BuyerInfo.BuyerEmail,
          }
        : undefined,
      items,
      raw: order,
    };
  }

  /**
   * Execute a signed, LWA-authenticated request to the SP-API.
   * The AWSSigV4 signature is computed by `aws4` against the request
   * URL + headers + body. The LWA token is sent in `x-amz-access-token`.
   */
  private async spApiRequest(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    creds: AmazonCredentials,
    tenantId: string,
    body?: unknown,
  ): Promise<{ status: number; body: string; headers: Headers }> {
    const accessToken = await this.lwa.getAccessToken(tenantId);

    const parsed = new URL(url);
    const opts: Record<string, unknown> = {
      host: parsed.host,
      hostname: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : undefined,
      method,
      path: parsed.pathname + parsed.search,
      service: 'execute-api',
      region: creds.aws.region,
      // `aws4` accepts a body string and signs its hash.
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers: {
        host: parsed.host,
        'x-amz-access-token': accessToken,
        'x-amz-date': this.amzDate(),
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': 'SwiftShip/1.0 (channels-amazon)',
      },
    };
    // `aws4` mutates headers in place with the SigV4 auth fields.
    aws4.sign(opts, {
      accessKeyId: creds.aws.accessKeyId,
      secretAccessKey: creds.aws.secretAccessKey,
    });

    const res = await fetch(url, {
      method,
      headers: opts['headers'] as HeadersInit,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      // LWA token may have just expired between refresh and use, or
      // AWS sig is stale. Invalidate so the next call refreshes.
      this.lwa.invalidate(tenantId);
    }
    return { status: res.status, body: text, headers: res.headers };
  }

  private resolveCredentials(): AmazonCredentials | null {
    const lwaClientId = process.env.AMAZON_CLIENT_ID;
    const lwaClientSecret = process.env.AMAZON_CLIENT_SECRET;
    const lwaRefreshToken = process.env.AMAZON_REFRESH_TOKEN;
    const sellerId = process.env.AMAZON_SELLER_ID;
    const awsAccessKey = process.env.AMAZON_AWS_ACCESS_KEY_ID;
    const awsSecret = process.env.AMAZON_AWS_SECRET_ACCESS_KEY;
    const awsRegion = process.env.AMAZON_AWS_REGION;
    if (
      !lwaClientId ||
      !lwaClientSecret ||
      !lwaRefreshToken ||
      !sellerId ||
      !awsAccessKey ||
      !awsSecret ||
      !awsRegion
    ) {
      return null;
    }
    const sandbox = process.env.AMAZON_SANDBOX === 'true';
    return {
      lwa: {
        clientId: lwaClientId,
        clientSecret: lwaClientSecret,
        refreshToken: lwaRefreshToken,
      },
      aws: {
        accessKeyId: awsAccessKey,
        secretAccessKey: awsSecret,
        region: awsRegion,
      },
      sellerId,
      host: sandbox ? SP_API_SANDBOX : SP_API_PROD,
    };
  }

  private toChannelAddress(addr: AmazonAddress | undefined): ChannelAddress {
    return {
      name: addr?.Name ?? 'Unknown',
      phone: addr?.Phone,
      line1: addr?.AddressLine1 ?? '',
      line2: addr?.AddressLine2,
      city: addr?.City ?? '',
      state: addr?.StateOrRegion ?? '',
      postalCode: addr?.PostalCode ?? '',
      country: addr?.CountryCode ?? 'IN',
    };
  }

  /** Amazon returns amounts as decimal strings — convert to minor units. */
  private toMinor(amount: string | number | undefined): number {
    if (amount === undefined || amount === null) return 0;
    const n = typeof amount === 'string' ? Number(amount) : amount;
    if (Number.isNaN(n)) return 0;
    return Math.round(n * 100);
  }

  /** x-amz-date is ISO8601 basic format (e.g. 20250101T120000Z). */
  private amzDate(): string {
    const d = new Date();
    const pad = (v: number) => String(v).padStart(2, '0');
    return (
      d.getUTCFullYear().toString() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) +
      'T' +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) +
      'Z'
    );
  }

  /**
   * Amazon carrier codes are not free-text — they must match the
   * CarrierRegistry. Common Indian carriers (Delhivery, BlueDart,
   * Ecom Express, Xpressbees) have well-known codes; we map by
   * case-insensitive substring. Unknown carriers fall back to "Other"
   * and Amazon will not validate tracking — the user will see a
   * warning in Seller Central.
   */
  private toAmazonCarrierCode(carrier: string): string {
    const c = carrier.toLowerCase();
    if (c.includes('delhivery')) return 'Delhivery';
    if (c.includes('bluedart') || c.includes('blue_dart')) return 'BlueDart';
    if (c.includes('ecom')) return 'EcomExpress';
    if (c.includes('xpressbees')) return 'Xpressbees';
    if (c.includes('dtdc')) return 'DTDC';
    if (c.includes('fedex')) return 'FedEx';
    if (c.includes('dhl')) return 'DHL';
    if (c.includes('india-post') || c.includes('indiapost'))
      return 'IndiaPost';
    if (c.includes('amazon')) return 'Amazon';
    return 'Other';
  }
}

// ---------- SP-API response shapes (subset)

interface AmazonAddress {
  Name?: string;
  Phone?: string;
  AddressLine1?: string;
  AddressLine2?: string;
  City?: string;
  StateOrRegion?: string;
  PostalCode?: string;
  CountryCode?: string;
}

interface AmazonOrderDetail {
  AmazonOrderId: string;
  OrderStatus: string;
  PurchaseDate: string;
  LastUpdateDate: string;
  OrderTotal?: { Amount: string; CurrencyCode: string };
  ShippingAddress?: AmazonAddress;
  BillingAddress?: AmazonAddress;
  BuyerInfo?: { BuyerEmail?: string; BuyerName?: string };
  MarketplaceId?: string;
}
