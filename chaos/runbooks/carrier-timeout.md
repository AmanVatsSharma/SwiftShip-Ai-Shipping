# Runbook: Carrier timeout (e.g. Delhivery down or slow)

**Severity**: SEV-3 (single carrier degraded) → SEV-2 (multiple carriers)
**Service owner**: Carrier Integrations / Platform
**On-call escalation**: PagerDuty `swiftship-carriers`
**Last tested**: 2026-06-15 (chaos scenario `carrier-timeout.js`)

## Background

Each carrier (Delhivery, BlueDart, Xpressbees, etc.) has its own circuit
breaker in `libs/platform/rate-cache/src/lib/circuit-breaker.service.ts`:

- **CLOSED** — normal traffic.
- **OPEN** — 3 failures in 30s trips the breaker. Subsequent calls
  fail fast with a `circuit_open` error.
- **HALF_OPEN** — after 60s the breaker lets one trial call through.
  Success → CLOSED. Failure → OPEN for another 60s.

The breaker is per-carrier. When Delhivery is down, the other 12
carriers in the registry keep working.

## Symptoms

- Customers report `failed to generate label: circuit_open` for orders
  that route to the affected carrier
- Grafana dashboard `Carriers / Circuit Breakers` shows the carrier in
  the `OPEN` state
- Carrier-specific dashboard (e.g. `Delhivery / API Latency`) shows
  p99 > 25s or error rate > 50%
- Prometheus alert `CarrierBreakerOpen` firing for ≥1 carrier

## Quick triage (first 5 minutes)

1. **Identify the carrier(s)**.
   ```bash
   kubectl -n swiftship exec deploy/api -- redis-cli -h $REDIS_HOST -p 6379 KEYS 'breaker:*:state'
   kubectl -n swiftship exec deploy/api -- redis-cli -h $REDIS_HOST -p 6379 GET breaker:DELHIVERY:state
   ```

2. **Check the carrier's status page** (have these URLs bookmarked):
   - Delhivery: `https://track.delhivery.com/api/p/status`
   - BlueDart: `https://api.bluedart.com/status`
   - Xpressbees: `https://www.xbees.in/status`
   - etc.

3. **Check our own recent error rate** for that carrier.
   ```bash
   # last 5 minutes, filtered to the carrier
   logcli query '{carrier="DELHIVERY"} | json | level="error"' --since=5m
   ```

4. **Decide if the issue is ours or theirs**. If we see 5xx from the
   carrier's API in the chaos scenario's `node chaos/scenarios/carrier-timeout.js`
   output, it's the carrier. If we see timeouts at the TCP level,
   check our egress / NAT.

## Recovery

### Option A — Wait for the breaker to recover (default)

The breaker goes HALF_OPEN after 60s. As long as the carrier recovers
within a few minutes, the system self-heals.

- Monitor the Grafana panel `Carriers / Circuit Breakers` — the
  state should transition from `OPEN` to `HALF_OPEN` to `CLOSED` over
  the next 1–2 minutes.
- If the breaker re-opens 3 times in a row, escalate to Option B.

### Option B — Manual retry of failed orders

Some orders will have been in flight when the breaker opened. Once
the carrier is back, replay them:

```bash
# List failed label-generation jobs from the last hour
node scripts/list-failed-jobs.js --queue label-generation --since 1h --carrier DELHIVERY
# Replay
node scripts/replay-bull-jobs.js --queue label-generation --since 1h --carrier DELHIVERY
```

The replay is idempotent: the carrier adapter's `generateLabel` checks
for an existing AWB before issuing a new one.

### Option C — Pin orders to a different carrier

For high-value orders we can route around the broken carrier using a
priority override. This requires DBA access to the `shipments` table
and is a last-resort action — usually only justified if a single
carrier is down for >30 minutes.

```sql
-- Mark Delhivery as "do not use" for the next 4 hours
UPDATE carrier_policies
   SET priority = 0, disabled_until = now() + interval '4 hours'
 WHERE carrier_code = 'DELHIVERY'
   AND tenant_id = $TENANT_ID;
```

Revert with:

```sql
UPDATE carrier_policies
   SET priority = 1, disabled_until = NULL
 WHERE carrier_code = 'DELHIVERY'
   AND tenant_id = $TENANT_ID;
```

### Option D — Contact the carrier

If the carrier's status page is silent but our breaker has been OPEN
for >15 minutes, file a ticket with the carrier.

| Carrier | Support email | Phone |
|---------|---------------|-------|
| Delhivery | support@delhivery.com | +91-124-4135000 |
| BlueDart | customerservice@bluedart.com | +91-80-2511-3466 |
| Xpressbees | support@xpressbees.com | +91-20-6712-7777 |
| Shadowfax | support@shadowfax.in | +91-80-4718-4444 |

(Update this table as carrier contacts change. Last verified 2026-06-15.)

## After the outage

1. **Run the chaos scenario again** to confirm the breaker is back to CLOSED.
   ```bash
   node chaos/scenarios/carrier-timeout.js
   ```
2. **Check the rate-shop cache**. The breaker tripped on a stale
   rate card. Warm the cache:
   ```bash
   node scripts/warm-rate-cache.js --carrier DELHIVERY
   ```
3. **File a postmortem** in `docs/postmortems/`. Include: which
   carrier, how long the breaker was OPEN, how many orders hit
   `circuit_open`, whether we fell back to another carrier or just
   failed.

## Escalation

| Time | Action |
|------|--------|
| 0 min | On-call paged, joins #incident-swiftship |
| 15 min | Breaker still OPEN → loop in Carrier Integrations lead |
| 30 min | Customer-facing impact (label generation failing) → SEV-2, page VP Engineering |
| 60 min | Multiple carriers affected → SEV-1, invoke the multi-carrier DR plan |
