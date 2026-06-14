/**
 * SS-035 — order-create scenario.
 *
 * Fires the GraphQL `createOrder` mutation at 1K RPS for a sustained
 * 5 minutes. This is the canonical "write path" benchmark: it warms
 * the connection pool, exercises the rate-engine, and creates rows
 * the dashboard can later visualise.
 *
 * Run:
 *   k6 run \
 *     -e STAGING_API_URL=https://staging.swiftship.in \
 *     -e JWT_TOKEN=eyJhbGciOi... \
 *     loadtest/k6/scenarios/order-create.js
 *
 * Thresholds (these are HARD gates — k6 exits non-zero on a fail):
 *   http_req_duration:p99 < 500ms
 *   checks{check:order_success_rate} >= 99.5%
 *
 * The 1K RPS target is reached with a 60s ramp so the platform's
 * connection pool can warm up. The sustained 5 minutes gives the
 * throttler / GC / connection-refresh paths enough wall-clock to
 * surface second-order effects.
 */
import http from 'k6/http';
import { check } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

/**
 * Minimal random suffix for unique order numbers. We avoid pulling
 * `k6-utils` over HTTP (versioning risk + offline runs) and inline
 * the small bit of randomness we actually need.
 */
function randomString(length) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

const STAGING_API_URL = __ENV.STAGING_API_URL || 'http://localhost:3000';
const JWT_TOKEN = __ENV.JWT_TOKEN || '';
// 100 seeded tenants, evenly distributed via a round-robin user pool.
const USER_ID_POOL = (__ENV.USER_ID_POOL || '1,2,3,4,5,6,7,8,9,10')
  .split(',')
  .map((s) => Number.parseInt(s.trim(), 10))
  .filter((n) => !Number.isNaN(n));

const DEST_PINCODES = [
  '110001', '400001', '560001', '600001', '700001', '500001', '411001', '380001',
  '302001', '226001', '600020', '110002', '400020', '560020', '700020',
];

// --- custom metrics ------------------------------------------------------------
// `order_create_duration` lets us chart p50/p90/p99 of the resolver time
// without HTTP overhead. `order_success` is the input to the threshold.
const orderCreateDuration = new Trend('order_create_duration', true);
const orderSuccess = new Rate('order_success');
const ordersCreated = new Counter('orders_created');

export const options = {
  scenarios: {
    order_create: {
      executor: 'ramping-arrival-rate',
      // We control the rate directly, not the VU count — this lets us
      // hit 1K RPS with 200-300 VUs in a steady state.
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 600,
      stages: [
        { target: 1000, duration: '60s' }, // ramp 0 → 1K RPS
        { target: 1000, duration: '5m' },  // sustain
        { target: 0, duration: '30s' },    // graceful ramp-down
      ],
    },
  },
  // Thresholds: hard fail on regression. The 500ms p99 is the SLA
  // ceiling per the SS-035 spec.
  thresholds: {
    'http_req_duration{name:createOrder}': ['p(99)<500'],
    'order_success': ['rate>=0.995'],
    'checks': ['rate>=0.995'],
    'http_req_failed': ['rate<0.01'],
  },
  // We do NOT discard response bodies — we need to parse the GraphQL
  // `errors` array to compute the success rate. The 5K-RPS rate-shop
  // scenario can afford it; the 1K-RPS write path can too.
  discardResponseBodies: false,
};

// --- per-VU state --------------------------------------------------------------
// We keep a per-VU "sequence" counter so generated order numbers are unique
// across the run, but the load is still "spread" across user ids + pincodes
// to mimic a real fleet.
let vuSeq = 0;
const buildPayload = (vu) => {
  const seq = `${vu}__${vuSeq++}`;
  const orderNumber = `LT-PERF-${Date.now()}-${seq}-${randomString(6)}`;
  const userId = USER_ID_POOL[Math.floor(Math.random() * USER_ID_POOL.length)];
  const pincode = DEST_PINCODES[Math.floor(Math.random() * DEST_PINCODES.length)];
  return {
    orderNumber,
    total: 499.0 + Math.random() * 1500,
    userId,
    destinationName: 'Perf Customer',
    destinationPhone: '9999900001',
    destinationAddressLine1: '1 Test Street',
    destinationCity: 'Mumbai',
    destinationState: 'MH',
    destinationCountry: 'IN',
    destinationPincode: pincode,
    packageWeightGrams: 250 + Math.floor(Math.random() * 1500),
    packageLengthCm: 10 + Math.random() * 30,
    packageWidthCm: 10 + Math.random() * 30,
    packageHeightCm: 5 + Math.random() * 20,
    rankRate: false,
  };
};

const MUTATION = `
  mutation PerfCreateOrder($input: CreateOrderInput!) {
    createOrder(input: $input) {
      id
      orderNumber
    }
  }
`;

export default function () {
  const input = buildPayload(__VU);
  const res = http.post(
    `${STAGING_API_URL}/graphql`,
    JSON.stringify({ query: MUTATION, variables: { input } }),
    {
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${JWT_TOKEN}`,
      },
      tags: { name: 'createOrder' },
      timeout: '5s',
    },
  );

  const body = res.body ? JSON.parse(res.body) : {};
  const hasErrors = Array.isArray(body.errors) && body.errors.length > 0;
  const orderId = body.data && body.data.createOrder && body.data.createOrder.id;

  const ok = check(res, {
    'order_create_ok': (r) => r.status === 200 && !hasErrors && !!orderId,
    'order_create_latency_ok': (r) => r.timings.duration < 500,
  });

  // Custom trend excludes HTTP keep-alive / TLS time so a network-side
  // hiccup doesn't poison the resolver p99.
  orderCreateDuration.add(res.timings.duration);
  orderSuccess.add(ok);
  if (ok) ordersCreated.add(1);
}
