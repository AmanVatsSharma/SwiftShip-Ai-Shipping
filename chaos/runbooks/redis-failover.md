# Runbook: Redis outage

**Severity**: SEV-2 (degraded) → SEV-1 (writes failing)
**Service owner**: Platform / SRE
**On-call escalation**: PagerDuty `swiftship-platform`
**Last tested**: 2026-06-15 (chaos scenario `redis-down.js`)

## Symptoms

- `/health/ready` returns 503 in `kubectl describe pod` (K8s drains the pod)
- `/health` keeps returning 200 (process is up)
- BullMQ enqueue calls in `/api/v1/orders` return 503 with body `redis_unavailable`
- Rate-shop cache misses increase sharply; p99 latency for `/api/v1/rates` climbs from 80ms to 5–30s
- Grafana dashboard `Redis / Connections` shows `connected_clients=0`
- Prometheus alert `RedisDown` firing

## Quick triage (first 5 minutes)

1. **Confirm the outage scope**.
   ```bash
   kubectl -n swiftship exec deploy/api -- redis-cli -h $REDIS_HOST -p 6379 ping
   # expect: PONG  →  Redis is fine, jump to "API is the problem"
   # expect: timeout / connection refused  →  Redis is down, continue
   ```

2. **Check Redis pod status** (prod is on the managed Redis: `ApsaraDB` / `ElastiCache` / `Memorystore`).
   ```bash
   kubectl -n swiftship get pods -l app=redis
   # or, for managed: aws elasticache describe-replication-groups
   ```

3. **Look at the BullMQ queue depth**. Workers will retry forever with exponential backoff (base 2s, max 5 attempts). If Redis is gone for more than ~30 minutes, jobs are lost and we need to drain.
   ```bash
   kubectl -n swiftship exec deploy/api -- redis-cli -h $REDIS_HOST -p 6379 LLEN bull:webhook-dispatch:wait
   ```

## Recovery

### Option A — Redis pod restart (dev / single-node)

```bash
docker compose -f docker-compose.yml restart redis
# or in k8s:
kubectl -n swiftship rollout restart statefulset/redis
```

Wait for `redis-cli ping` to return `PONG` from inside the api pod, then poll `/health/ready` until it returns 200:

```bash
until [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/health/ready)" = "200" ]; do
  echo "waiting for readiness..."
  sleep 2
done
```

### Option B — Failover to replica (prod)

For managed Redis, trigger a manual failover:

```bash
# AWS ElastiCache
aws elasticache modify-replication-group \
  --replication-group-id swiftship-redis-prod \
  --primary-cluster-id swiftship-redis-prod-001 \
  --apply-immediately
```

This promotes the replica and the API's ioredis client (with `maxRetriesPerRequest: 2` and `enableReadyCheck: true`) reconnects within 5–10 seconds.

### Option C — Point at a hot standby

If both primary and replica are down, switch the API to a backup Redis (a snapshot we take every 6 hours):

```bash
# 1. restore the snapshot
kubectl -n swiftship exec deploy/redis-restore -- /scripts/restore.sh /backups/redis-2026-06-15-0600.rdb
# 2. point the API at the restored instance
kubectl -n swiftship set env deploy/api REDIS_URL=redis://redis-standby:6379
# 3. wait for the rollout
kubectl -n swiftship rollout status deploy/api
```

## After the outage

1. **Replay lost BullMQ jobs**. The `webhook-dispatch` and `label-generation` queues are durable; jobs that were mid-flight when Redis died are gone. Replay by:
   ```bash
   node scripts/replay-bull-jobs.js --queue webhook-dispatch --since 2026-06-15T12:00:00Z
   ```
2. **Clear the rate-shop cache**. After recovery the cache may be stale (rates change quickly during an incident). Force a cold start:
   ```bash
   kubectl -n swiftship exec deploy/api -- redis-cli -h $REDIS_HOST -p 6379 EVAL "for _,k in ipairs(redis.call('keys','rate:*')) do redis.call('del',k) end return 'ok'" 0
   ```
3. **File a postmortem** in `docs/postmortems/`. Required sections: timeline, customer impact (rate-shop requests failed, webhook deliveries delayed), what we'd change (see GAPS in `chaos/README.md`).

## Escalation

| Time | Action |
|------|--------|
| 0 min | On-call paged, joins #incident-swiftship |
| 15 min | No recovery in progress → loop in Platform lead |
| 30 min | Customer-facing impact (webhook delays, label gen failures) → SEV-1, page VP Engineering |
| 60 min | No path to recovery → consider emergency Redis provisioning from backup region |
