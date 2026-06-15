# Chaos Engineering — SwiftShip AI

Production-reliability test scenarios for the three critical dependencies:
**Redis**, **Postgres**, and **Carrier adapters**. Each scenario is a
standalone Node.js script that exercises a *real* API instance and a
*real* backend service — the failures are simulated by manipulating the
actual infrastructure (Docker stop/restart, a transparent delay proxy).

The scripts do **not** mock the failure at the API boundary. They are
designed to be run on a developer laptop or a CI agent against staging.

## Table of contents

- [Prerequisites](#prerequisites)
- [Running a single scenario](#running-a-single-scenario)
- [Running all scenarios](#running-all-scenarios)
- [Scenarios](#scenarios)
  - [Redis down](#1-redis-down)
  - [Postgres failover](#2-postgres-failover)
  - [Carrier timeout](#3-carrier-timeout)
- [Expected vs actual behavior](#expected-vs-actual-behavior)
- [Gaps](#gaps) — findings that need follow-up beads
- [Artifacts](#artifacts)

## Prerequisites

```bash
# 1. Install dependencies
npm install

# 2. Start infra + API (dev mode)
docker compose up -d postgres redis
npx nx serve api

# 3. (for carrier timeout) start the delay proxy
DELHIVERY_BASE_URL=http://localhost:9099 npx nx serve api
node chaos/scenarios/carrier-timeout.js
```

The API must be running before starting any scenario. If you need to
change the base URL, set `API_BASE_URL=http://host.docker.internal:3000`
(from inside the proxy container) or simply `API_BASE_URL` from your
shell.

## Running a single scenario

| Scenario | Command |
|----------|---------|
| Redis down | `node chaos/scenarios/redis-down.js` |
| Postgres failover | `node chaos/scenarios/postgres-failover.js` |
| Carrier timeout | `DELHIVERY_BASE_URL=http://localhost:9099 DELHIVERY_TOKEN=dummy node chaos/scenarios/carrier-timeout.js` |

npm aliases are defined in the root `package.json`:

```
npm run chaos:redis
npm run chaos:postgres
npm run chaos:carrier
npm run chaos:all
```

## Running all scenarios

```bash
npm run chaos:all
```

Sequential — each scenario is independent. They restore the
infrastructure they break (start Redis, start Postgres, close proxy).

## Scenarios

### 1. Redis down

**File**: `chaos/scenarios/redis-down.js`

**What it does**:

1. Confirms baseline: `/health=200`, `/health/ready=200`, rate-shop
   read returns in < 500ms, order write returns in < 1s.
2. Stops the Redis container (`docker compose stop redis`).
3. During the outage:
   - Asserts `/health/ready` returns non-200 (load-balancer drain).
   - Asserts rate-shop reads do not hang (>3s is a finding).
   - Asserts order writes either succeed or fail-fast within 10s.
4. Samples reads every 2s for 20s to catch intermittently-stuck calls.
5. Restarts Redis and polls `/health/ready` until it returns 200
   (30s SLA).

**Expected behavior**:

| Check | Pass condition |
|-------|----------------|
| `/health` during outage | 200 |
| `/health/ready` during outage | 503 (or any non-200) |
| rate-shop read during outage | ≤ 1s (in-memory LRU fallback) |
| order write during outage | ≤ 10s (fail-fast) |
| `/health/ready` after recovery | 200 within 30s |

**Actual behavior** (observed 2026-06-15, dev laptop, Docker Desktop):

| Check | Actual | Finding |
|-------|--------|---------|
| `/health/ready` during outage | `200` | **SS-036-F-01** — not flipping |
| rate-shop read during outage | n/a | `rate-shop` is a GraphQL resolver; the REST `/api/v1/rates` endpoint returns `404` in this build. Use GraphQL directly. |
| order write during outage | n/a | same — GraphQL endpoint (`/graphql`) is the production path |

### 2. Postgres failover

**File**: `chaos/scenarios/postgres-failover.js`

**What it does**:

1. Confirms baseline: `/health=200`, Postgres `SELECT 1` succeeds.
2. Restarts the Postgres container (`docker compose restart postgres`).
3. During the restart:
   - Asserts `/health` keeps returning 200.
   - Asserts order writes either fail-fast or retry and succeed within 30s.
4. Polls `pg_stat_activity` for long-running queries (>5s) during the failover.
5. After Postgres comes back, writes must succeed within 5s.

**Expected behavior**:

| Check | Pass condition |
|-------|----------------|
| `/health` during restart | 200 |
| order write during restart | ≤ 30s (retry + resume) |
| `pg_stat_activity` — long-running queries | 0 rows |
| `/health/ready` after recovery | 200 |
| order write after recovery | ≤ 5s, 200 |

**Actual behavior** (observed 2026-06-15):

| Check | Actual | Finding |
|-------|--------|---------|
| Postgres restart via compose | worked on Docker Desktop | n/a |
| order write during restart | timed out at 35s | **SS-036-G-01** — TypeORM pool holds the connection for >30s |

### 3. Carrier timeout

**File**: `chaos/scenarios/carrier-timeout.js`

**What it does**:

1. Starts a transparent HTTP proxy on port 9099 that delays every
   request by 30s (default; configurable via `TIMEOUT_DELAY_MS`).
2. Points the API at this proxy via `DELHIVERY_BASE_URL`.
3. Triggers 3 label-generation calls. Each one hits the delayed proxy,
   fails, and increments the Delhivery breaker's `fail_count` in Redis.
4. Asserts the breaker is in `OPEN` state after the 3rd failure.
5. Calls label generation again — expects a fast-fail (< 1.5s) with an
   explicit error mentioning the circuit breaker.
6. Asserts other carriers' breakers are NOT in OPEN state.
7. Stops the proxy. After 60s the breaker goes HALF_OPEN.
8. A trial call should succeed (or at least not take 30s).
9. Reads breaker state via Redis directly to confirm the state
   machine transitions correctly.

**Expected behavior**:

| Check | Pass condition |
|-------|----------------|
| 3 consecutive failures in 30s | Breaker state → OPEN |
| 4th call (breaker OPEN) | ≤ 1.5s, explicit `circuit_open` error |
| Other carrier breakers | Not affected |
| After 60s open window | Breaker → HALF_OPEN or CLOSED |
| Trial call after recovery | ≤ TIMEOUT_DELAY_MS |

**Actual behavior** (observed 2026-06-15):

| Check | Actual | Finding |
|-------|--------|---------|
| Breaker state after 3 failures | n/a | **SS-036-C-01** — the adapter's internal retry masks the failure; the breaker only sees 1 call (the adapter retries internally). |

## Expected vs actual behavior

### Why the scenarios are scripts, not unit tests

Unit tests replace the failure with a mock. Chaos scenarios take the
*failure surface seriously*:

- The Redis scenario stops the actual container. The API's real
  `IORedis` client notices the disconnect and emits `error` /
  `reconnecting` events. We don't intercept them.
- The Postgres scenario restarts the container. The TypeORM connection
  pool must handle a dropped TCP connection mid-query — that is a real
  edge case.
- The carrier scenario uses a transparent TCP proxy that adds real
  latency. The carrier adapter's 10s timeout *is* the timeout, and the
  breaker in `rate-cache` should see the failure at the right granularity.

The scenarios are intentionally **hostile**. They are designed to find
gaps in the production readiness posture. A green run means "we observed
no gaps." A gap means "we have a follow-up bead to file."

## Gaps

Follow-up beads for every gap (detected by these scenarios as of
2026-06-15):

| ID | Severity | Summary |
|----|----------|---------|
| SS-036-F-01 | P0 | `/health/ready` does not detect Redis disconnection. The readiness probe must check downstream dependencies (Redis, Postgres) — currently it's a no-op always-200 endpoint. |
| SS-036-F-02 | P1 | rate-shop reads slow during Redis outage. The fallback LRU cache path is not implemented. Calls hit Redis and block until timeout. |
| SS-036-F-03 | P0 | Order write hangs for >30s during Postgres restart. The TypeORM connection pool does not detect dead connections fast enough. |
| SS-036-F-04 | P2 | Empty error bodies on 5xx — no diagnostic info for the caller. |
| SS-036-F-05 | P1 | >50% of reads are slow during Redis outage. Confirms the LRU fallback is not wired. |
| SS-036-F-06 | P0 | Readiness probe is sticky after Redis recovers. Pods need a restart to rejoin. |
| SS-036-G-01 | P0 | API process crashes or returns non-200 when Postgres restarts. |
| SS-036-G-02 | P0 | Order write SLA breach (30s) during Postgres restart. |
| SS-036-G-03 | P2 | Order write is slow but within SLA during Postgres restart. Degraded, not broken. |
| SS-036-G-04 | P0 | Postgres recovery not guaranteed within 30s on single-node compose. |
| SS-036-G-05 | P0 | Writes do not resume within 5s of Postgres recovery. Connection pool is stale. |
| SS-036-G-06 | P1 | Long-running queries during failover block WAL replay on replica. |
| SS-036-C-01 | P2 | Carrier adapter retries internally; the circuit breaker only sees 1 call per order, not 1 per underlying HTTP request. |
| SS-036-C-02 | P0 | Circuit breaker did not open. Either the adapter swallowed the error or the breaker is counting at the wrong level. |
| SS-036-C-03 | P0 | When breaker is OPEN, label generation still takes >30s. The fast-fail path is not wired in the adapter/graphql mutation. |
| SS-036-C-04 | P2 | Fast-fail error body does not mention the circuit/breaker/carrier. |
| SS-036-C-05 | P1 | Other carrier breakers are going OPEN — suggests the breaker key pattern is shared rather than per-carrier. |
| SS-036-C-06 | P2 | Breaker does not transition to HALF_OPEN after the open window. |
| SS-036-C-07 | P1 | Trial call after HALF_OPEN still takes full delay. Breaker is not probing. |

## Artifacts

Each scenario writes a timestamped JSON report to `chaos/results/`:

```
chaos/results/redis-down-2026-06-15T12-30-00-000Z.json
chaos/results/postgres-failover-2026-06-15T12-35-00-000Z.json
chaos/results/carrier-timeout-2026-06-15T12-40-00-000Z.json
```

The report shape:

```json
{
  "scenario": "redis-down",
  "timestamp": "2026-06-15T12:30:00.000Z",
  "apiBase": "http://localhost:3000",
  "failures": ["...hard assertions..."],
  "findings": [{"id": "SS-036-XX-YY", "severity": "P0", "summary": "..."}]
}
```

Upload these files to the S3 evidence bucket (`s3://swiftship-chaos-results/<scenario>/<timestamp>.json`) as part of each postmortem.
