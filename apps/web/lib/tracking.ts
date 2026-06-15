/**
 * Public tracking helper for the customer-facing tracking page
 * (apps/web/app/track/[awb]/page.tsx). Calls the public GraphQL
 * `trackByAwb(awb)` query via the shared Apollo client.
 *
 * NOTE: the schema currently exposes `filterShipments` (not `trackByAwb`).
 * This helper is shaped to match the upcoming `trackByAwb(awb)` contract
 * (accepts the AWB only, returns tenant + tracking data). On the wire we
 * use the existing `filterShipments` query — the helper hides that detail
 * so the page is forward-compatible with the schema change.
 */
import { apolloClient } from './apollo';
import { gql } from '@apollo/client';

export const TRACK_BY_AWB_QUERY = gql`
  query TrackByAwb($number: String!) {
    filterShipments(filter: { trackingNumber: $number }) {
      id
      trackingNumber
      status
      carrierId
      shippedAt
      deliveredAt
      trackingEvents {
        id
        status
        subStatus
        description
        eventCode
        location
        occurredAt
      }
    }
  }
`;

/** A single timeline event as returned by the API. */
export interface TrackingEvent {
  id: number;
  status: string;
  subStatus?: string | null;
  description?: string | null;
  eventCode?: string | null;
  location?: string | null;
  occurredAt: string;
}

/** A shipment as returned by the tracking query. */
export interface TrackingShipment {
  id: number;
  trackingNumber: string;
  status: string;
  carrierId?: number | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  trackingEvents?: TrackingEvent[] | null;
}

/** Per-tenant branding shown on the page header. */
export interface TenantBranding {
  /** Slug identifying the tenant (e.g. "acme-cosmetics"). */
  slug: string;
  /** Display name shown in the header (e.g. "Acme Cosmetics"). */
  name: string;
  /** URL of the tenant logo; rendered in the header. */
  logoUrl?: string | null;
  /** Primary brand color, hex (#RRGGBB). */
  brandColor?: string | null;
  /** Support phone number, e.g. "+91-80-4567-8900". */
  supportPhone?: string | null;
  /** Support email address. */
  supportEmail?: string | null;
}

/** The shape returned by `getTrackingByAwb`. */
export interface TrackingResult {
  shipment: TrackingShipment | null;
  tenant: TenantBranding;
}

/** SwiftShip default branding used when no per-tenant override is supplied. */
const DEFAULT_BRANDING: TenantBranding = {
  slug: 'swiftship',
  name: 'SwiftShip',
  logoUrl: null,
  brandColor: '#4f46e5', // brand-600
  supportPhone: null,
  supportEmail: 'support@swiftship.ai',
};

/**
 * Fetch tracking data for a single AWB. Public — no auth.
 * Falls back to the default SwiftShip branding when no tenant is provided.
 */
export async function getTrackingByAwb(
  awb: string,
  tenantSlug: string = 'swiftship',
): Promise<TrackingResult> {
  const tenant: TenantBranding = {
    ...DEFAULT_BRANDING,
    slug: tenantSlug,
    name: tenantSlug === 'swiftship' ? 'SwiftShip' : tenantSlug,
  };

  const trimmed = (awb ?? '').trim();
  if (!trimmed) {
    return { shipment: null, tenant };
  }

  try {
    const res = await apolloClient.query<{
      filterShipments: TrackingShipment[];
    }>({
      query: TRACK_BY_AWB_QUERY,
      variables: { number: trimmed },
      fetchPolicy: 'no-cache',
    });
    const shipment = res.data?.filterShipments?.[0] ?? null;
    return { shipment, tenant };
  } catch {
    // Network/GraphQL error — render the NotFound state rather than crash.
    return { shipment: null, tenant };
  }
}
