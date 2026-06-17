import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
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
 * SS-026 — WooCommerce channel adapter.
 *
 * Talks to the WooCommerce REST API (v3). Authentication: Basic Auth
 * with consumer key + secret. Endpoints used:
 *
 *   - GET  /wp-json/wc/v3/system_status  — testConnection
 *   - GET  /wp-json/wc/v3/products       — pullProducts
 *   - GET  /wp-json/wc/v3/orders         — pullOrders
 *   - PUT  /wp-json/wc/v3/orders/{id}    — pushShipment (sets status=completed + meta)
 *   - POST /wp-json/wc/v3/webhooks       — registerWebhooks
 *
 * Credentials expected in the encrypted `credentials` blob:
 *   - storeUrl       — e.g. https://mystore.example.com
 *   - consumerKey    — WooCommerce REST API consumer key
 *   - consumerSecret — WooCommerce REST API consumer secret
 *
 * NOTE — WooCommerce's REST API is unauthenticated-by-default on
 * the order update endpoint. We use Basic auth (HTTPS) for safety.
 */
@Injectable()
export class WooCommerceChannelAdapter implements EcomChannelAdapter {
  public readonly platform = 'woocommerce' as const;
  private readonly log = new Logger(WooCommerceChannelAdapter.name);

  async testConnection(tenantId: number): Promise<ChannelConnectionStatusReport> {
    try {
      const creds = this.loadCreds(tenantId);
      const res = await this.wcFetch(tenantId, 'GET', '/wp-json/wc/v3/system_status');
      if (res.status !== 200) {
        return {
          ok: false,
          platform: this.platform,
          message: `WooCommerce /system_status returned HTTP ${res.status}`,
        };
      }
      const json = JSON.parse(res.body) as { environment?: { site_url?: string } };
      return {
        ok: true,
        platform: this.platform,
        details: { storeUrl: json.environment?.site_url ?? creds.storeUrl },
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
    // WooCommerce uses page-based pagination (1-indexed, max 100/page).
    // We treat `cursor` as the page number for simplicity.
    const page = cursor ? Number(cursor) : 1;
    const path = `/wp-json/wc/v3/products?per_page=50&page=${page}`;
    const res = await this.wcFetch(tenantId, 'GET', path);
    if (res.status !== 200) {
      throw new Error(
        `WooCommerce pullProducts failed: HTTP ${res.status} body=${res.body.slice(0, 200)}`,
      );
    }
    const arr = JSON.parse(res.body) as WooProductRaw[];
    const total = Number(res.headers.get('x-wp-totalpages') ?? '1');
    const products = arr.map(toPulledProduct);
    const nextCursor = page < total ? String(page + 1) : null;
    return { items: products, nextCursor };
  }

  async pullOrders(
    tenantId: number,
    since: Date,
    cursor?: string,
  ): Promise<{ items: PulledOrder[]; nextCursor?: string | null }> {
    const page = cursor ? Number(cursor) : 1;
    const params = new URLSearchParams({
      per_page: '50',
      page: String(page),
      modified_after: since.toISOString(),
      status: 'any',
    });
    const path = `/wp-json/wc/v3/orders?${params.toString()}`;
    const res = await this.wcFetch(tenantId, 'GET', path);
    if (res.status !== 200) {
      throw new Error(
        `WooCommerce pullOrders failed: HTTP ${res.status} body=${res.body.slice(0, 200)}`,
      );
    }
    const arr = JSON.parse(res.body) as WooOrderRaw[];
    const total = Number(res.headers.get('x-wp-totalpages') ?? '1');
    const orders = arr.map(toPulledOrder);
    const nextCursor = page < total ? String(page + 1) : null;
    return { items: orders, nextCursor };
  }

  async pushShipment(
    tenantId: number,
    orderId: string,
    shipment: ShipmentPushPayload,
  ): Promise<ChannelPushResult> {
    try {
      const path = `/wp-json/wc/v3/orders/${encodeURIComponent(orderId)}`;
      const body = {
        status: 'completed',
        meta_data: [
          { key: '_swiftship_carrier', value: shipment.carrier },
          { key: '_swiftship_tracking_number', value: shipment.trackingNumber },
          { key: '_swiftship_tracking_url', value: shipment.trackingUrl ?? '' },
          { key: '_swiftship_shipped_at', value: shipment.shippedAt ?? new Date().toISOString() },
        ],
      };
      const res = await this.wcFetch(tenantId, 'PUT', path, body);
      if (res.status < 200 || res.status >= 300) {
        return {
          ok: false,
          platform: this.platform,
          externalOrderId: orderId,
          message: `WooCommerce order update failed: HTTP ${res.status} body=${res.body.slice(0, 200)}`,
        };
      }
      return {
        ok: true,
        platform: this.platform,
        externalOrderId: orderId,
        message: 'Order marked completed with tracking meta',
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
    try {
      const path = `/wp-json/wc/v3/orders/${encodeURIComponent(orderId)}`;
      const body = {
        meta_data: [
          { key: '_swiftship_tracking_status', value: tracking.status },
          { key: '_swiftship_tracking_number', value: tracking.trackingNumber },
          { key: '_swiftship_tracking_url', value: tracking.trackingUrl ?? '' },
        ],
      };
      const res = await this.wcFetch(tenantId, 'PUT', path, body);
      if (res.status < 200 || res.status >= 300) {
        return {
          ok: false,
          platform: this.platform,
          externalOrderId: orderId,
          message: `WooCommerce tracking update failed: HTTP ${res.status} body=${res.body.slice(0, 200)}`,
        };
      }
      return {
        ok: true,
        platform: this.platform,
        externalOrderId: orderId,
        message: 'Tracking meta updated',
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
    const creds = this.loadCreds(tenantId);
    const topics = [
      { name: 'order.created', topic: 'order.created' },
      { name: 'order.updated', topic: 'order.updated' },
      { name: 'product.created', topic: 'product.created' },
      { name: 'product.updated', topic: 'product.updated' },
    ];
    const registered: Array<{ topic: string; callbackUrl: string }> = [];
    let ok = true;
    for (const t of topics) {
      const url = `${baseUrl.replace(/\/$/, '')}/woocommerce/webhook?topic=${encodeURIComponent(t.topic)}`;
      try {
        const path = `/wp-json/wc/v3/webhooks`;
        const res = await this.wcFetch(tenantId, 'POST', path, {
          name: t.name,
          topic: t.topic,
          delivery_url: url,
          secret: this.signWebhookSecret(creds.consumerSecret, t.topic),
        });
        if (res.status === 201 || res.status === 200) {
          registered.push({ topic: t.topic, callbackUrl: url });
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

  private static _registry: Map<number, ChannelConnectionEntity> = new Map();

  static _register(tenantId: number, row: ChannelConnectionEntity): void {
    WooCommerceChannelAdapter._registry.set(tenantId, row);
  }

  static _unregister(tenantId: number): void {
    WooCommerceChannelAdapter._registry.delete(tenantId);
  }

  private loadCreds(tenantId: number): {
    storeUrl: string;
    consumerKey: string;
    consumerSecret: string;
  } {
    const row = WooCommerceChannelAdapter._registry.get(tenantId);
    if (!row) {
      throw new Error(
        `WooCommerceChannelAdapter: no connection registered for tenant ${tenantId}`,
      );
    }
    return decryptJson(row.credentials) as {
      storeUrl: string;
      consumerKey: string;
      consumerSecret: string;
    };
  }

  private async wcFetch(
    tenantId: number,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<{ status: number; body: string; headers: Headers }> {
    const creds = this.loadCreds(tenantId);
    const base = creds.storeUrl.replace(/\/$/, '');
    const url = path.startsWith('http') ? path : `${base}${path}`;
    const authToken = Buffer.from(
      `${creds.consumerKey}:${creds.consumerSecret}`,
      'utf8',
    ).toString('base64');
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Basic ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text, headers: res.headers };
  }

  private signWebhookSecret(secret: string, topic: string): string {
    return createHmac('sha256', secret).update(topic).digest('hex');
  }
}

// ---------- WooCommerce JSON shapes (subset)

interface WooProductRaw {
  id: number;
  name: string;
  description?: string;
  sku?: string;
  price?: string;
  stock_quantity?: number | null;
  images?: Array<{ src: string }>;
  weight?: string;
}

interface WooOrderRaw {
  id: number;
  number: string;
  status: string;
  date_created: string;
  date_modified: string;
  currency: string;
  total: string;
  subtotal?: string;
  total_tax?: string;
  discount_total?: string;
  shipping_total?: string;
  billing?: WooAddressRaw;
  shipping?: WooAddressRaw;
  customer_id?: number;
  line_items?: Array<{
    id?: number;
    sku?: string;
    name?: string;
    quantity: number;
    price: number;
    subtotal?: string;
    total?: string;
  }>;
}

interface WooAddressRaw {
  first_name?: string;
  last_name?: string;
  company?: string;
  phone?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  email?: string;
}

// ---------- mappers

function toPulledProduct(p: WooProductRaw): PulledProduct {
  return {
    externalId: String(p.id),
    sku: p.sku,
    title: p.name,
    description: p.description,
    price:
      p.price !== undefined
        ? { amount: Number(p.price), currency: 'INR' }
        : undefined,
    inventory: p.stock_quantity ?? undefined,
    images: (p.images ?? []).map((i) => i.src).filter(Boolean),
    raw: p,
  };
}

function toPulledOrder(o: WooOrderRaw): PulledOrder {
  return {
    externalId: String(o.id),
    externalNumber: o.number,
    status: o.status,
    createdAt: o.date_created,
    updatedAt: o.date_modified,
    currency: o.currency,
    total: Math.round(Number(o.total) * 100),
    subtotal:
      o.subtotal !== undefined ? Math.round(Number(o.subtotal) * 100) : undefined,
    taxTotal:
      o.total_tax !== undefined ? Math.round(Number(o.total_tax) * 100) : undefined,
    discountTotal:
      o.discount_total !== undefined
        ? Math.round(Number(o.discount_total) * 100)
        : undefined,
    shippingTotal:
      o.shipping_total !== undefined
        ? Math.round(Number(o.shipping_total) * 100)
        : undefined,
    customer: o.billing
      ? {
          name: [o.billing.first_name, o.billing.last_name].filter(Boolean).join(' '),
          email: o.billing.email,
        }
      : undefined,
    shippingAddress: o.shipping ? toAddress(o.shipping) : undefined,
    billingAddress: o.billing ? toAddress(o.billing) : undefined,
    items: (o.line_items ?? []).map((it) => ({
      externalId: it.id !== undefined ? String(it.id) : undefined,
      sku: it.sku,
      title: it.name,
      quantity: it.quantity,
      unitPrice: Math.round(Number(it.price) * 100),
      total: it.total !== undefined ? Math.round(Number(it.total) * 100) : undefined,
      raw: it,
    })),
    raw: o,
  };
}

function toAddress(a: WooAddressRaw): {
  name: string;
  phone?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
} {
  const name = [a.first_name, a.last_name].filter(Boolean).join(' ') || a.company || 'Unknown';
  return {
    name,
    phone: a.phone,
    line1: a.address_1 ?? '',
    line2: a.address_2,
    city: a.city ?? '',
    state: a.state ?? '',
    postalCode: a.postcode ?? '',
    country: a.country ?? 'IN',
  };
}