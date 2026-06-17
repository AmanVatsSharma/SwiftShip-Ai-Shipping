/**
 * SS-026 — channel-sync payload types
 *
 * The e-commerce platform sync layer (Shopify, WooCommerce, Amazon
 * Seller-Central, Flipkart Seller, Myntra) is distinct from the
 * marketplace-side `ChannelAdapter` (Amazon SP-API, Flipkart, Meesho,
 * Myntra) that already lives in this lib. The latter pushes tracking
 * and pulls orders *from* a marketplace; the former syncs products,
 * orders and customers *from* a merchant's own e-commerce store.
 *
 * The two coexist — the same tenant may have an Amazon marketplace
 * connection (fulfillment) AND a Shopify store (catalogue). They have
 * different connection lifecycles, different rate limits, and different
 * credential shapes. This file is the shape for the second one.
 */

/** E-commerce platform identifiers. */
export type ChannelPlatform =
  | 'shopify'
  | 'woocommerce'
  | 'amazon'
  | 'flipkart'
  | 'myntra';

/** Lifecycle state of a ChannelConnectionEntity row. */
export type ChannelConnectionStatus =
  | 'pending' // just created, test not yet run
  | 'active' // test passed, syncs run
  | 'paused' // tenant disabled; don't schedule
  | 'error' // last test/sync failed; tenant must reconnect
  | 'disconnected'; // soft-deleted

export type ChannelSyncType = 'products' | 'orders';
export type ChannelSyncStatus =
  | 'queued'
  | 'running'
  | 'success'
  | 'partial'
  | 'failed';

/** Conflict resolution when a product already exists. */
export type ChannelConflictMode = 'skip' | 'overwrite' | 'merge';

export interface ChannelConnectionStatusReport {
  ok: boolean;
  platform: ChannelPlatform;
  message?: string;
  /** Opaque platform-side metadata (shop domain, store id, etc.). */
  details?: Record<string, unknown>;
}

/** Pulled product — platform-agnostic shape. */
export interface PulledProduct {
  externalId: string;
  sku?: string;
  title: string;
  description?: string;
  price?: { amount: number; currency: string };
  inventory?: number;
  images?: string[];
  weight?: { value: number; unit: 'g' | 'kg' | 'lb' | 'oz' };
  raw?: unknown;
}

/** Pulled order — platform-agnostic shape. */
export interface PulledOrder {
  externalId: string;
  externalNumber: string;
  status: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  currency: string;
  total: number; // minor units
  subtotal?: number;
  shippingTotal?: number;
  taxTotal?: number;
  discountTotal?: number;
  customer?: {
    externalId?: string;
    name?: string;
    email?: string;
    phone?: string;
  };
  shippingAddress?: {
    name: string;
    phone?: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  billingAddress?: {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  items: Array<{
    externalId?: string;
    sku?: string;
    title?: string;
    quantity: number;
    unitPrice: number;
    total?: number;
    raw?: unknown;
  }>;
  raw?: unknown;
}

/** Outbound payload for `pushShipment`. */
export interface ShipmentPushPayload {
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string;
  shippedAt?: string; // ISO
  items: Array<{ sku?: string; externalId?: string; quantity: number }>;
}

/** Outbound payload for `pushTracking` (separate from shipment creation). */
export interface TrackingPushPayload {
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string;
  status: string;
  events?: Array<{
    status: string;
    description?: string;
    location?: string;
    occurredAt: string; // ISO
  }>;
}

export interface ChannelPushResult {
  ok: boolean;
  platform: ChannelPlatform;
  externalOrderId: string;
  message?: string;
  raw?: unknown;
}

export interface ChannelWebhookRegistration {
  ok: boolean;
  platform: ChannelPlatform;
  registered: Array<{ topic: string; callbackUrl: string }>;
  message?: string;
}

/**
 * Per-tenant settings blob. JSON-serialised on
 * `ChannelConnectionEntity.settings`; readers should treat it as
 * open-ended per-platform.
 */
export interface ChannelSettings {
  /** 'shopify' / 'woocommerce' style: pull & push both. */
  syncMode: 'one_way_in' | 'one_way_out' | 'two_way';
  /** products / orders cron schedule overrides (cron expr). */
  productSyncCron?: string;
  orderSyncCron?: string;
  /** What to do on a product conflict during product-sync. */
  conflictMode?: ChannelConflictMode;
  /** Warehouse code to attribute stock changes to. */
  defaultWarehouseCode?: string;
  /** Skip orders that match these statuses. */
  skipOrderStatuses?: string[];
  /** Shopify-only: location_id for inventory lookups. */
  shopifyLocationId?: string;
  /** WooCommerce-only: status=any|pending|processing|... */
  wooOrderStatus?: string;
  [k: string]: unknown;
}
