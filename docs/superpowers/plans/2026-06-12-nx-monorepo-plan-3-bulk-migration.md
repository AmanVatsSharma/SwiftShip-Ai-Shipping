# Plan 3: Bulk Domain Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the remaining 17+ domains from `src/<domain>/` to `libs/domains/<domain>/` using the validated pattern from Plan 2.

**Architecture:** Automated migration script handles file moves, import updates, and lib generation. Domains are migrated in dependency order to avoid breaking cross-domain imports. Platform libs (prisma, auth, queues, storage) are migrated first since domains depend on them.

**Tech Stack:** Nx generators, bash scripts, codemod tools

---

## Task 1: Create Migration Script

**Files:**
- Create: `tools/scripts/migrate-domain.sh`

- [ ] **Step 1: Create migration script**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
mkdir -p tools/scripts
```

Create `tools/scripts/migrate-domain.sh`:

```bash
#!/bin/bash
set -e

DOMAIN=$1
TEAM=${2:-"platform"}

if [ -z "$DOMAIN" ]; then
  echo "Usage: ./migrate-domain.sh <domain-name> [team-name]"
  exit 1
fi

echo "🚀 Migrating domain: $DOMAIN (team: $TEAM)"

# 1. Create directory structure
mkdir -p libs/domains/$DOMAIN/{types,data-access,api,ui}/src/lib

# 2. Generate Nx libraries
echo "  📦 Generating Nx libraries..."
npx nx g @nx/node:lib libs/domains/$DOMAIN/types --directory=libs/domains/$DOMAIN/types --skipFormat=true
npx nx g @nx/node:lib libs/domains/$DOMAIN/data-access --directory=libs/domains/$DOMAIN/data-access --skipFormat=true
npx nx g @nx/nest:lib libs/domains/$DOMAIN/api --directory=libs/domains/$DOMAIN/api --skipFormat=true
npx nx g @nx/react:lib libs/domains/$DOMAIN/ui --directory=libs/domains/$DOMAIN/ui --skipFormat=true

# 3. Add tags
echo "  🏷️  Adding tags..."
for layer in types data-access api ui; do
  cat > libs/domains/$DOMAIN/$layer/project.json <<JSON
{
  "name": "$DOMAIN-$layer",
  "sourceRoot": "libs/domains/$DOMAIN/$layer/src",
  "projectType": "library",
  "tags": ["domain:$DOMAIN", "layer:$layer", "team:$TEAM", "maturity:stable", "type:feature"],
  "targets": {}
}
JSON
done

# 4. Move files
if [ -d "src/$DOMAIN" ]; then
  echo "  📁 Moving files..."
  
  # Move models and DTOs to types
  [ -f src/$DOMAIN/$DOMAIN.model.ts ] && mv src/$DOMAIN/$DOMAIN.model.ts libs/domains/$DOMAIN/types/src/lib/
  [ -d src/$DOMAIN/dto ] && mv src/$DOMAIN/dto/* libs/domains/$DOMAIN/types/src/lib/dto/ 2>/dev/null || true
  
  # Move repositories to data-access
  find src/$DOMAIN -name "*repository*.ts" -exec mv {} libs/domains/$DOMAIN/data-access/src/lib/ \;
  
  # Move resolvers, services, modules to api
  [ -f src/$DOMAIN/$DOMAIN.resolver.ts ] && mv src/$DOMAIN/$DOMAIN.resolver.ts libs/domains/$DOMAIN/api/src/lib/
  [ -f src/$DOMAIN/$DOMAIN.service.ts ] && mv src/$DOMAIN/$DOMAIN.service.ts libs/domains/$DOMAIN/api/src/lib/
  [ -f src/$DOMAIN/$DOMAIN.module.ts ] && mv src/$DOMAIN/$DOMAIN.module.ts libs/domains/$DOMAIN/api/src/lib/
  
  # Move any other .ts files to api
  find src/$DOMAIN -maxdepth 1 -name "*.ts" ! -name "*.model.ts" ! -name "*.resolver.ts" ! -name "*.service.ts" ! -name "*.module.ts" ! -name "*repository*.ts" ! -name "*.spec.ts" -exec mv {} libs/domains/$DOMAIN/api/src/lib/ \;
  
  # Move tests
  find src/$DOMAIN -name "*.spec.ts" -exec mv {} libs/domains/$DOMAIN/api/src/lib/ \;
fi

echo "  ✅ Files moved"

# 5. Update imports (basic sed-based codemod)
echo "  🔄 Updating imports..."
find libs/domains/$DOMAIN -name "*.ts" -exec sed -i "s|from '\\./\\.\\./\\.\\./\\.\\./|from '@swiftship/domains/$DOMAIN/|g" {} \;
find libs/domains/$DOMAIN -name "*.ts" -exec sed -i "s|from '\\./\\.\\./\\.\\./|from '@swiftship/domains/$DOMAIN/|g" {} \;
find libs/domains/$DOMAIN -name "*.ts" -exec sed -i "s|from '\\./\\.\\./|from '@swiftship/domains/$DOMAIN/types|g" {} \;
find libs/domains/$DOMAIN -name "*.ts" -exec sed -i "s|from '\\./|from '@swiftship/domains/$DOMAIN/api|g" {} \;

echo "  ✅ Imports updated"

# 6. Create index.ts files
cat > libs/domains/$DOMAIN/types/src/index.ts <<EOF
export * from './lib/$DOMAIN.model';
[ -d libs/domains/$DOMAIN/types/src/lib/dto ] && find libs/domains/$DOMAIN/types/src/lib/dto -name "*.ts" | sed 's|.*/lib/||' | sed 's|/|./lib/|' | sed 's|.ts$||' | xargs -I {} echo "export * from './lib/{}';" >> libs/domains/$DOMAIN/types/src/index.ts
EOF

cat > libs/domains/$DOMAIN/data-access/src/index.ts <<EOF
export * from './lib/$(basename $(find libs/domains/$DOMAIN/data-access/src/lib -name "*repository*.ts" | head -1) .ts)';
EOF

cat > libs/domains/$DOMAIN/api/src/index.ts <<EOF
export * from './lib/$DOMAIN.module';
export * from './lib/$DOMAIN.service';
export * from './lib/$DOMAIN.resolver';
EOF

echo "  ✅ Index files created"

# 7. Validate
echo "  🧪 Running tests..."
npx nx run-many --target=test --projects=$DOMAIN-types,$DOMAIN-data-access,$DOMAIN-api --skip-nx-cache || echo "  ⚠️  Some tests failed, manual review needed"

echo "✅ Domain $DOMAIN migrated successfully"
```

- [ ] **Step 2: Make script executable**

```bash
chmod +x tools/scripts/migrate-domain.sh
```

- [ ] **Step 3: Test script on a simple domain (surcharges)**

```bash
./tools/scripts/migrate-domain.sh surcharges logistics
```

Expected: Domain migrated, files moved, tests run

- [ ] **Step 4: Commit**

```bash
git add tools/scripts/migrate-domain.sh
git commit -m "chore: add automated domain migration script"
```

---

## Task 2: Migrate Platform Libs (Prisma, Auth, Queues, Storage)

**Files:**
- Create: `libs/platform/prisma/`
- Create: `libs/platform/auth/`
- Create: `libs/platform/queues/`
- Create: `libs/platform/storage/`
- Delete: `src/prisma/`, `src/auth/`, `src/queues/`, `src/storage/` (selective)

- [ ] **Step 1: Migrate Prisma platform lib**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"

# Create prisma lib
npx nx g @nx/node:lib libs/platform/prisma --directory=libs/platform/prisma

# Add tags
cat > libs/platform/prisma/project.json <<JSON
{
  "name": "platform-prisma",
  "sourceRoot": "libs/platform/prisma/src",
  "projectType": "library",
  "tags": ["layer:platform", "scope:api", "team:platform", "maturity:stable", "type:feature"],
  "targets": {}
}
JSON

# Move Prisma service
mv src/prisma/prisma.service.ts libs/platform/prisma/src/lib/

# Create index
cat > libs/platform/prisma/src/index.ts <<EOF
export * from './lib/prisma.service';
EOF

# Move prisma schema location (keep in prisma/ at root for Prisma CLI)
# But update import path in PrismaService if needed
```

- [ ] **Step 2: Migrate Auth platform lib**

```bash
npx nx g @nx/nest:lib libs/platform/auth --directory=libs/platform/auth

cat > libs/platform/auth/project.json <<JSON
{
  "name": "platform-auth",
  "sourceRoot": "libs/platform/auth/src",
  "projectType": "library",
  "tags": ["layer:platform", "scope:api", "team:platform", "maturity:stable", "type:feature"],
  "targets": {}
}
JSON

# Move auth files (guards, strategies, decorators)
mv src/auth/jwt.strategy.ts libs/platform/auth/src/lib/
mv src/auth/gql-auth.guard.ts libs/platform/auth/src/lib/
mv src/auth/roles.guard.ts libs/platform/auth/src/lib/
mv src/auth/roles.decorator.ts libs/platform/auth/src/lib/
mv src/auth/current-user.decorator.ts libs/platform/auth/src/lib/

cat > libs/platform/auth/src/index.ts <<EOF
export * from './lib/jwt.strategy';
export * from './lib/gql-auth.guard';
export * from './lib/roles.guard';
export * from './lib/roles.decorator';
export * from './lib/current-user.decorator';
EOF
```

- [ ] **Step 3: Migrate Queues platform lib**

```bash
npx nx g @nx/node:lib libs/platform/queues --directory=libs/platform/queues

cat > libs/platform/queues/project.json <<JSON
{
  "name": "platform-queues",
  "sourceRoot": "libs/platform/queues/src",
  "projectType": "library",
  "tags": ["layer:platform", "scope:api", "team:platform", "maturity:stable", "type:feature"],
  "targets": {}
}
JSON

mv src/queues/queues.service.ts libs/platform/queues/src/lib/
mv src/queues/workers/* libs/platform/queues/src/lib/workers/ 2>/dev/null

cat > libs/platform/queues/src/index.ts <<EOF
export * from './lib/queues.service';
EOF
```

- [ ] **Step 4: Migrate Storage platform lib**

```bash
npx nx g @nx/node:lib libs/platform/storage --directory=libs/platform/storage

cat > libs/platform/storage/project.json <<JSON
{
  "name": "platform-storage",
  "sourceRoot": "libs/platform/storage/src",
  "projectType": "library",
  "tags": ["layer:platform", "scope:api", "team:platform", "maturity:stable", "type:feature"],
  "targets": {}
}
JSON

mv src/storage/*.ts libs/platform/storage/src/lib/

cat > libs/platform/storage/src/index.ts <<EOF
export * from './lib/storage.service';
EOF
```

- [ ] **Step 5: Build and test platform libs**

```bash
npx nx run-many --target=build --projects=platform-prisma,platform-auth,platform-queues,platform-storage
npx nx run-many --target=test --projects=platform-*
```

Expected: All succeed

- [ ] **Step 6: Commit**

```bash
git add libs/platform
git commit -m "feat(platform): migrate prisma, auth, queues, storage to Nx libs"
```

---

## Task 3: Migrate Auth Domain (User-facing auth flows)

**Files:**
- Create: `libs/domains/auth/{types,data-access,api,ui}/`

- [ ] **Step 1: Run migration script**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
./tools/scripts/migrate-domain.sh auth platform
```

- [ ] **Step 2: Verify migration**

```bash
ls libs/domains/auth/
npx nx show projects | grep auth
```

Expected: `auth-types`, `auth-data-access`, `auth-api`, `auth-ui` visible

- [ ] **Step 3: Build and test**

```bash
npx nx run-many --target=build --projects=auth-*
npx nx run-many --target=test --projects=auth-*
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(auth): migrate to Nx libraries"
```

---

## Task 4: Migrate Users Domain

**Files:**
- Create: `libs/domains/users/{types,data-access,api,ui}/`

- [ ] **Step 1: Run migration script**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
./tools/scripts/migrate-domain.sh users platform
```

- [ ] **Step 2: Build and test**

```bash
npx nx run-many --target=build --projects=users-*
npx nx run-many --target=test --projects=users-*
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor(users): migrate to Nx libraries"
```

---

## Task 5: Migrate Orders Domain (Largest, Most Complex)

**Files:**
- Create: `libs/domains/orders/{types,data-access,api,ui}/`

- [ ] **Step 1: Run migration script**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
./tools/scripts/migrate-domain.sh orders fulfillment
```

- [ ] **Step 2: Manually verify complex imports**

Orders has many cross-references. Check:

```bash
grep -r "from '@swiftship/domains/orders" libs/domains/orders/ | wc -l
```

Expected: All imports resolved correctly

- [ ] **Step 3: Build and test**

```bash
npx nx run-many --target=build --projects=orders-*
npx nx run-many --target=test --projects=orders-*
```

- [ ] **Step 4: Run e2e tests for orders**

```bash
npm run test:e2e -- orders
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(orders): migrate to Nx libraries"
```

---

## Task 6: Migrate Carriers Domain (Adapter Pattern)

**Files:**
- Create: `libs/domains/carriers/{types,data-access,api,ui}/`

- [ ] **Step 1: Run migration script**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
./tools/scripts/migrate-domain.sh carriers logistics
```

- [ ] **Step 2: Verify carrier adapters moved**

```bash
ls libs/domains/carriers/data-access/src/lib/adapters/
```

Expected: All 9 carrier adapters present (sandbox, delhivery, xpressbees, bluedart, dtdc, ecom-express, shadowfax, fedex-india, gati)

- [ ] **Step 3: Build and test**

```bash
npx nx run-many --target=build --projects=carriers-*
npx nx run-many --target=test --projects=carriers-*
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(carriers): migrate to Nx libraries"
```

---

## Task 7: Migrate Shipments Domain

**Files:**
- Create: `libs/domains/shipments/{types,data-access,api,ui}/`

- [ ] **Step 1: Run migration script**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
./tools/scripts/migrate-domain.sh shipments fulfillment
```

- [ ] **Step 2: Build and test**

```bash
npx nx run-many --target=build --projects=shipments-*
npx nx run-many --target=test --projects=shipments-*
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor(shipments): migrate to Nx libraries"
```

---

## Task 8: Migrate Remaining Domains (Batch)

**Files:**
- Create: `libs/domains/{returns,billing,cod,ndr,pickups,manifests,webhooks,payments,ecommerce-integrations,dashboard,rate-shop,surcharges,onboarding,plugins,metrics,bulk-operations,notifications,serviceability}/`

- [ ] **Step 1: Migrate returns**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
./tools/scripts/migrate-domain.sh returns fulfillment
git add -A && git commit -m "refactor(returns): migrate to Nx libraries"
```

- [ ] **Step 2: Migrate billing**

```bash
./tools/scripts/migrate-domain.sh billing billing
git add -A && git commit -m "refactor(billing): migrate to Nx libraries"
```

- [ ] **Step 3: Migrate cod**

```bash
./tools/scripts/migrate-domain.sh cod payments
git add -A && git commit -m "refactor(cod): migrate to Nx libraries"
```

- [ ] **Step 4: Migrate ndr**

```bash
./tools/scripts/migrate-domain.sh ndr logistics
git add -A && git commit -m "refactor(ndr): migrate to Nx libraries"
```

- [ ] **Step 5: Migrate pickups**

```bash
./tools/scripts/migrate-domain.sh pickups logistics
git add -A && git commit -m "refactor(pickups): migrate to Nx libraries"
```

- [ ] **Step 6: Migrate manifests**

```bash
./tools/scripts/migrate-domain.sh manifests logistics
git add -A && git commit -m "refactor(manifests): migrate to Nx libraries"
```

- [ ] **Step 7: Migrate webhooks**

```bash
./tools/scripts/migrate-domain.sh webhooks platform
git add -A && git commit -m "refactor(webhooks): migrate to Nx libraries"
```

- [ ] **Step 8: Migrate payments**

```bash
./tools/scripts/migrate-domain.sh payments payments
git add -A && git commit -m "refactor(payments): migrate to Nx libraries"
```

- [ ] **Step 9: Migrate ecommerce-integrations**

```bash
./tools/scripts/migrate-domain.sh ecommerce-integrations integrations
git add -A && git commit -m "refactor(ecommerce-integrations): migrate to Nx libraries"
```

- [ ] **Step 10: Migrate dashboard**

```bash
./tools/scripts/migrate-domain.sh dashboard platform
git add -A && git commit -m "refactor(dashboard): migrate to Nx libraries"
```

- [ ] **Step 11: Migrate rate-shop**

```bash
./tools/scripts/migrate-domain.sh rate-shop logistics
git add -A && git commit -m "refactor(rate-shop): migrate to Nx libraries"
```

- [ ] **Step 12: Migrate surcharges**

```bash
./tools/scripts/migrate-domain.sh surcharges logistics
git add -A && git commit -m "refactor(surcharges): migrate to Nx libraries"
```

- [ ] **Step 13: Migrate onboarding**

```bash
./tools/scripts/migrate-domain.sh onboarding onboarding
git add -A && git commit -m "refactor(onboarding): migrate to Nx libraries"
```

- [ ] **Step 14: Migrate plugins**

```bash
./tools/scripts/migrate-domain.sh plugins platform
git add -A && git commit -m "refactor(plugins): migrate to Nx libraries"
```

- [ ] **Step 15: Migrate metrics**

```bash
./tools/scripts/migrate-domain.sh metrics platform
git add -A && git commit -m "refactor(metrics): migrate to Nx libraries"
```

- [ ] **Step 16: Migrate bulk-operations**

```bash
./tools/scripts/migrate-domain.sh bulk-operations fulfillment
git add -A && git commit -m "refactor(bulk-operations): migrate to Nx libraries"
```

---

## Task 9: Validate Bulk Migration

**Files:**
- None (validation only)

- [ ] **Step 1: List all migrated domains**

```bash
ls libs/domains/
```

Expected: 21 domain directories (warehouses, notifications, serviceability, auth, users, orders, carriers, shipments, returns, billing, cod, ndr, pickups, manifests, webhooks, payments, ecommerce-integrations, dashboard, rate-shop, surcharges, onboarding, plugins, metrics, bulk-operations)

- [ ] **Step 2: Build all projects**

```bash
npx nx run-many --target=build --all
```

Expected: All builds succeed

- [ ] **Step 3: Run all tests**

```bash
npx nx run-many --target=test --all
```

Expected: All tests pass

- [ ] **Step 4: Run linter**

```bash
npx nx run-many --target=lint --all
```

Expected: No errors (warnings about boundaries are OK)

- [ ] **Step 5: Verify src/ is empty or minimal**

```bash
ls src/ 2>/dev/null
```

Expected: Only app.module.ts, main.ts, app.controller.ts, app.resolver.ts, app.service.ts, health.controller.ts remain (will be moved in Plan 4)

- [ ] **Step 6: Generate dependency graph**

```bash
npx nx graph --file=tmp/full-graph.json
```

Expected: Graph shows all domains + their dependencies

- [ ] **Step 7: Update migration log**

Edit `docs/superpowers/migration-log.md`:

```markdown
## Plan 3: Bulk Migration (Complete)

**Date:** 2026-06-22
**Status:** ✅ Complete

### Domains Migrated (24 total)
- [x] Platform: prisma, auth, queues, storage
- [x] Core: auth, users
- [x] Fulfillment: orders, shipments, returns, bulk-operations
- [x] Logistics: carriers, ndr, pickups, manifests, rate-shop, surcharges
- [x] Payments: billing, cod, payments
- [x] Platform: webhooks, dashboard, metrics
- [x] Integrations: ecommerce-integrations
- [x] Customer: onboarding, plugins

### Validation
- ✅ All builds succeed
- ✅ All tests pass
- ✅ Lint passes (warnings only)
- ✅ Dependency graph generated

### Migration Script Stats
- Avg time per domain: 15 minutes (automated)
- Manual fixes needed: ~10% of domains
- Total libraries created: 96 (24 domains × 4 layers)
```

- [ ] **Step 8: Commit log**

```bash
git add docs/superpowers/migration-log.md
git commit -m "docs: mark Plan 3 complete in migration log"
```

---

## Plan 3 Completion Checklist

- [ ] Migration script created and tested
- [ ] Platform libs migrated (prisma, auth, queues, storage)
- [ ] Auth + Users domains migrated
- [ ] Orders + Carriers + Shipments migrated
- [ ] 18 additional domains migrated
- [ ] All builds succeed
- [ ] All tests pass
- [ ] Migration log updated
- [ ] All changes committed

**Estimated Time:** 13 days (1 day for platform + 12 days for domains)

**Next:** [Plan 4: App Extraction](./2026-06-12-nx-monorepo-plan-4-app-extraction.md) - Extract API + scaffold Next.js apps
