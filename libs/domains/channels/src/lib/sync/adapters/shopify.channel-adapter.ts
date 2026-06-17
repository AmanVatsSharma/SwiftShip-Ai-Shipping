import { Injectable, Logger } from '@nestjs/common';
import { decryptJson } from '../credential-cipher';
import type { EcomChannelAdapter } from '../channel-adapter.interface';
import type {
  ChannelConnectionStatusReport,
  ChannelPushResult,
  ChannelWebhookRegistration,
  PulledOrder,
  PulledProduct,
  ShipmentPushPayload,
  TrackingPushPayload,
} from '../channel-sync.types';
import type { ChannelConnectionEntity } from '../channel-sync.entities';

/**
 * SS-026 — Shopify channel adapter.
 *
 * Wraps the Shopify Admin REST API. Talks to:
 *   - GET  /admin/api/2024-04/shop.json                              — testConnection
 *   - GET  /admin/api/2024-04/products.json?page_info=...            — pullProducts
 *   - GET  /admin/api/2024-04/orders.json?updated_at_min=...         — pullOrders
 *   - POST /admin/api/2024-04/orders/{id}/fulfillments.json         — pushShipment
 *   - POST /admin/api/2024-04/webhooks.json                          — registerWebhooks
 *
 * Credentials expected in the encrypted `credentials` blob:
 *   - shop       — the `*.myshopify.com` domain
 *   - accessToken — Admin API access token (or "shpca_..." custom-app token)
 *
 * The adapter is stateless — all per-connection state is loaded
 * from the entity row in the orchestrator and passed in.
 */
@Injectable()
export class ShopifyChannelAdapter implements EcomChannelAdapter {
  public readonly platform = 'shopify' as const;
  private readonly log = new Logger(ShopifyChannelAdapter.name);

  async testConnection(tenantId: number): Promise<ChannelConnectionStatusReport> {
    try {
      const creds = this.loadCreds(tenantId);
      const res = await this.shopifyFetch(tenantId, 'GET', '/admin/api/2024-04/shop.json');
      if (res.status !== 200) {
        return {
          ok: false,
          platform: this.platform,
          message: `Shopify /shop.json returned HTTP ${res.status}`,
        };
      }
      const json = JSON.parse(res.body) as { shop?: { name?: string; domain?: string } };
      return {
        ok: true,
        platform: this.platform,
        details: {
          shopName: json.shop?.name,
          shopDomain: json.shop?.domain ?? creds.shop,
        },
      };
    } catch (err) {
      return {
        ok: false,
        platform: this.platform,
        message: (err as Error).message,
      };
    }
  }

  async pullProducts(
    tenantId: number,
    cursor?: string,
  ): Promise<{ items: PulledProduct[]; nextCursor?: string | null }> {
    const path = cursor
      ? cursor
      : '/admin/api/2024-04/products.json?limit=50';
    const res = await this.shopifyFetch(tenantId, 'GET', path);
    if (res.status !== 200) {
      throw new Error(
        `Shopify pullProducts failed: HTTP ${res.status} body=${res.body.slice(0, 200)}`,
      );
    }
    const json = JSON.parse(res.body) as { products?: ShopifyProductRaw[] };
    const products = (json.products ?? []).map(toPulledProduct);
    return {
      items: products,
      nextCursor: extractNextPageInfo(res.headers.get('link') ?? ''),
    };
  }

  async pullOrders(
    tenantId: number,
    since: Date,
    cursor?: string,
  ): Promise<{ items: PulledOrder[]; nextCursor?: string | null }> {
    let path: string;
    if (cursor) {
      path = cursor;
    } else {
      const params = new URLSearchParams({
        updated_at_min: since.toISOString(),
        status: 'any',
        limit: '50',
      });
      path = `/admin/api/2024-04/orders.json?${params.toString()}`;
    }
    const res = await this.shopifyFetch(tenantId, 'GET', path);
    if (res.status !== 200) {
      throw new Error(
        `Shopify pullOrders failed: HTTP ${res.status} body=${res.body.slice(0, 200)}`,
      );
    }
    const json = JSON.parse(res.body) as { orders?: ShopifyOrderRaw[] };
    const orders = (json.orders ?? []).map(toPulledOrder);
    return {
      items: orders,
      nextCursor: extractNextPageInfo(res.headers.get('link') ?? ''),
    };
  }

  async pushShipment(
    tenantId: number,
    orderId: string,
    shipment: ShipmentPushPayload,
  ): Promise<ChannelPushResult> {
    try {
      const body = {
        fulfillment: {
          location_id: undefined,
          tracking_number: shipment.trackingNumber,
          tracking_company: shipment.carrier,
          tracking_url: shipment.trackingUrl,
          notify_customer: true,
          line_items: shipment.items.map((it) => ({
            sku: it.sku,
            quantity: it.quantity,
          })),
        },
      };
      const path = `/admin/api/2024-04/orders/${encodeURIComponent(orderId)}/fulfillments.json`;
      const res = await this.shopifyFetch(tenantId, 'POST', path, body);
      if (res.status < 200 || res.status >= 300) {
        return {
          ok: false,
          platform: this.platform,
          externalOrderId: orderId,
          message: `Shopify fulfillment creation failed: HTTP ${res.status} body=${res.body.slice(0, 200)}`,
        };
      }
      return {
        ok: true,
        platform: this.platform,
        externalOrderId: orderId,
        message: 'Fulfillment created',
      };
    } catch (err) {
      return {
        ok: false,
        platform: this.platform,
        externalOrderId: orderId,
        message: (err as Error).message,
      };
    }
  }

  async pushTracking(
    tenantId: number,
    orderId: string,
    tracking: TrackingPushPayload,
  ): Promise<ChannelPushResult> {
    // Shopify represents tracking updates as fulfillment events. The
    // simpler approach is to call /fulfillments/{id}/update_tracking.json
    // but the fulfillment id is platform-side. Without it, we update
    // by creating a new fulfillment-event payload — Shopify will
    // accept this as a tracking update for any matching order.
    try {
      const body = {
        fulfillment: {
          tracking_number: tracking.trackingNumber,
          tracking_company: tracking.carrier,
          tracking_url: tracking.trackingUrl,
          notify_customer: true,
        },
      };
      const path = `/admin/api/2024-04/orders/${encodeURIComponent(orderId)}/fulfillments.json`;
      const res = await this.shopifyFetch(tenantId, 'POST', path, body);
      if (res.status < 200 || res.status >= 300) {
        return {
          ok: false,
          platform: this.platform,
          externalOrderId: orderId,
          message: `Shopify tracking push failed: HTTP ${res.status} body=${res.body.slice(0, 200)}`,
        };
      }
      return {
        ok: true,
        platform: this.platform,
        externalOrderId: orderId,
        message: 'Tracking updated',
      };
    } catch (err) {
      return {
        ok: false,
        platform: this.platform,
        externalOrderId: orderId,
        message: (err as Error).message,
      };
    }
  }

  async registerWebhooks(
    tenantId: number,
    baseUrl: string,
  ): Promise<ChannelWebhookRegistration> {
    const topics = [
      'orders/create',
      'orders/updated',
      'orders/paid',
      'products/create',
      'products/update',
    ];
    const registered: Array<{ topic: string; callbackUrl: string }> = [];
    let ok = true;
    for (const topic of topics) {
      const url = `${baseUrl.replace(/\/$/, '')}/shopify/webhook?topic=${encodeURIComponent(topic)}`;
      try {
        const res = await this.shopifyFetch(tenantId, 'POST', '/admin/api/2024-04/webhooks.json', {
          webhook: { topic, address: url, format: 'json' },
        });
        if (res.status === 201 || res.status === 200) {
          registered.push({ topic, callbackUrl: url });
        } else if (res.status === 422) {
          // Already registered — treat as ok.
          registered.push({ topic, callbackUrl: url });
        } else {
          ok = false;
        }
      } catch {
        ok = false;
      }
    }
    return {
      ok,
      platform: this.platform,
      registered,
      message: ok ? 'All webhooks registered' : 'Some webhooks failed to register',
    };
  }

  // -----------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------

  /**
   * Tiny shim — looks up the active connection for `tenantId` on the
   * Shopify platform and decrypts its credentials. In a real wiring
   * the orchestrator passes the entity row in directly. For this
   * adapter we keep the surface identical to the marketplace-side
   * adapters (which receive `tenantId`) and load creds via the
   * service-layer registry. The orchestrator currently calls
   * `adapter.testConnection(tenantId)` etc. — to bridge the gap, we
   * cache the most recent connection row in a static `Map` for the
   * duration of a request. The cleaner approach (pass the row in) is
   * left for SS-027.
   */
  private static _registry: Map<number, ChannelConnectionEntity> = new Map();

  static _register(tenantId: number, row: ChannelConnectionEntity): void {
    ShopifyChannelAdapter._registry.set(tenantId, row);
  }

  static _unregister(tenantId: number): void {
    ShopifyChannelAdapter._registry.delete(tenantId);
  }

  private loadCreds(tenantId: number): { shop: string; accessToken: string } {
    const row = ShopifyChannelAdapter._registry.get(tenantId);
    if (!row) {
      throw new Error(
        `ShopifyChannelAdapter: no connection registered for tenant ${tenantId}`,
      );
    }
    return decryptJson(row.credentials) as { shop: string; accessToken: string };
  }

  private async shopifyFetch(
    tenantId: number,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<{ status: number; body: string; headers: Headers }> {
    const creds = this.loadCreds(tenantId);
    const base = `https://${creds.shop}`;
    const url = path.startsWith('http') ? path : `${base}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'X-Shopify-Access-Token': creds.accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text, headers: res.headers };
  }
}

// ---------- Shopify JSON shapes (subset)

interface ShopifyProductRaw {
  id: number;
  title: string;
  body_html?: string;
  variants?: Array<{
    sku?: string;
    price?: string;
    inventory_quantity?: number;
  }>;
  images?: Array<{ src: string }>;
  status?: string;
}

interface ShopifyOrderRaw {
  id: number;
  name: string;
  order_number: number;
  created_at: string;
  updated_at: string;
  financial_status?: string;
  fulfillment_status?: string | null;
  currency: string;
  total_price: string;
  subtotal_price?: string;
  total_tax?: string;
  total_discounts?: string;
  total_shipping_price_set?: { shop_money?: { amount: string; currency_code: string } };
  customer?: { id?: number; email?: string; first_name?: string; last_name?: string; phone?: string };
  shipping_address?: ShopifyAddressRaw;
  billing_address?: ShopifyAddressRaw;
  line_items?: Array<{
    id?: number;
    sku?: string;
    title?: string;
    quantity: number;
    price: string;
  }>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ShopifyAddressRaw {
  name?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  zip?: string;
  country_code?: string;
}

// ---------- mappers

function toPulledProduct(p: ShopifyProductRaw): PulledProduct {
  const firstVariant = p.variants?.[0];
  return {
    externalId: String(p.id),
    sku: firstVariant?.sku,
    title: p.title,
    description: p.body_html,
    price:
      firstVariant?.price !== undefined
        ? { amount: Number(firstVariant.price), currency: 'INR' }
        : undefined,
    inventory: firstVariant?.inventory_quantity,
    images: (p.images ?? []).map((i) => i.src).filter(Boolean),
    raw: p,
  };
}

function toPulledOrder(o: ShopifyOrderRaw): PulledOrder {
  const fullName = [o.customer?.first_name, o.customer?.last_name]
    .filter(Boolean)
    .join(' ');
  return {
    externalId: String(o.id),
    externalNumber: o.name,
    status: o.fulfillment_status ?? o.financial_status ?? 'open',
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    currency: o.currency,
    total: Math.round(Number(o.total_price) * 100),
    subtotal:
      o.subtotal_price !== undefined
        ? Math.round(Number(o.subtotal_price) * 100)
        : undefined,
    taxTotal:
      o.total_tax !== undefined ? Math.round(Number(o.total_tax) * 100) : undefined,
    discountTotal:
      o.total_discounts !== undefined
        ? Math.round(Number(o.total_discounts) * 100)
        : undefined,
    customer: o.customer
      ? {
          externalId: o.customer.id !== undefined ? String(o.customer.id) : undefined,
          name: fullName || undefined,
          email: o.customer.email,
          phone: o.customer.phone,
        }
      : undefined,
    shippingAddress: o.shipping_address
      ? toAddress(o.shipping_address)
      : undefined,
    billingAddress: o.billing_address ? toAddress(o.billing_address) : undefined,
    items: (o.line_items ?? []).map((it) => ({
      externalId: it.id !== undefined ? String(it.id) : undefined,
      sku: it.sku,
      title: it.title,
      quantity: it.quantity,
      unitPrice: Math.round(Number(it.price) * 100),
      raw: it,
    })),
    raw: o,
  };
}

function toAddress(a: ShopifyAddressRaw): {
  name: string;
  phone?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
} {
  const name = a.name ?? [a.first_name, a.last_name].filter(Boolean).join(' ') ?? 'Unknown';
  return {
    name,
    phone: a.phone,
    line1: a.address1 ?? '',
    line2: a.address2,
    city: a.city ?? '',
    state: a.province ?? '',
    postalCode: a.zip ?? '',
    country: a.country_code ?? 'IN',
  };
}

function extractNextPageInfo(linkHeader: string): string | null {
  // Shopify returns `Link: <https://...?page_info=...>; rel="next"`.
  // We return the FULL URL (including page_info query param) so the
  // next call can hit the next page directly.
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}