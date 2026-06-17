import type {
  ChannelConnectionStatusReport,
  ChannelPlatform,
  ChannelPushResult,
  ChannelWebhookRegistration,
  PulledOrder,
  PulledProduct,
  ShipmentPushPayload,
  TrackingPushPayload,
} from './channel-sync.types';

/**
 * SS-026 — `EcomChannelAdapter`
 *
 * Every e-commerce platform (Shopify, WooCommerce, Amazon Seller
 * Central, Flipkart Seller, Myntra, …) implements this interface. The
 * `ChannelSyncService` orchestrates a fleet of these adapters, keyed by
 * `platform`. Adding a new platform = drop a new file in
 * `./adapters/<name>.channel-adapter.ts`, register it in the module.
 *
 * NOTE — this is deliberately *separate* from the marketplace-side
 * `ChannelAdapter` exported by the parent `./channel-adapter.interface.ts`,
 * which describes the inverse direction (pull orders FROM marketplaces).
 * Both can coexist for the same tenant.
 *
 * Contract:
 *
 *  - `pullProducts` MUST yield products in pages (AsyncIterable). The
 *    service advances the per-connection cursor after each page.
 *  - `pullOrders` is filtered by `since` (created-or-updated since).
 *  - `pushShipment` / `pushTracking` are best-effort — return
 *    `{ ok: false, message }` on platform rejection (do NOT throw).
 *  - `registerWebhooks` is called once per connection lifecycle; the
 *    adapter should be idempotent (re-registration should be safe).
 *  - Adapters MUST NOT call other adapters or the sync service — they
 *    only talk to the platform HTTP API.
 */
export interface EcomChannelAdapter {
  readonly platform: ChannelPlatform;

  /** Verify credentials against the platform; never throws. */
  testConnection(tenantId: number): Promise<ChannelConnectionStatusReport>;

  /**
   * Pull products in pages. `cursor === undefined` means start from the
   * beginning. Returned cursors are opaque strings the adapter will
   * accept on the next call; `null` / `undefined` cursor on the last
   * page signals end-of-stream.
   */
  pullProducts(
    tenantId: number,
    cursor?: string,
  ): Promise<{
    items: PulledProduct[];
    nextCursor?: string | null;
  }>;

  /** Pull orders created/updated since `since`, in pages. */
  pullOrders(
    tenantId: number,
    since: Date,
    cursor?: string,
  ): Promise<{
    items: PulledOrder[];
    nextCursor?: string | null;
  }>;

  /**
   * Push a shipment-creation notification (with carrier + tracking) to
   * the platform so the merchant's customer sees it. Returns the
   * platform's acknowledgement.
   */
  pushShipment(
    tenantId: number,
    orderId: string,
    shipment: ShipmentPushPayload,
  ): Promise<ChannelPushResult>;

  /** Push a tracking-update event (subsequent scan events). */
  pushTracking(
    tenantId: number,
    orderId: string,
    tracking: TrackingPushPayload,
  ): Promise<ChannelPushResult>;

  /**
   * Subscribe to the platform's webhook topics so SwiftShip receives
   * create/update events without polling. Called once after
   * `testConnection` succeeds.
   */
  registerWebhooks(
    tenantId: number,
    baseUrl: string,
  ): Promise<ChannelWebhookRegistration>;
}