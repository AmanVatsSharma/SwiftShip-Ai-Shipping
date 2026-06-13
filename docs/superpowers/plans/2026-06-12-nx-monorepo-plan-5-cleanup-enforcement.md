# Plan 5: Cleanup & Full Boundary Enforcement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the old `src/` directory completely, enable full boundary enforcement (change warnings to errors), optimize build performance, and add bundle size budgets.

**Architecture:** Clean slate with only the Nx workspace structure. ESLint boundaries become hard errors preventing architectural violations. Bundle budgets enforce performance standards. Nx Cloud caching enabled for distributed builds.

**Tech Stack:** Nx, ESLint, bundle analyzer

---

## Task 1: Verify Old src/ Is Empty or Has No Critical Files

**Files:**
- None (validation only)

- [ ] **Step 1: List src/ directory**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
ls -la src/
```

- [ ] **Step 2: Verify only non-critical files remain**

Expected: Either empty, or only:
- `schema.graphql` (generated, will be moved)
- `*.spec.ts` (old test files for deleted code)

- [ ] **Step 3: Search for any remaining imports from src/**

```bash
grep -r "from 'src/" apps/ libs/ --include="*.ts" --include="*.tsx" 2>/dev/null
```

Expected: No results

- [ ] **Step 4: Search for any relative imports that might be broken**

```bash
grep -r "from '\\.\\./\\.\\./src" apps/ libs/ --include="*.ts" --include="*.tsx" 2>/dev/null
```

Expected: No results

---

## Task 2: Move Generated GraphQL Schema

**Files:**
- Move: `src/schema.graphql` → `apps/api/src/app/schema.graphql`

- [ ] **Step 1: Check if schema.graphql exists**

```bash
ls -la src/schema.graphql 2>/dev/null
```

- [ ] **Step 2: Move schema to apps/api**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
mkdir -p apps/api/src/app
[ -f src/schema.graphql ] && mv src/schema.graphql apps/api/src/app/
```

- [ ] **Step 3: Verify app.module.ts points to new location**

Check `apps/api/src/app/app.module.ts` has:

```typescript
autoSchemaFile: join(process.cwd(), 'apps/api/src/app/schema.graphql'),
```

- [ ] **Step 4: Build API to regenerate schema**

```bash
npx nx build api
```

Expected: Schema regenerated in new location

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: move schema.graphql to apps/api"
```

---

## Task 3: Remove Old src/ Directory

**Files:**
- Delete: `src/` (entire directory)

- [ ] **Step 1: Final check src/ contents**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
ls -la src/ 2>/dev/null
```

- [ ] **Step 2: Delete src/ directory**

```bash
rm -rf src/
```

- [ ] **Step 3: Verify deletion**

```bash
ls -la src/ 2>&1
```

Expected: `No such file or directory`

- [ ] **Step 4: Run all tests to ensure nothing broke**

```bash
npx nx run-many --target=test --all
```

Expected: All tests pass

- [ ] **Step 5: Build everything**

```bash
npx nx run-many --target=build --all
```

Expected: All builds succeed

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove old src/ directory"
```

---

## Task 4: Update package.json Scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Read current scripts**

```bash
cat package.json | grep -A 20 '"scripts"'
```

- [ ] **Step 2: Add Nx scripts**

Replace scripts section in `package.json`:

```json
{
  "scripts": {
    "nx": "nx",
    "start": "nx serve",
    "build": "nx build",
    "test": "nx test",
    "lint": "nx lint",
    "e2e": "nx e2e",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,js,jsx,json,md}\"",
    "affected:build": "nx affected:build",
    "affected:test": "nx affected:test",
    "affected:lint": "nx affected:lint",
    "affected:e2e": "nx affected:e2e",
    "graph": "nx graph",
    "workspace-generator": "nx workspace-generator",
    "reset": "nx reset && rm -rf node_modules/.cache",
    "codegen": "nx run shared-graphql:generate",
    "serve:api": "nx serve api",
    "serve:admin": "nx serve admin-portal",
    "serve:customer": "nx serve customer-portal",
    "serve:partner": "nx serve partner-portal"
  }
}
```

- [ ] **Step 3: Remove old NestJS-specific scripts**

Delete these if present:
- `"start:dev"`
- `"start:debug"`
- `"start:prod"`
- `"test:watch"`
- `"test:debug"`
- `"test:cov"`

- [ ] **Step 4: Verify scripts work**

```bash
npm run graph --help
```

Expected: Nx graph help shown

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "chore: update package.json with Nx scripts"
```

---

## Task 5: Enable Full Boundary Enforcement

**Files:**
- Modify: `eslint.config.mjs` (or `.eslintrc.json`)

- [ ] **Step 1: Read current ESLint config**

```bash
cat eslint.config.mjs 2>/dev/null || cat .eslintrc.json
```

- [ ] **Step 2: Change boundary rule from "warn" to "error"**

Find:

```javascript
'@nx/enforce-module-boundaries': ['warn', { ... }]
```

Replace with:

```javascript
'@nx/enforce-module-boundaries': ['error', { ... }]
```

- [ ] **Step 3: Add additional boundary constraints**

Add stricter rules:

```javascript
'@nx/enforce-module-boundaries': [
  'error',
  {
    enforceBuildableLibDependency: true,
    allowCircularSelfDependency: false,
    banTransitiveDependencies: true,
    checkDynamicDependenciesExceptions: ['^node:', '^react', '^next', '^@apollo', '^@nestjs', '^@prisma'],
    depConstraints: [
      // ... existing constraints ...
      
      // STRICT: UI cannot import from data-access or API
      { sourceTag: 'layer:ui', onlyDependOnLibsWithTags: ['layer:types', 'layer:utils', 'layer:ui'] },
      
      // STRICT: Data-access cannot import from API or UI
      { sourceTag: 'layer:data-access', onlyDependOnLibsWithTags: ['layer:types', 'layer:platform', 'type:types'] },
      
      // STRICT: Types cannot import anything
      { sourceTag: 'layer:types', onlyDependOnLibsWithTags: [] },
      
      // STRICT: Cross-domain only via types
      { sourceTag: 'domain:*', onlyDependOnLibsWithTags: ['layer:types', 'layer:utils', 'domain:types'] }
    ]
  }
]
```

- [ ] **Step 4: Run lint to find violations**

```bash
npx nx run-many --target=lint --all 2>&1 | tee /tmp/lint-violations.txt
```

- [ ] **Step 5: Fix any violations**

Review `/tmp/lint-violations.txt` and fix each:

```bash
# Common fixes:
# 1. UI importing from data-access → move logic to types or use GraphQL
# 2. Cross-domain imports → import from types only
# 3. Types importing runtime code → extract to platform
```

- [ ] **Step 6: Verify zero violations**

```bash
npx nx run-many --target=lint --all 2>&1 | grep -c "error"
```

Expected: 0 (or only non-boundary errors)

- [ ] **Step 7: Commit**

```bash
git add eslint.config.mjs .eslintrc.json
git commit -m "chore: enable full boundary enforcement (warnings → errors)"
```

---

## Task 6: Add Bundle Size Budgets

**Files:**
- Create: `apps/admin-portal/budget.json`
- Create: `apps/customer-portal/budget.json`
- Create: `apps/partner-portal/budget.json`
- Create: `tools/scripts/check-bundle-size.sh`

- [ ] **Step 1: Create admin portal budget**

Create `apps/admin-portal/budget.json`:

```json
{
  "budgets": [
    {
      "name": "Initial bundle",
      "path": "/",
      "maxSize": "500kb",
      "compression": "gzip"
    },
    {
      "name": "Orders feature",
      "path": "/orders",
      "maxSize": "300kb",
      "compression": "gzip"
    },
    {
      "name": "Carriers feature",
      "path": "/carriers",
      "maxSize": "200kb",
      "compression": "gzip"
    }
  ]
}
```

- [ ] **Step 2: Create customer portal budget**

Create `apps/customer-portal/budget.json`:

```json
{
  "budgets": [
    {
      "name": "Initial bundle",
      "path": "/",
      "maxSize": "300kb",
      "compression": "gzip"
    },
    {
      "name": "Track page",
      "path": "/track",
      "maxSize": "150kb",
      "compression": "gzip"
    }
  ]
}
```

- [ ] **Step 3: Create partner portal budget**

Create `apps/partner-portal/budget.json`:

```json
{
  "budgets": [
    {
      "name": "Initial bundle",
      "path": "/",
      "maxSize": "400kb",
      "compression": "gzip"
    }
  ]
}
```

- [ ] **Step 4: Create bundle size check script**

Create `tools/scripts/check-bundle-size.sh`:

```bash
#!/bin/bash
set -e

MAX_SIZE_KB=500

echo "🔍 Checking bundle sizes..."

for app in admin-portal customer-portal partner-portal; do
  echo ""
  echo "📦 $app"
  
  # Get the largest JS file
  largest=$(find dist/apps/$app -name "*.js" -type f 2>/dev/null | xargs ls -l 2>/dev/null | sort -k5 -nr | head -1 | awk '{print $5}')
  
  if [ -z "$largest" ]; then
    echo "  ⚠️  No built files found. Run 'nx build $app' first."
    continue
  fi
  
  size_kb=$((largest / 1024))
  echo "  Largest chunk: ${size_kb}kb"
  
  if [ $size_kb -gt $MAX_SIZE_KB ]; then
    echo "  ❌ Bundle size exceeds budget of ${MAX_SIZE_KB}kb"
    exit 1
  else
    echo "  ✅ Within budget"
  fi
done
```

- [ ] **Step 5: Make script executable**

```bash
chmod +x tools/scripts/check-bundle-size.sh
```

- [ ] **Step 6: Build all apps**

```bash
npx nx run-many --target=build --projects=admin-portal,customer-portal,partner-portal
```

- [ ] **Step 7: Run bundle size check**

```bash
./tools/scripts/check-bundle-size.sh
```

Expected: All within budget

- [ ] **Step 8: Commit**

```bash
git add apps/*/budget.json tools/scripts/check-bundle-size.sh
git commit -m "chore: add bundle size budgets and validation script"
```

---

## Task 7: Enable Nx Cloud (Optional but Recommended)

**Files:**
- Modify: `nx.json`

- [ ] **Step 1: Sign up for Nx Cloud (free tier)**

Visit https://cloud.nx.app and create account, get access token

- [ ] **Step 2: Add access token to env**

```bash
# Add to .env (gitignored)
echo "NX_CLOUD_TOKEN=your-token-here" >> .env
echo ".env" >> .gitignore
```

- [ ] **Step 3: Update nx.json with Nx Cloud**

```json
{
  "nxCloudAccessToken": "${NX_CLOUD_TOKEN}",
  "tasksRunnerOptions": {
    "default": {
      "runner": "nx-cloud",
      "options": {
        "cacheableOperations": ["build", "test", "lint", "e2e"],
        "parallel": 8,
        "accessToken": "${NX_CLOUD_TOKEN}"
      }
    }
  }
}
```

- [ ] **Step 4: Connect to Nx Cloud**

```bash
npx nx connect-to-nx-cloud
```

- [ ] **Step 5: Verify caching works**

```bash
# First run (cache miss)
npx nx affected:build

# Second run (should be cache hit)
npx nx affected:build
```

Expected: Second run is much faster (cache hit)

- [ ] **Step 6: Commit**

```bash
git add nx.json
git commit -m "chore: enable Nx Cloud distributed caching"
```

---

## Task 8: Create Domain Code Generator

**Files:**
- Create: `tools/generators/domain/index.ts`
- Create: `tools/generators/domain/schema.json`
- Create: `tools/generators/domain/files/...`

- [ ] **Step 1: Create generator directory structure**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
mkdir -p tools/generators/domain/files
```

- [ ] **Step 2: Create generator schema**

Create `tools/generators/domain/schema.json`:

```json
{
  "$schema": "http://json-schema.org/schema",
  "cli": "nx",
  "id": "domain",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Domain name (e.g., 'orders', 'carriers')",
      "$default": { "$source": "argv", "index": 0 },
      "x-prompt": "What name would you like to use for the domain? (e.g., orders, carriers)"
    },
    "team": {
      "type": "string",
      "description": "Team that owns this domain",
      "default": "platform",
      "x-prompt": "Which team owns this domain?"
    }
  },
  "required": ["name"]
}
```

- [ ] **Step 3: Create generator implementation**

Create `tools/generators/domain/index.ts`:

```typescript
import {
  Tree,
  formatFiles,
  generateFiles,
  joinPathFragments,
  updateJson,
} from '@nx/devkit';

interface Schema {
  name: string;
  team: string;
}

export default async function (tree: Tree, options: Schema) {
  const { name, team } = options;
  const domainPath = `libs/domains/${name}`;

  // Generate files from template
  generateFiles(
    tree,
    joinPathFragments(__dirname, 'files'),
    domainPath,
    {
      name,
      team,
      tmpl: '',
    }
  );

  // Update tags in project.json files
  for (const layer of ['types', 'data-access', 'api', 'ui']) {
    const projectJsonPath = `${domainPath}/${layer}/project.json`;
    if (tree.exists(projectJsonPath)) {
      updateJson(tree, projectJsonPath, (json) => {
        json.tags = [
          `domain:${name}`,
          `layer:${layer}`,
          `team:${team}`,
          'maturity:stable',
          'type:feature',
        ];
        return json;
      });
    }
  }

  await formatFiles(tree);
}
```

- [ ] **Step 4: Create template files**

Create `tools/generators/domain/files/types/src/index.ts__tmpl__`:

```typescript
export * from './lib/<%= name %>.model';
```

Create `tools/generators/domain/files/data-access/src/index.ts__tmpl__`:

```typescript
export * from './lib/<%= name %>.repository';
```

Create `tools/generators/domain/files/api/src/index.ts__tmpl__`:

```typescript
export * from './lib/<%= name %>.module';
export * from './lib/<%= name %>.service';
export * from './lib/<%= name %>.resolver';
```

- [ ] **Step 5: Register generator in workspace.json**

Edit `workspace.json` (or `nx.json`):

```json
{
  "generators": {
    "./tools/generators/domain": {
      "factory": "./tools/generators/domain/index"
    }
  }
}
```

- [ ] **Step 6: Test generator**

```bash
npx nx g @swiftship/domain test-domain --team=test
```

Expected: Creates `libs/domains/test-domain/` with all 4 layers

- [ ] **Step 7: Clean up test domain**

```bash
rm -rf libs/domains/test-domain
```

- [ ] **Step 8: Commit**

```bash
git add tools/generators
git commit -m "feat(tools): add domain code generator"
```

---

## Task 9: Generate CODEOWNERS

**Files:**
- Create: `.github/CODEOWNERS`
- Create: `tools/scripts/generate-codeowners.ts`

- [ ] **Step 1: Install dependencies for script**

```bash
npm install -D ts-node
```

- [ ] **Step 2: Create CODEOWNERS generator script**

Create `tools/scripts/generate-codeowners.ts`:

```typescript
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

interface ProjectJson {
  name: string;
  tags?: string[];
  sourceRoot: string;
}

const TEAMS: Record<string, string> = {
  'team:platform': '@swiftship/team-platform',
  'team:fulfillment': '@swiftship/team-fulfillment',
  'team:logistics': '@swiftship/team-logistics',
  'team:design-system': '@swiftship/team-design-system',
  'team:payments': '@swiftship/team-payments',
  'team:integrations': '@swiftship/team-integrations',
  'team:onboarding': '@swiftship/team-onboarding',
  'team:backend': '@swiftship/team-backend',
  'team:admin-frontend': '@swiftship/team-admin-frontend',
};

function findProjects(dir: string): ProjectJson[] {
  const projects: ProjectJson[] = [];

  function walk(currentDir: string) {
    const files = readdirSync(currentDir);
    for (const file of files) {
      const fullPath = join(currentDir, file);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (file === 'project.json') {
        const project: ProjectJson = JSON.parse(readFileSync(fullPath, 'utf-8'));
        projects.push(project);
      }
    }
  }

  walk(dir);
  return projects;
}

function main() {
  const projects = [
    ...findProjects('libs'),
    ...findProjects('apps'),
  ];

  const ownershipMap = new Map<string, string[]>();

  for (const project of projects) {
    if (!project.tags) continue;

    const teamTag = project.tags.find((t) => t.startsWith('team:'));
    if (!teamTag) continue;

    const team = TEAMS[teamTag];
    if (!team) continue;

    const dir = project.sourceRoot.replace('/src', '');
    const owners = ownershipMap.get(dir) || [];
    owners.push(team);
    ownershipMap.set(dir, [...new Set(owners)]);
  }

  let content = '# CODEOWNERS - Auto-generated from Nx tags\n';
  content += '# DO NOT EDIT MANUALLY\n\n';

  for (const [dir, owners] of ownershipMap.entries()) {
    content += `${dir}/    ${owners.join(' ')}\n`;
  }

  writeFileSync('.github/CODEOWNERS', content);
  console.log(`✅ Generated CODEOWNERS with ${ownershipMap.size} entries`);
}

main();
```

- [ ] **Step 3: Run CODEOWNERS generator**

```bash
npx ts-node tools/scripts/generate-codeowners.ts
```

- [ ] **Step 4: Verify .github/CODEOWNERS created**

```bash
cat .github/CODEOWNERS
```

- [ ] **Step 5: Commit**

```bash
git add tools/scripts/generate-codeowners.ts .github/CODEOWNERS
git commit -m "chore: auto-generate CODEOWNERS from Nx tags"
```

---

## Task 10: Final Validation

**Files:**
- None (validation only)

- [ ] **Step 1: Verify no old src/ directory**

```bash
ls src/ 2>&1
```

Expected: `No such file or directory`

- [ ] **Step 2: Run all tests**

```bash
npx nx run-many --target=test --all
```

Expected: All pass

- [ ] **Step 3: Lint with full enforcement**

```bash
npx nx run-many --target=lint --all
```

Expected: Zero boundary violations

- [ ] **Step 4: Build all apps and libs**

```bash
npx nx run-many --target=build --all
```

Expected: All succeed

- [ ] **Step 5: Check bundle sizes**

```bash
./tools/scripts/check-bundle-size.sh
```

Expected: All within budget

- [ ] **Step 6: Generate dependency graph**

```bash
npx nx graph --file=tmp/final-graph.html
```

- [ ] **Step 7: Verify Nx sees all projects**

```bash
npx nx show projects | wc -l
```

Expected: ~100+ projects (24 domains × 4 layers + 4 apps + 7 platform/shared libs)

- [ ] **Step 8: List all apps**

```bash
npx nx show projects --type=app
```

Expected: `api`, `admin-portal`, `customer-portal`, `partner-portal`

- [ ] **Step 9: List all libs**

```bash
npx nx show projects --type=lib
```

Expected: 100+ libraries

- [ ] **Step 10: Update migration log**

Edit `docs/superpowers/migration-log.md`:

```markdown
## Plan 5: Cleanup & Enforcement (Complete)

**Date:** 2026-07-02
**Status:** ✅ Complete

### Cleanup
- [x] Old src/ directory removed
- [x] Generated GraphQL schema moved to apps/api
- [x] package.json updated with Nx scripts

### Enforcement
- [x] Boundary rules changed from warnings to errors
- [x] Strict constraints added (UI cannot import data-access, etc.)
- [x] Zero boundary violations
- [x] Bundle size budgets enforced

### Tooling
- [x] Nx Cloud enabled (distributed caching)
- [x] Domain code generator created
- [x] CODEOWNERS auto-generated from tags

### Validation
- ✅ All tests pass
- ✅ All builds succeed
- ✅ All apps within bundle budgets
- ✅ Dependency graph clean (no circular deps)

### Stats
- Total projects: 107 (24 domains × 4 layers + 4 apps + 7 platform/shared libs)
- Total libraries: 103
- Migration duration: 20 days
```

- [ ] **Step 11: Commit log**

```bash
git add docs/superpowers/migration-log.md
git commit -m "docs: mark Plan 5 complete in migration log"
```

---

## Plan 5 Completion Checklist

- [ ] Old src/ directory removed
- [ ] GraphQL schema in apps/api
- [ ] package.json updated
- [ ] Boundary enforcement enabled (errors)
- [ ] Bundle size budgets added
- [ ] Nx Cloud caching enabled
- [ ] Domain code generator created
- [ ] CODEOWNERS generated
- [ ] All tests pass
- [ ] All builds succeed
- [ ] Zero boundary violations
- [ ] Migration log updated
- [ ] All changes committed

**Estimated Time:** 5 days

**Next:** [Plan 6: CI/CD & Observability](./2026-06-12-nx-monorepo-plan-6-cicd-observability.md) - GitHub Actions, monitoring, final polish
