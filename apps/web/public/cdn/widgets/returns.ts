/**
 * Returns widget — TypeScript source of truth.
 *
 * The compiled distribution is `apps/web/public/cdn/returns.js`. The JS
 * file is the canonical delivery format (loaded via `<script src=...>`);
 * this file documents the types.
 *
 * Renders a compact summary card with an "Open return portal" button
 * that links to `<portalHost>/return/<token>`. The widget does NOT make
 * any backend calls — it only links the customer to the existing return
 * portal page.
 */
import type { SwiftshipReturnsOptions, SwiftshipMountResult } from './types';

export async function mountReturns(
  opts: SwiftshipReturnsOptions,
): Promise<SwiftshipMountResult> {
  throw new Error('mountReturns: see returns.js (canonical distribution).');
}
