# SwiftShip AI — k6 load test scenarios

> **SS-035 / Pillar 8 — Reliability.** Evidence of where the system
> breaks under load, before we sign production SLAs. Three independent
> scenarios, one idempotent seed, and a bottleneck report.

## Layout

```
loadtest/
├── README.md            ← this file
├── results/             ← empty; k6 dumps JSON summaries here
└── k6/
    ├── lib/
    │   └── seed.js      ← one-shot staging seeder (Node 20+)
    └── scenarios/
        ├── order-create.js    ← 1K RPS, p99<500ms, sustained 5m
        ├── rate-shop.js       ← 5K RPS, p99<200ms, sustained 10m
        └── graphql-rps.js     ← 10K RPS mixed (40/30/20/10), p99<300ms
```

## Prerequisites

1. **k6** ≥ v0.50 — install with one of:
   - macOS: `brew install k6`
   - Linux: `sudo apt-get install k6` (Debian/Ubuntu) or `sudo dnf install k6` (Fedora)
   - Windows: `winget install k6 --source winget` or `choco install k6`
   - Docker: `docker run --rm -i grafana/k6 run - <loadtest/k6/scenarios/order-create.js`
   - Source / binary: https://github.com/grafana/k6/releases
2. **Node 20+** (only needed for the seeder — the k6 scenarios themselves
   are pure JS executed by the k6 runtime).
3. A reachable **staging** API:
   - `STAGING_API_URL` — e.g. `https://staging.swiftship.in`
   - `STAGING_API_KEY` — a long-lived API key with `ADMIN` scope
     (used to seed tenants via the public `onboardTenant` mutation).
4. A **JWT** for one of the seeded tenants (used as the `Authorization:
   Bearer <jwt>` header in the GraphQL scenarios):
   - `JWT_TOKEN` — log in via `mutation { login(email, password) { accessToken } }`
     using the seed password. See `k6/lib/seed.js` for the deterministic
     `loadtest-tenant-NNN@loadtest.swiftship.in` email pattern.
5. A **tenant API key** (used for the public rate-shop endpoint):
   - `TENANT_API_KEY` — the `<prefix>.<plainText>` value returned by
     `onboardTenant`. The seed captures these into `loadtest/results/tenants.jsonl`.

## Quick start

```bash
# 1. Seed (idempotent — safe to re-run).
STAGING_API_URL=https://staging.swiftship.in \
STAGING_API_KEY=ssk_admin.xxx.yyy \
npm run loadtest:seed

# 2. Run scenarios. k6 will write JSON summaries into loadtest/results/.
JWT_TOKEN=eyJ... \
TENANT_API_KEY=ssk_xxx.yyy \
npm run loadtest:order-create
JWT_TOKEN=eyJ... \
TENANT_API_KEY=ssk_xxx.yyy \
npm run loadtest:rate-shop
JWT_TOKEN=eyJ... \
TENANT_API_KEY=ssk_xxx.yyy \
npm run loadtest:graphql-rps
```

`npm run` aliases are defined at the root of the monorepo. Each is a
thin wrapper around `k6 run`:

| Script | Wraps | What it does |
|---|---|---|
| `loadtest:seed` | `node loadtest/k6/lib/seed.js` | 100 tenants, 10K orders |
| `loadtest:order-create` | `k6 run loadtest/k6/scenarios/order-create.js` | 1K RPS, p99<500ms, 5 min |
| `loadtest:rate-shop` | `k6 run loadtest/k6/scenarios/rate-shop.js` | 5K RPS, p99<200ms, 10 min |
| `loadtest:graphql-rps` | `k6 run loadtest/k6/scenarios/graphql-rps.js` | 10K RPS mixed, p99<300ms |

## Thresholds (SLA gates)

Every threshold below is enforced by k6 — the process exits non-zero on
a fail. The numbers in this table are written into the scenario files
themselves, not just here, so CI / `npx nx run-many -t lint typecheck`
can detect a regression after a PR lands.

| Scenario | RPS | p99 | p95 | Error rate | Sustained |
|---|---|---|---|---|---|
| `order-create.js` | 1 000 | < 500 ms | < 300 ms | < 1 % | 5 min |
| `rate-shop.js` | 5 000 | < 200 ms | < 120 ms | < 1 % | 10 min |
| `graphql-rps.js` rateShop | 4 000 | < 200 ms | < 120 ms | < 1 % | 5 min |
| `graphql-rps.js` orderList | 3 000 | < 300 ms | < 200 ms | < 1 % | 5 min |
| `graphql-rps.js` tracking | 2 000 | < 300 ms | < 200 ms | < 1 % | 5 min |
| `graphql-rps.js` tenantQuery | 1 000 | < 200 ms | < 120 ms | < 1 % | 5 min |

`order-create.js` adds a **99.5 %** check-rate gate (the spec is more
lenient for write traffic than for read traffic).

## Expected baseline numbers

These are the numbers we expect to see on staging with the current
production-shape Postgres 16 + Redis 7 + 2× API pod topology, BEFORE
the bottleneck-driven scaling work in EPIC-RELIABILITY starts. They
are written into the threshold gates above and a regression fires
`nx test k6-loadtest` automatically.

| Scenario | Median | p95 | p99 | Notes |
|---|---|---|---|---|
| `order-create.js` | ~80 ms | ~250 ms | ~400 ms | WAL-flush on the orders table is the floor |
| `rate-shop.js` | ~12 ms | ~80 ms | ~160 ms | Cache-hit dominated; L1 = Redis, L2 = DB |
| `graphql-rps.js` rateShop | ~12 ms | ~80 ms | ~160 ms | identical to `rate-shop.js` |
| `graphql-rps.js` orderList | ~60 ms | ~180 ms | ~280 ms | `orders` joins warehouse + carrier |
| `graphql-rps.js` tracking | ~25 ms | ~120 ms | ~200 ms | cache-warmed in-process |
| `graphql-rps.js` tenantQuery | ~10 ms | ~50 ms | ~100 ms | smallest payload, fastest path |

If the **p99 is consistently above** the threshold for 3 consecutive
runs, that scenario is failing its SLA and a follow-up bead is filed
(see "Bottleneck report" below).

## Tracking events

The original spec calls for 100K fake tracking events pushed via the
tracking ingest endpoint. The `seed.js` script currently does NOT push
them inline (it would dominate seed runtime: 100K round trips at ~5ms
each = 8+ minutes, and the dedicated scenarios don't read tracking
events from the DB on the hot path).

The `ingestTracking(...)` helper in `seed.js` is wired and ready for
the dedicated tracking-e2e benchmark (a follow-up bead: SS-035-track).
When that's written, the seeder can be re-run with
`SEED_TRACKING=1 npm run loadtest:seed` to push the events.

## Bottleneck report

The point of this bead is evidence, not vibes. After every run,
k6 drops a JSON summary at `loadtest/results/<scenario>-summary.json`
and a raw metrics stream at `loadtest/results/<scenario>.csv`. The
three "top suspects" below are the components we expect to break
first, the SQL / commands to confirm, and the follow-up bead
template to file. **Do this before the next reliability bead
(SS-036 chaos scenarios) is scheduled.**

### 1. Postgres connection pool saturation

The default `pg.Pool` is 10 connections per pod, 2 pods = 20
connections. k6 will chew through that in the first 200ms of the
`order-create` ramp.

```sql
-- 1a. Active connections vs. max
SELECT count(*) FILTER (WHERE state = 'active')   AS active,
       count(*) FILTER (WHERE state = 'idle')     AS idle,
       count(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_tx,
       (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_conn
  FROM pg_stat_activity
 WHERE datname = current_database();

-- 1b. Per-application breakdown — find the hung queries.
SELECT application_name, state, count(*)
  FROM pg_stat_activity
 WHERE datname = current_database()
 GROUP BY 1, 2
 ORDER BY 3 DESC;

-- 1c. Long-running statements (the ones saturating the pool).
SELECT pid, now() - query_start AS duration, state, query
  FROM pg_stat_activity
 WHERE datname = current_database()
   AND state <> 'idle'
   AND query_start IS NOT NULL
 ORDER BY duration DESC
 LIMIT 20;
```

**What to look for:** `active` near `max_connections`; `idle_in_tx`
non-zero for >30s (a bug in a resolver that didn't `COMMIT`).
**Action:** bump pool size to 50/pod in `typeorm.module.ts` *and*
file SS-035-pg-pool.

### 2. GraphQL resolver chain slow points

The N+1 problem is the canonical resolver bottleneck. Use Apollo's
tracing payload (`extensions.tracing`) — every scenario above tags
the request with `name:` so we can split p99 by resolver in Grafana
via the `http_req_duration{name=...}` metric.

For a one-shot read:

```bash
curl -sS -X POST https://staging.swiftship.in/graphql \
  -H "content-type: application/json" \
  -H "authorization: Bearer $JWT_TOKEN" \
  -d '{"query":"{ orders { id } }", "extensions":{"tracing":{"format":"EXTENDED"}}}'
```

Look for `resolvers[]` where `duration > 100ms` and the path contains
`shipments.warehouse` or `returns`. That's the N+1.
**Action:** add a DataLoader / preload, file SS-035-n1-resolver.

### 3. Redis throughput

`@swiftship/platform-rate-cache` is supposed to be the read-path
shortcut. If the rate-shop p99 is over budget but the API pods are
idle, the cache is missing.

```bash
# 3a. Hit rate.
redis-cli INFO stats | grep -E 'keyspace_hits|keyspace_misses'
# Hit rate = hits / (hits + misses). Target: >95% for rate-shop.

# 3b. Operations per second (run during the k6 run).
redis-cli --stat -i 1
# Watch `instantaneous_ops_per_sec`. Drop in ops/sec during the rate-shop
# ramp means the cache is missing the keys.

# 3c. Top keys (find the hot ones).
redis-cli --hotkeys
```

**Action:** if `instantaneous_ops_per_sec` is below 5K during the
5K-RPS rate-shop scenario, the cache key shape is wrong — the request
fanout is not getting collapsed. File SS-035-rate-cache-key.

### Follow-up bead template

Drop this into a new bead file when any of the above fires:

```markdown
## SS-035-<bottleneck>: <one-line title>

**Type:** chore / bug
**Priority:** P1
**Parent:** EPIC-RELIABILITY
**Source:** SS-035 k6 run on <date>

### Evidence
- Scenario: `<order-create|rate-shop|graphql-rps>`
- p99: <measured> ms (threshold: <sla> ms)
- Postgres active connections: <n> / <max>
- Redis instantaneous_ops_per_sec: <n>
- Apollo resolver top offender: <name> at <duration> ms

### Hypothesis
<One paragraph: what is the most likely root cause?>

### Fix sketch
<One paragraph: which file / which knob changes?>
```

## Operational notes

- **Don't run against production.** Staging only. The seeder will
  create real `loadtest-tenant-NNN` rows; the cleanup story is "drop
  the staging DB before the next anchor pilot" (see SS-039).
- **Run in CI nightly**, not on every PR — the 5/10-minute durations
  are too long for a PR gate. The nightly job writes the JSON summaries
  to a S3 bucket; regressions page on-call.
- **Vary the topology.** The numbers in this README assume 2 API pods.
  Re-run with 1 / 2 / 4 / 8 pods to plot the scaling curve; the slope
  tells you whether the bottleneck is API-process-CPU or downstream
  (DB / Redis / carrier calls).
