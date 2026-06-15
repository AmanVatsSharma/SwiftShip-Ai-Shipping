/**
 * Shared types for the embeddable SwiftShip widgets.
 *
 * The compiled JS bundles in `apps/web/public/cdn/*.js` are what the
 * merchant actually loads; these TypeScript sources are kept so the
 * public API surface is documented in one place and the JS bundles
 * stay in lock-step with the type definitions.
 *
 * All three widgets share the same option shape, plus a per-widget
 * `payload` object that holds the widget-specific fields.
 */

export type SwiftshipTheme = 'light' | 'dark' | 'auto';

export type SwiftshipMode = 'tracking' | 'returns' | 'rate-shop';

export interface SwiftshipWidgetOptionsBase {
  /** Tenant slug (e.g. "acme-cosmetics"). Mirrors `data-tenant`. */
  tenant: string;
  /** Optional theme override. Defaults to "light". */
  theme?: SwiftshipTheme;
  /** Public API key. Read from `data-api-key` on the script tag. */
  apiKey?: string;
  /** Base URL of the SwiftShip API. Defaults to `window.location.origin`-relative
   *  tracking page host, but can be overridden for cross-origin embeds. */
  apiBaseUrl?: string;
  /** Host element to render into. Required when calling the JS API directly. */
  target?: HTMLElement | string;
  /** Optional primary brand color (hex). Used as an accent. */
  brandColor?: string;
  /** Optional host URL (e.g. "https://shop.acme.in") used to build absolute
   *  return portal links. Defaults to `window.location.host`. */
  portalHost?: string;
}

export interface SwiftshipTrackingOptions extends SwiftshipWidgetOptionsBase {
  mode: 'tracking';
  /** AWB / tracking number to display. */
  awb: string;
}

export interface SwiftshipReturnsOptions extends SwiftshipWidgetOptionsBase {
  mode: 'returns';
  /** Return magic-link token. */
  token: string;
  /** Optional order summary line to render above the button. */
  summary?: string;
}

export interface SwiftshipRateShopOptions extends SwiftshipWidgetOptionsBase {
  mode: 'rate-shop';
  /** Origin pincode. */
  from: string;
  /** Destination pincode. */
  to: string;
  /** Dead weight in grams. */
  weight: number;
  /** When true, the quote is for a COD shipment. */
  cod?: boolean;
  /** Declared value in INR (optional). */
  declaredValueInr?: number;
}

export type SwiftshipWidgetOptions =
  | SwiftshipTrackingOptions
  | SwiftshipReturnsOptions
  | SwiftshipRateShopOptions;

/** Common result type for the tracking widget. */
export interface TrackingResult {
  shipment: {
    trackingNumber: string;
    status: string;
    carrierId?: number | null;
    shippedAt?: string | null;
    deliveredAt?: string | null;
    trackingEvents: TrackingEvent[];
  } | null;
  tenant: {
    slug: string;
    name: string;
    logoUrl?: string | null;
    brandColor?: string | null;
  };
}

export interface TrackingEvent {
  id: number;
  status: string;
  description?: string | null;
  location?: string | null;
  occurredAt: string;
}

/** Shape returned by the rate-shop public REST endpoint. */
export interface RateShopQuote {
  carrierCode: string;
  serviceType?: string | null;
  ratePaise: number;
  rateInr: number;
  etaDays: number;
  codAvailable: boolean;
}

export interface RateShopResult {
  quotes: RateShopQuote[];
  totalCandidates: number;
}

/** Resolution given back to the caller of `swiftship('mode', opts)`. */
export interface SwiftshipMountResult {
  /** Resolves when the widget is rendered (or the error path is shown). */
  ready: Promise<void>;
  /** The host element the widget was mounted into. */
  element: HTMLElement;
  /** A no-op `destroy` so callers can wire it up; clears markup + listeners. */
  destroy: () => void;
}
