/**
 * Tracking widget — TypeScript source of truth.
 *
 * The compiled distribution is `apps/web/public/cdn/tracking.js`. The JS
 * file is the canonical delivery format (loaded via `<script src=...>`);
 * this file documents the types and is the source for any future build
 * step.
 *
 * Renders a vertical timeline of tracking events for a single AWB into
 * a host element by calling the public GraphQL `trackByAwb` query
 * (via the existing `filterShipments` query in the public API until the
 * dedicated `trackByAwb` resolver is added — see TODO below).
 */
import type {
  SwiftshipTrackingOptions,
  TrackingResult,
  SwiftshipMountResult,
} from './types';

export async function mountTracking(
  opts: SwiftshipTrackingOptions,
): Promise<SwiftshipMountResult> {
  // Implementation is mirrored verbatim in `tracking.js`. Kept in TS so
  // the option shape is typed when we eventually add a build step.
  throw new Error('mountTracking: see tracking.js (canonical distribution).');
}
