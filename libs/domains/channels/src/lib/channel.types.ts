/**
 * Channel-agnostic DTOs for marketplace integrations.
 *
 * SwiftShip syncs orders/tracking/inventory/returns with multiple Indian
 * marketplaces — Amazon (SP-API), Flipkart, Meesho, Myntra. The shapes
 * below are the common representation that flows through the channel
 * pipeline; each adapter is responsible for mapping its native payload
 * into/from these types.
 */

/** Supported marketplace channels. Add new codes here + register an adapter. */
export type ChannelCode = 'AMAZON' | 'FLIPKART' | 'MEESHO' | 'MYNTRA';

export interface ChannelAddress {
  name: string;
  phone?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string; // ISO 3166-1 alpha-2
}

export interface ChannelCustomer {
  /** Marketplace-internal buyer ID (Amazon: buyerId). */
  externalId?: string;
  name?: string;
  email?: string;
  phone?: string;
}

export interface ChannelOrderItem {
  /** Marketplace SKU / ASIN / seller-sku. */
  sku: string;
  title?: string;
  quantity: number;
  unitPrice: number; // minor units (paise)
  tax?: number;
  discount?: number;
  hsn?: string;
}

export interface ChannelOrder {
  /** Channel-side order id (Amazon: AmazonOrderId). */
  externalOrderId: string;
  channelCode: ChannelCode;
  status: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  currency: string; // ISO 4217
  total: number; // minor units
  shippingAddress: ChannelAddress;
  billingAddress?: ChannelAddress;
  customer?: ChannelCustomer;
  items: ChannelOrderItem[];
  /** Free-form raw payload from the channel — useful for debugging / replay. */
  raw?: unknown;
}

export interface ChannelReturn {
  externalReturnId: string;
  externalOrderId: string;
  channelCode: ChannelCode;
  status: string;
  reason?: string;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    sku: string;
    quantity: number;
  }>;
  raw?: unknown;
}

export interface PullOrdersRequest {
  channelCode: ChannelCode;
  tenantId: string;
  /** ISO datetime — orders created after this point. */
  createdAfter?: string;
  /** ISO datetime — orders updated after this point. */
  lastUpdatedAfter?: string;
  /** Optional marketplace filter (Amazon marketplace id, e.g. ATVPDKIKX0DER). */
  marketplaceId?: string;
  /** Max orders per page. */
  pageSize?: number;
  /** Opaque pagination token (e.g. NextToken for SP-API). */
  nextToken?: string;
}

export interface PushTrackingRequest {
  channelCode: ChannelCode;
  tenantId: string;
  externalOrderId: string;
  carrierCode: string;
  trackingNumber: string;
  /** Items being shipped (line items). */
  items: Array<{ sku: string; quantity: number }>;
  /** Carrier dispatch date — defaults to today. */
  shippedAt?: string;
  /** Carrier tracking URL (optional). */
  trackingUrl?: string;
}

export interface SyncInventoryRequest {
  channelCode: ChannelCode;
  tenantId: string;
  warehouseCode: string;
  items: Array<{
    sku: string;
    quantity: number;
  }>;
}

export interface PullReturnsRequest {
  channelCode: ChannelCode;
  tenantId: string;
  createdAfter?: string;
  nextToken?: string;
}
