# Runbook: Postgres primary restart / failover

**Severity**: SEV-1 (writes fail during failover)
**Service owner**: Platform / DBA
**On-call escalation**: PagerDuty `swiftship-data`
**Last tested**: 2026-06-15 (chaos scenario `postgres-failover.js`)

## Symptoms

- `/health/ready` returns 503; K8s drains the api pod
- `/health` keeps returning 200 (the Node process is up; Postgres is the failure)
- POST `/api/v1/orders` returns 500 with body `connection terminated` or hangs up to 30s
- Grafana dashboard `Postgres / Connections` shows `active=0` for the primary
- Long-running queries in `pg_stat_activity` with `state=idle in transaction` (stuck connections holding WAL replay)
- Prometheus alert `PostgresPrimaryDown` firing

## SLA

- The chaos scenario asserts the API resumes writes within 30s of the primary coming back. Anything longer than that is a hard SLA breach and triggers a P0 follow-up bead.

## Quick triage (first 5 minutes)

1. **Confirm the failure mode**.
   ```bash
   kubectl -n swiftship exec deploy/api -- pg_isready -h $PG_HOST -p 5432
   # expect: "accepting connections"  →  primary is up; jump to "API is the problem"
   # expect: "no response"  →  primary is down, continue
   ```

2. **Check who is primary**.
   ```bash
   psql $DATABASE_URL -c "SELECT pg_is_in_recovery(), inet_server_addr()"
   # t = replica, f = primary
   ```

3. **Check stuck transactions** (these are the dangerous ones — they prevent replica promotion).
   ```bash
   psql $DATABASE_URL -c "
     SELECT pid, usename, state, now() - state_change AS stuck_for, left(query, 80) AS query
       FROM pg_stat_activity
      WHERE datname = current_database()
        AND state IS NOT NULL
        AND now() - state_change > interval '5 seconds'
      ORDER BY stuck_for DESC"
   ```
   If you see long-running transactions, **kill them** before promoting the replica:
   ```bash
   psql $DATABASE_URL -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND now() - state_change > interval '5 seconds'"
   ```

## Recovery

### Option A — Self-heal: pod restart

If the failure is a crash or a stuck `postgres` process, the StatefulSet will auto-restart. The TypeORM connection pool in the API retries on the next request — confirm:

```bash
kubectl -n swiftship rollout status statefulset/postgres
# wait for "1/1 ready"
# then
until [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/health/ready)" = "200" ]; do
  echo "waiting for readiness..."
  sleep 2
done
```

### Option B — Promote the replica (managed: AWS RDS / Cloud SQL)

```bash
# AWS RDS
aws rds failover-db-cluster --db-cluster-identifier swiftship-prod
# Cloud SQL
gcloud sql instances failover swiftship-prod
```

Promotion typically takes 30–60s. The API's pool drops existing connections, then `CREATE EXTENSION` and the next request succeed. The chaos scenario asserts a write completes within 5s of `pg_isready` returning 0.

### Option C — Restore from backup (catastrophic)

Use this only if both primary and replica are gone:

```bash
# 1. Find the latest WAL-archived backup
aws s3 ls s3://swiftship-pg-backups/ | tail -5
# 2. Spin up a new instance from the backup
node scripts/restore-pg.js --backup 2026-06-15-0600 --target pg-recovery.swiftship.internal
# 3. Point the API at the recovery instance
kubectl -n swiftship set env deploy/api DATABASE_URL=postgres://postgres:postgres@pg-recovery.swiftship.internal:5432/swiftship
# 4. Roll out
kubectl -n swiftship rollout status deploy/api
```

## After the outage

1. **Check for lost writes**. Postgres is durable; if the chaos scenario shows 0 writes lost, document that. If any were lost, file a data-integrity bead.
2. **Vacuum and reindex** (heavy write workload during recovery can leave dead tuples).
   ```bash
   psql $DATABASE_URL -c "VACUUM (ANALYZE, VERBOSE)"
   psql $DATABASE_URL -c "REINDEX DATABASE swiftship"
   ```
3. **File a postmortem** in `docs/postmortems/`. Include: replication lag at the time, how many writes hit 5xx, how long the failover took (compare to the 30s SLA).

## Escalation

| Time | Action |
|------|--------|
| 0 min | On-call paged, joins #incident-swiftship |
| 10 min | Failover not in progress → loop in DBA |
| 30 min | SLA breach (writes still failing) → SEV-1, page VP Engineering + Customer Success |
| 60 min | No path to recovery → SEV-1, invoke DR plan (Option C) |
