/**
 * Rate-shop widget — TypeScript source of truth.
 *
 * The compiled distribution is `apps/web/public/cdn/rate-shop.js`. The JS
 * file is the canonical delivery format (loaded via `<script src=...>`);
 * this file documents the types.
 *
 * Renders a courier selector with the top 3 cheapest quotes + the single
 * fastest quote (deduplicated). Calls the existing public rate-shop REST
 * endpoint at `POST <apiBaseUrl>/api/v1/rate-shop/rank` (see
 * `apps/api/src/rate-shop/rate-shop.public.controller.ts`).
 *
 * TODO(SS-022-backend): the public GraphQL `publicRateShop` mutation
 * mentioned in the bead description is NOT in the backend. We use the
 * REST endpoint instead, which is already deployed and tenant-scoped
 * via the `X-Swiftship-Api-Key` header. Documented in the README; not
 * adding the mutation here.
 */
import type {
  SwiftshipRateShopOptions,
  RateShopResult,
  SwiftshipMountResult,
} from './types';

export async function mountRateShop(
  opts: SwiftshipRateShopOptions,
): Promise<SwiftshipMountResult> {
  throw new Error('mountRateShop: see rate-shop.js (canonical distribution).');
}
