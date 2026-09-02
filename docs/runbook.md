# SwiftShip On-Call Runbook (LAUNCH_PLAN.md Phase 2)

Incident playbook for the SwiftShip API and its dependencies. This is the
**front page** during an incident: triage here, then drill into the deeper
chaos runbooks where referenced.

| | |
|---|---|
| Alerts source | `deploy/prometheus/alerts/swiftship-api.rules.yml` (evaluated by Prometheus, `deploy/prometheus/prometheus.yml`) |
| Dashboards | Grafana `deploy/grafana/dashboards/swiftship-api.json` (local: http://localhost:3001) |
| Status page | Upptime — `.upptimerc.yml` + `.github/workflows/status-check.yml` |
| Logs | Loki via promtail (`deploy/loki/`) — JSON lines, filter on `correlationId` |
| Errors | Sentry (see `docs/observability.md` §3) |
| Deep runbooks | `chaos/runbooks/redis-failover.md`, `chaos/runbooks/postgres-failover.md`, `chaos/runbooks/carrier-timeout.md` |
| Cluster ops | `deploy/k8s/README.md` |

## Severity ladder

| Sev | Meaning | Response |
|---|---|---|
| SEV-1 | Writes/money failing, multi-service outage | Page immediately, status page incident, comms every 30 min |
| SEV-2 | Degraded (queues stalled, one carrier down, latency) | Page, comms hourly |
| SEV-3 | Single-tenant / cosmetic / monitoring-only | Handle in working hours |

Escalation timing tables per scenario are in each chaos runbook. Even a
1-person rotation (current state, per LAUNCH_PLAN.md) should follow the same
clock: acknowledge in 5 min, escalate to founder at 30 min.

## Alert routing

| Alert (prometheus alerts file) | Severity | Section below |
|---|---|---|
| `SwiftShipApiDown` | critical | §1 |
| `SwiftShipApiScrapeTargetMissing` | critical | §6 |
| `SwiftShipApiSlowScrape` | warning | §1 |
| `SwiftShipApiRestarted` / `SwiftShipApiUptimeFlapping` | warning/critical | §1 |
| `SwiftShipApiHeapPressure` / `SwiftShipApiRssHigh` | warning | §1 |
| `PostgresPrimaryDown`, `RedisDown`, `CarrierBreakerOpen`, 5xx/latency alerts | — | **not yet active** — rules exist commented-out; see §7 gaps. Detect via status page / Sentry / symptoms until then |

---

## 1. API 5xx spike / API down

**Symptoms**: status page shows `/health` or `/graphql` down; `SwiftShipApiDown`
firing; Sentry event flood; customers report 500s.

1. **Confirm scope** — one endpoint or all?
   ```bash
   curl -i http://localhost:3000/health          # liveness
   curl -i http://localhost:3000/health/ready    # readiness (note: shallow today, §7)
   curl -i http://localhost:3000/metrics         # is the process even up?
   ```
   In k8s: `kubectl -n swiftship get pods -l app=api` and
   `kubectl -n swiftship describe pod <pod>` (probe failures show here).
2. **Correlate with a deploy** — most 5xx spikes are regressions.
   ```bash
   kubectl -n swiftship rollout history deploy/api
   kubectl -n swiftship rollout undo deploy/api   # if the spike started right after a rollout
   ```
3. **Pull one failing request end-to-end** — take an `X-Request-Id` from a
   customer report (or Sentry event tag `correlationId`) and grep Loki / the
   audit log:
   ```sql
   SELECT createdAt, action, resource_type, resource_id, ip_address
   FROM audit_logs WHERE correlation_id = '<id>' ORDER BY created_at;
   ```
   See `docs/observability.md` §1 for the correlation-ID contract.
4. **Check the dependency boxes** (§2 Postgres, §3 Redis) before blaming app
   code — `connection terminated` bodies point at Postgres, `redis_unavailable`
   at Redis.
5. **If crash-looping** (`SwiftShipApiUptimeFlapping`): check pod events for
   OOMKilled (`SwiftShipApiRssHigh` firing beforehand is the tell), take a
   heap snapshot if survivable, else restart with
   `kubectl -n swiftship rollout restart deploy/api`.
6. **Once stable**: file a postmortem in `docs/postmortems/` (same sections
   the chaos runbooks require: timeline, impact, what we'd change).

Verification after recovery: the smoke matrix in `docs/observability.md` §6.

## 2. Postgres down / failover

**Authoritative playbook: [`chaos/runbooks/postgres-failover.md`](../chaos/runbooks/postgres-failover.md)** — this section only orients you.

- **Confirm**: `kubectl -n swiftship exec deploy/api -- pg_isready -h $PG_HOST -p 5432`
  ("accepting connections" → the DB is fine, problem is elsewhere — go to §1).
- **Stuck transactions block promotion** — kill them first (exact SQL is in
  the chaos runbook).
- **SLA**: writes must resume within **30s** of the primary returning;
  anything longer is a P0 follow-up.
- **Recovery options** (in order): StatefulSet self-heal → managed failover
  (`aws rds failover-db-cluster` / `gcloud sql instances failover`) → restore
  from backup (last resort, `chaos/runbooks/postgres-failover.md` Option C).
- **Post-recovery**: check for lost writes, `VACUUM (ANALYZE)`, postmortem.
- Note: the `PostgresPrimaryDown` Prometheus alert is **not active yet**
  (no postgres exporter — §7); you will learn about this from the status
  page, pod readiness, or customer reports first.

## 3. Redis down — queues stall

**Authoritative playbook: [`chaos/runbooks/redis-failover.md`](../chaos/runbooks/redis-failover.md)**.

- **Blast radius**: BullMQ queues (`webhook-dispatch`, `label-generation`)
  stall and `POST /api/v1/orders` returns 503 `redis_unavailable`; rate-shop
  cache misses → p99 on `/api/v1/rates` climbs to 5–30s.
- **Confirm**: `redis-cli -h $REDIS_HOST ping` from inside an api pod.
- **Recovery**: restart (`kubectl -n swiftship rollout restart statefulset/redis`
  or `docker compose restart redis`) → managed failover → hot standby, in
  that order (details in the chaos runbook).
- **After**: replay lost BullMQ jobs (`scripts/replay-bull-jobs.js`), flush
  the stale rate cache (`rate:*` keys — command in the runbook), postmortem.
- Jobs mid-flight are **lost** after ~30 min of outage — treat that window as
  data loss and replay.

## 4. Carrier adapter timeouts

**Authoritative playbook: [`chaos/runbooks/carrier-timeout.md`](../chaos/runbooks/carrier-timeout.md)**.

- Each carrier has its own circuit breaker
  (`libs/platform/rate-cache/src/lib/circuit-breaker.service.ts`): 3 failures
  in 30s → OPEN (fail-fast `circuit_open`) → HALF_OPEN after 60s.
- **Triage**: read breaker state from Redis (`GET breaker:<CARRIER>:state`),
  check the carrier's own status page (URLs in the runbook), then decide
  ours-vs-theirs.
- **Default action is wait** — the breaker self-heals. Escalate to manual
  replay / carrier pinning (`carrier_policies.disabled_until`, SQL in the
  runbook) only when OPEN >15–30 min.
- **Never** re-enable a carrier we can't fulfil — per LAUNCH_PLAN.md Phase 1,
  uncontracted carriers must stay deactivated in the registry.
- The `CarrierBreakerOpen` alert is **not active yet** (breaker state is Redis
  keys, not metrics — §7); watch the Grafana breaker panel / Redis keys.

## 5. COD reconciliation mismatch

**Severity**: SEV-3 (few disputes) → SEV-2 (a whole bank's remittance file
unmatched; merchant money questions). Target: ≥99.5% of COD reconciled
within 48h (LAUNCH_PLAN.md Phase 3 kill/scale criteria).

**Where the machinery lives**: `libs/domains/billing/src/lib/cod-remittance/`
— `cod-reconciliation.service.ts` (matching + invariant
`matched + disputed == remittances`), `cod-remittance-cron.service.ts`
(creates `BankCodDisputeEntity` rows), and the per-bank statement parsers
(`cod-bank-statement-parser` specs cover the 5 formats).

1. **Quantify** — count open disputes by reason tag:
   ```sql
   SELECT reason, count(*), sum(amount)
   FROM bank_cod_disputes   -- BankCodDisputeEntity
   WHERE status = 'OPEN'
   GROUP BY reason;
   ```
   Reason tags come from `DISPUTE_REASONS`:
   - `AMOUNT_MISMATCH` — courier remittance ≠ bank credit (fees deducted,
     partial remittance). Check the carrier's COD deduction rate changed.
   - `NO_BANK_MATCH` — remittance with no bank row (or ref format changed).
   - `DATE_OUT_OF_WINDOW` — money arrived outside the matching window.
2. **Bank-format drift is the #1 cause** (LAUNCH_PLAN.md Phase 1 flags it).
   If one bank's disputes jump: diff today's statement export against the
   parser fixture (`libs/domains/billing/src/lib/cod-remittance/__tests__/`)
   and fix the parser before re-running.
3. **Re-run the reconciliation** for the affected window (the cron service /
   `cod-reconciliation.service.ts` is idempotent — matched rows are skipped).
4. **Merchant comms** — for a specific tenant's mismatch, pull their remittance
   timeline and answer with numbers; the dispute queue exists precisely so
   nothing is silently written off.
5. **Postmortem** if a single run produced >0.5% disputes — parser drift or a
   carrier fee change; both need a contract-test fixture added.

## 6. Status page communication steps

The status page is Upptime (`.upptimerc.yml` at repo root; checks run via
`.github/workflows/status-check.yml`). Upptime opens/updates a GitHub issue
per incident and republishes the site.

1. **Declare early** — at SEV-1/SEV-2, declare within 15 min of
   acknowledgement, even without a cause. Templates:
   - *Investigating*: "We are investigating elevated error rates on the
     SwiftShip API. Label generation may be delayed."
   - *Identified*: "Cause identified: <one line>. Fix in progress."
   - *Monitoring*: "Fix deployed, monitoring recovery."
   - *Resolved*: always include duration + affected surface + postmortem ETA.
2. **Declare on the status page** — Upptime: an incident is the site issue
   opened by the checker; comment updates on that issue. For a manually
   declared incident (checker blind, e.g. DB down with shallow `/health/ready`
   — §7), open an issue on the repo so the page reflects it.
3. **Cadence**: SEV-1 every 30 min, SEV-2 hourly, until *Monitoring*.
4. **Never** name customers/tenants on the public page; surfaces only
   (`API`, `Tracking site`, `Label generation`).
5. **Resolve + postmortem**: close the incident issue (page flips green),
   publish the postmortem in `docs/postmortems/` within 48h for SEV-1.
6. Comms channels for tenants: the pilot WhatsApp group
   (`docs/anchor-tenant-pilot.md`) + the status page.

## 7. Monitoring gaps (known, deliberate)

These are the deltas between this runbook and reality — fix them as Phase 2
continues, in this order:

1. **Rules not loaded in the compose stack yet**: docker-compose.observability.yml
   mounts only the prometheus.yml *file*. Add one volume to the `prometheus`
   service:
   `- ./deploy/prometheus/alerts:/etc/prometheus/alerts:ro`
   (`rule_files` is already wired in `deploy/prometheus/prometheus.yml` with a
   glob, so Prometheus boots either way.)
2. **Notification wiring**: Grafana contact point
   `deploy/grafana/provisioning/alerting/` expects `SS_ALERT_WEBHOOK_URL` on
   the `grafana` service; rules themselves still need an Alertmanager (or
   Grafana alertmanager-mode) to be paged — until then, poll the status page
   and Grafana.
3. **No HTTP metrics**: `/metrics`
   (`libs/observability/src/lib/metrics.controller.ts`) exposes only
   `process_uptime_seconds`, `nodejs_heap_size_used_bytes`,
   `nodejs_heap_size_total_bytes`, `nodejs_rss_bytes`. 5xx-rate, p95-latency
   and error-rate alerts are written but **commented out** in the rules file
   until prom-client + an http histogram are adopted.
4. **No postgres/redis exporters**: `PostgresPrimaryDown` / `RedisDown`
   alerts commented out until exporter scrape jobs exist.
5. **Shallow readiness**: `/health/ready` returns 200 without probing
   Postgres/Redis (`apps/api/src/health.controller.ts`) — the status page
   cannot see dependency outages yet. The chaos runbooks describe the deep
   behaviour; the code doesn't implement it.
6. **Status page is dev-pointed**: `.upptimerc.yml` targets
   `localhost:3000`; prod URLs are commented inside it and the schedule in
   `status-check.yml` is commented out until domains are live.

## 8. Verification

```bash
# YAML sanity for everything in this stack
node -e "const y=require('js-yaml');const f=require('fs');['deploy/prometheus/prometheus.yml','deploy/prometheus/alerts/swiftship-api.rules.yml','deploy/grafana/provisioning/alerting/swiftship-contact-point.yml','deploy/grafana/provisioning/alerting/swiftship-notification-policy.yml','.upptimerc.yml','.github/workflows/status-check.yml'].forEach(p=>{y.load(f.readFileSync(p,'utf8'));console.log(p+' OK')})"

# Prometheus config + rules (needs promtool, e.g. via the compose image)
docker compose -f docker-compose.observability.yml exec prometheus promtool check config /etc/prometheus/prometheus.yml

# Full typecheck/test gates: docs/observability.md §6
npx nx run-many -t typecheck --all
```
