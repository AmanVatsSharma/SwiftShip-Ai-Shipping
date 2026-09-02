# SwiftShip Kubernetes Manifests

This directory contains the Kubernetes manifests for deploying the SwiftShip monorepo (`apps/api`, `apps/web`, `apps/admin-portal`) along with its data tier (Postgres + Redis).

## Layout

| File | Purpose |
|------|---------|
| `00-namespace.yaml` | Creates the `swiftship` namespace with the `app.kubernetes.io/part-of: swiftship` label. |
| `10-config.yaml` | `ConfigMap` (`swiftship-config`) for non-secret env vars and `Secret` (`swiftship-secrets`) placeholders for sensitive values. |
| `20-postgres.yaml` | Postgres 16 `StatefulSet` (1 replica, 20Gi PVC) + headless `Service`. |
| `21-redis.yaml` | Redis 7 `Deployment` (5Gi PVC) + `Service`. |
| `30-api.yaml` | `apps/api` Deployment (2 replicas), ClusterIP `Service`, `Ingress` on `api.swiftship.ai`. |
| `31-web.yaml` | `apps/web` Deployment (2 replicas), ClusterIP `Service`, `Ingress` on `swiftship.ai`. |
| `32-admin-portal.yaml` | `apps/admin-portal` Deployment (1 replica), ClusterIP `Service`, `Ingress` on `admin.swiftship.ai`. |
| `40-hpa.yaml` | `HorizontalPodAutoscaler` for `api` and `web` (min 2 / max 10, target 70% CPU). |

## API versions

- `apps/v1` — Deployments, StatefulSets
- `v1` — Services, ConfigMap, Secret, PersistentVolumeClaim, Namespace
- `networking.k8s.io/v1` — Ingress
- `autoscaling/v2` — HorizontalPodAutoscaler

## Image tags

The manifests default to `:latest` for all three services. Before applying, edit the `image:` fields in `30-api.yaml`, `31-web.yaml`, and `32-admin-portal.yaml` to pin a specific release:

```yaml
image: ghcr.io/swiftship/api:v1.2.3
image: ghcr.io/swiftship/web:v1.2.3
image: ghcr.io/swiftship/admin-portal:v1.2.3
```

## imagePullSecrets

All application Deployments reference a secret named `ghcr-pull-secret` so pods can pull from `ghcr.io/swiftship/*`. Create it once per cluster (per namespace) with a GitHub PAT that has `read:packages` scope:

```bash
kubectl create secret docker-registry ghcr-pull-secret \
  --namespace swiftship \
  --docker-server=ghcr.io \
  --docker-username=<github-username> \
  --docker-password=<github-pat> \
  --docker-email=<github-email>
```

If you do not pull from a private registry, simply remove the `imagePullSecrets` block from `30-api.yaml`, `31-web.yaml`, and `32-admin-portal.yaml`.

## Secret values

`10-config.yaml` ships placeholder `stringData` for the `swiftship-secrets` Secret. **Replace every `CHANGEME` value before applying** — these include:

- `DATABASE_URL` (used by `api` and matched by Postgres init)
- `JWT_SECRET`
- `STRIPE_SECRET_KEY`, `RAZORPAY_KEY_SECRET`
- `SHOPIFY_API_SECRET`
- `SENDGRID_API_KEY`
- `S3_SECRET_ACCESS_KEY`

You can edit them in-place and re-apply, or generate a sealed/encrypted manifest for your environment.

The Postgres `StatefulSet` derives `POSTGRES_USER`/`POSTGRES_PASSWORD` from a parse of `DATABASE_URL`; if you change the URL, ensure the user and database match what the API expects (default user `swiftship`, default db `swiftship`).

## Ingress hosts

Ingress hosts are placeholders and currently point to:

- `api.swiftship.ai` → `api` Service
- `swiftship.ai` → `web` Service
- `admin.swiftship.ai` → `admin-portal` Service

All Ingresses assume the `nginx` `ingressClassName`. Update both the `host:` field and your DNS records to match your environment.

## Applying

After editing image tags and the Secret, apply the whole directory:

```bash
kubectl apply -f deploy/k8s/
```

The order in the directory is numeric for clarity, but `kubectl apply -f` on a directory processes files alphabetically — to be safe you can apply in order:

```bash
kubectl apply -f deploy/k8s/00-namespace.yaml
kubectl apply -f deploy/k8s/10-config.yaml
kubectl apply -f deploy/k8s/20-postgres.yaml
kubectl apply -f deploy/k8s/21-redis.yaml
kubectl apply -f deploy/k8s/30-api.yaml
kubectl apply -f deploy/k8s/31-web.yaml
kubectl apply -f deploy/k8s/32-admin-portal.yaml
kubectl apply -f deploy/k8s/40-hpa.yaml
```

## Verifying

```bash
kubectl -n swiftship get pods
kubectl -n swiftship get svc
kubectl -n swiftship get ingress
kubectl -n swiftship get hpa
```

The API should pass its readiness probe at `GET /health/ready` once the NestJS app has started, the GraphQL schema has been generated, and the Postgres/Redis connections are healthy.

## Production image

The canonical API image is built by the **root `Dockerfile`** (multi-stage, Nx-based). `docker-compose.yml` and `.github/workflows/release.yml` both build from it; there is no per-app Dockerfile for `apps/api`.

### Build

```bash
# Locally (from the repo root — the whole workspace is the build context)
docker build -f Dockerfile -t swiftship-api:local .

# CI: release.yml builds and pushes on every v*.*.* tag
#   ghcr.io/<org>/<repo>/api:<tag>  and  :latest
```

The build stages are: `deps` (`npm ci` from the root lockfile), `build` (`npx nx build api` → `dist/apps/api/main.js`, plus `npx nx build typeorm` → the CommonJS datasource used for migrations), `prod-deps` (`npm ci --omit=dev`), and a slim `node:22-alpine` `runner` that ships only `dist/apps/api`, `dist/libs/platform/typeorm`, production `node_modules`, and `docker-entrypoint.sh`.

### Entrypoint

`docker-entrypoint.sh` runs before the app:

1. Runs all pending TypeORM migrations (registered in `libs/platform/typeorm/src/lib/datasource.ts`), one transaction each.
2. Forces `DB_SYNCHRONIZE=false` (the schema is owned by migrations — never `synchronize` in production).
3. `exec node dist/apps/api/main.js` as the unprivileged `node` user.

Set `MIGRATIONS_ENABLED=false` to skip step 1 — useful when you prefer running migrations as a dedicated Job/initContainer instead of per-pod. Note: with multiple replicas booting simultaneously (the `api` Deployment runs 2), pods may race on a cold database; already-applied migrations are skipped, but for a strict single-runner guarantee either use an initContainer or set `MIGRATIONS_ENABLED=false` on the Deployment and run migrations via a one-off Job using the same image.

### Required env / secret keys

| Key | Required | Notes |
|-----|----------|-------|
| `DATABASE_URL` | yes | Postgres URL (also parsed by the Postgres StatefulSet init) |
| `REDIS_URL` | yes | BullMQ / rate-cache |
| `JWT_SECRET` | yes | Auth token signing |
| `DB_SYNCHRONIZE` | recommended `false` | Entrypoint enforces `false` when it runs migrations |
| `MIGRATIONS_ENABLED` | optional | `false` disables startup migrations |
| `CHANNEL_ENCRYPTION_KEY` | for channel sync | AES-256-GCM key for stored channel credentials |
| `SENTRY_DSN`, `SENTRY_RELEASE` | optional | No-ops when unset |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME` | optional | OTLP/HTTP traces |

The k8s Secret (`swiftship-secrets`) and ConfigMap (`swiftship-config`) already cover the required keys; add the optional ones there if you need them. The image exposes `:3000` and reports health via `wget GET /health/ready` (image `HEALTHCHECK` — Kubernetes uses its own probes and ignores it).
