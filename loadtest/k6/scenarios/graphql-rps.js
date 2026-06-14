/**
 * SS-035 — graphql-rps scenario.
 *
 * Mixed-query "production-like" read load at 10K RPS. The 40/30/20/10
 * distribution mirrors what we expect the live API to look like once
 * we have anchors onboarded:
 *
 *   40% rate-shop     — POST /api/v1/rate-shop/rank (REST, not GraphQL)
 *   30% order-list    — GraphQL `orders` query (paginated)
 *   20% tracking      — GraphQL `shipment` query
 *   10% other         — GraphQL `tenant` lookup
 *
 * The scenario is structured to model the public API surface as a
 * whole. We compose four sub-excutors with `ramping-arrival-rate`
 * weighted by the percentages above; the union is the 10K RPS
 * target. Thresholds are per-operation so a slow resolver doesn't
 * poison a fast one.
 *
 * Thresholds (hard gates):
 *   http_req_duration{name:rateShop}:p99    < 200ms
 *   http_req_duration{name:orderList}:p99   < 300ms
 *   http_req_duration{name:tracking}:p99    < 300ms
 *   http_req_duration{name:tenantQuery}:p99 < 200ms
 *   http_req_failed:rate                   < 1%
 *
 * Run:
 *   k6 run \
 *     -e STAGING_API_URL=https://staging.swiftship.in \
 *     -e JWT_TOKEN=eyJ... \
 *     -e TENANT_API_KEY=ssk_xxx.yyy \
 *     loadtest/k6/scenarios/graphql-rps.js
 */
import http from 'k6/http';
import { check } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const STAGING_API_URL = __ENV.STAGING_API_URL || 'http://localhost:3000';
const JWT_TOKEN = __ENV.JWT_TOKEN || '';
const TENANT_API_KEY = __ENV.TENANT_API_KEY || '';

// 10K RPS split: 4000 / 3000 / 2000 / 1000.
const TOTAL_RPS = Number.parseInt(__ENV.TOTAL_RPS || '10000', 10);
const RPS_RATESHOP = Math.floor(TOTAL_RPS * 0.4);
const RPS_ORDERLIST = Math.floor(TOTAL_RPS * 0.3);
const RPS_TRACKING = Math.floor(TOTAL_RPS * 0.2);
const RPS_OTHER = TOTAL_RPS - RPS_RATESHOP - RPS_ORDERLIST - RPS_TRACKING;

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

const gQLLatency = new Trend('graphql_latency', true);
const gQLSuccess = new Rate('graphql_success');

export const options = {
  scenarios: {
    rate_shop: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 500,
      stages: [
        { target: RPS_RATESHOP, duration: '60s' },
        { target: RPS_RATESHOP, duration: '5m' },
        { target: 0, duration: '30s' },
      ],
      exec: 'rateShop',
    },
    order_list: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 500,
      stages: [
        { target: RPS_ORDERLIST, duration: '60s' },
        { target: RPS_ORDERLIST, duration: '5m' },
        { target: 0, duration: '30s' },
      ],
      exec: 'orderList',
    },
    tracking: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 300,
      stages: [
        { target: RPS_TRACKING, duration: '60s' },
        { target: RPS_TRACKING, duration: '5m' },
        { target: 0, duration: '30s' },
      ],
      exec: 'tracking',
    },
    other: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { target: RPS_OTHER, duration: '60s' },
        { target: RPS_OTHER, duration: '5m' },
        { target: 0, duration: '30s' },
      ],
      exec: 'otherQuery',
    },
  },
  thresholds: {
    'http_req_duration{name:rateShop}': ['p(99)<200'],
    'http_req_duration{name:orderList}': ['p(99)<300'],
    'http_req_duration{name:tracking}': ['p(99)<300'],
    'http_req_duration{name:tenantQuery}': ['p(99)<200'],
    'http_req_failed': ['rate<0.01'],
    'graphql_success': ['rate>=0.99'],
  },
  // orderList parses `data.orders.length`, so we keep the body.
  discardResponseBodies: false,
};

const ORDER_LIST_QUERY = `
  query PerfOrders {
    orders {
      id
      orderNumber
      status
      total
      createdAt
    }
  }
`;

const TRACKING_QUERY = `
  query PerfTracking($id: Int!) {
    shipment(id: $id) {
      id
      trackingNumber
      status
      updatedAt
    }
  }
`;

const TENANT_QUERY = `
  query PerfTenant($id: ID!) {
    tenant(id: $id) {
      id
      slug
      name
      tier
      status
    }
  }
`;

const pickPair = () => PINCODE_PAIRS[Math.floor(Math.random() * PINCODE_PAIRS.length)];

export function rateShop() {
  const [origin, dest] = pickPair();
  const res = http.post(
    `${STAGING_API_URL}/api/v1/rate-shop/rank`,
    JSON.stringify({
      originPincode: origin,
      destinationPincode: dest,
      weightGrams: 250 + Math.floor(Math.random() * 1500),
      paymentMethod: Math.random() < 0.5 ? 'PREPAID' : 'COD',
      strategy: 'best_value',
    }),
    {
      headers: {
        'content-type': 'application/json',
        'x-swiftship-api-key': TENANT_API_KEY,
      },
      tags: { name: 'rateShop' },
      timeout: '2s',
    },
  );
  const ok = check(res, { 'rate_shop_ok': (r) => r.status === 200 });
  gQLSuccess.add(ok);
}

export function orderList() {
  const res = http.post(
    `${STAGING_API_URL}/graphql`,
    JSON.stringify({ query: ORDER_LIST_QUERY }),
    {
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${JWT_TOKEN}`,
      },
      tags: { name: 'orderList' },
      timeout: '3s',
    },
  );
  const ok = check(res, {
    'order_list_ok': (r) => r.status === 200,
    'order_list_has_data': (r) => {
      if (r.status !== 200) return false;
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.data && body.data.orders);
      } catch (_) {
        return false;
      }
    },
  });
  gQLLatency.add(res.timings.duration);
  gQLSuccess.add(ok);
}

export function tracking() {
  // Random shipment id in [1, 10000] matches the seeded order pool.
  const shipmentId = 1 + Math.floor(Math.random() * 10000);
  const res = http.post(
    `${STAGING_API_URL}/graphql`,
    JSON.stringify({ query: TRACKING_QUERY, variables: { id: shipmentId } }),
    {
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${JWT_TOKEN}`,
      },
      tags: { name: 'tracking' },
      timeout: '3s',
    },
  );
  const ok = check(res, { 'tracking_ok': (r) => r.status === 200 });
  gQLLatency.add(res.timings.duration);
  gQLSuccess.add(ok);
}

export function otherQuery() {
  // Random tenant id in [1, 100] matches the seeded tenant pool.
  const tenantId = 1 + Math.floor(Math.random() * 100);
  const res = http.post(
    `${STAGING_API_URL}/graphql`,
    JSON.stringify({ query: TENANT_QUERY, variables: { id: String(tenantId) } }),
    {
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${JWT_TOKEN}`,
      },
      tags: { name: 'tenantQuery' },
      timeout: '2s',
    },
  );
  const ok = check(res, { 'tenant_query_ok': (r) => r.status === 200 });
  gQLSuccess.add(ok);
}
