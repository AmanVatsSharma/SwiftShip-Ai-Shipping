/**
 * SS-035 — rate-shop scenario.
 *
 * Exercises the public `POST /api/v1/rate-shop/rank` endpoint from
 * SS-014. The target is 5K RPS sustained for 10 minutes; the SLA
 * is p99 < 200ms because the rate cache is supposed to dominate.
 *
 * We authenticate per request with a tenant API key in the
 * `X-Swiftship-Api-Key` header (the public REST shape). The key
 * is the same value used by the seed script, but we treat it as
 * a single shared tenant for the cache-warm-up phase.
 *
 * Run:
 *   k6 run \
 *     -e STAGING_API_URL=https://staging.swiftship.in \
 *     -e TENANT_API_KEY=ssk_xxx.yyy \
 *     loadtest/k6/scenarios/rate-shop.js
 *
 * Thresholds (hard gates):
 *   http_req_duration:p99 < 200ms (cache-hit dominated)
 *   http_req_failed < 1%
 *
 * Note on the 5K RPS ramp: we use `ramping-arrival-rate` because
 * 5K RPS at ~50ms per request is only ~250 concurrent in-flight
 * requests, well within the 600-VU budget. The 90s ramp gives
 * the rate-cache a chance to warm before we lock the rate.
 */
import http from 'k6/http';
import { check } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const STAGING_API_URL = __ENV.STAGING_API_URL || 'http://localhost:3000';
const TENANT_API_KEY = __ENV.TENANT_API_KEY || '';
// Round-robin origin/destination so cache keys are spread out — but
// each pair repeats ~5 times per second of run time so cache hits
// dominate after the first ~5s.
const PINCODE_PAIRS = [
  ['110001', '560001'],
  ['400001', '110001'],
  ['560001', '600001'],
  ['600001', '700001'],
  ['700001', '500001'],
  ['500001', '411001'],
  ['411001', '380001'],
  ['380001', '302001'],
  ['302001', '226001'],
  ['226001', '110001'],
];
const WEIGHTS = [250, 500, 1000, 1500, 2000, 3000];
const PAYMENTS = ['PREPAID', 'COD'];

const rateShopLatency = new Trend('rate_shop_latency', true);
const rateShopSuccess = new Rate('rate_shop_success');

export const options = {
  scenarios: {
    rate_shop: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 600,
      stages: [
        { target: 5000, duration: '90s' },
        { target: 5000, duration: '10m' },
        { target: 0, duration: '30s' },
      ],
    },
  },
  thresholds: {
    'http_req_duration{name:rateShop}': ['p(99)<200'],
    'rate_shop_success': ['rate>=0.99'],
    'http_req_failed': ['rate<0.01'],
  },
  // The "has_quotes" check parses the response body, so we keep it.
  discardResponseBodies: false,
};

const buildBody = () => {
  const [origin, dest] = PINCODE_PAIRS[Math.floor(Math.random() * PINCODE_PAIRS.length)];
  const weight = WEIGHTS[Math.floor(Math.random() * WEIGHTS.length)];
  const payment = PAYMENTS[Math.floor(Math.random() * PAYMENTS.length)];
  return JSON.stringify({
    originPincode: origin,
    destinationPincode: dest,
    weightGrams: weight,
    paymentMethod: payment,
    strategy: 'best_value',
  });
};

export default function () {
  const res = http.post(
    `${STAGING_API_URL}/api/v1/rate-shop/rank`,
    buildBody(),
    {
      headers: {
        'content-type': 'application/json',
        'x-swiftship-api-key': TENANT_API_KEY,
      },
      tags: { name: 'rateShop' },
      timeout: '2s',
    },
  );

  const ok = check(res, {
    'rate_shop_ok': (r) => r.status === 200,
    'rate_shop_has_quotes': (r) => {
      if (r.status !== 200) return false;
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.quotes) && body.quotes.length > 0;
      } catch (_) {
        return false;
      }
    },
  });

  rateShopLatency.add(res.timings.duration);
  rateShopSuccess.add(ok);
}
