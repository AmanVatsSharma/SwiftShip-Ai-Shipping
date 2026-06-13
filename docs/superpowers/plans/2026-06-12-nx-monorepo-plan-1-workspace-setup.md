# Plan 1: Nx Workspace Setup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize Nx workspace structure alongside the existing NestJS codebase, configure path mappings for coexistence, and set up the foundation for incremental migration.

**Architecture:** Nx workspace with `apps/` and `libs/` directories. Old `src/` remains untouched (parallel run). Path mappings in `tsconfig.base.json` allow gradual migration. ESLint configured with tag-based boundary rules (initially as warnings).

**Tech Stack:** Nx 17+, TypeScript 5, ESLint 9, pnpm/npm

---

## Task 1: Create Pre-Migration Backup Tag

**Files:**
- None (git operation)

- [ ] **Step 1: Create backup tag**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
git tag pre-nx-migration
```

- [ ] **Step 2: Verify tag created**

```bash
git tag --list | grep pre-nx-migration
```

Expected: `pre-nx-migration`

- [ ] **Step 3: Commit any uncommitted changes**

```bash
git status
git add .
git commit -m "chore: pre-nx-migration snapshot"
```

---

## Task 2: Install Nx Globally (or use npx)

**Files:**
- None (package installation)

- [ ] **Step 1: Verify Node/npm versions**

```bash
node --version
npm --version
```

Expected: Node 22+, npm 10+

- [ ] **Step 2: Install Nx CLI globally (optional, or use npx)**

```bash
npm install -g nx@latest
```

Expected: Nx 17+ installed

- [ ] **Step 3: Verify Nx installation**

```bash
nx --version
```

Expected: 17.x.x or higher

---

## Task 3: Initialize Nx Workspace in Current Directory

**Files:**
- Create: `nx.json`
- Create: `tsconfig.base.json`
- Modify: `package.json` (add Nx scripts)

- [ ] **Step 1: Add Nx to existing project (don't create new workspace)**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
npx nx@latest init
```

When prompted:
- Choose: "Use Nx in a single-project workspace"
- Choose: "Integrate with the existing tools" (not create new workspace)
- Select: npm as package manager

- [ ] **Step 2: Verify nx.json created**

```bash
cat nx.json
```

Expected: JSON file with Nx configuration

- [ ] **Step 3: Verify tsconfig.base.json created**

```bash
cat tsconfig.base.json
```

Expected: TypeScript base config with path mappings

---

## Task 4: Install Nx Plugins

**Files:**
- Modify: `package.json` (add Nx plugin dependencies)

- [ ] **Step 1: Install Nx Node plugin**

```bash
npm install --save-dev @nx/node
```

- [ ] **Step 2: Install Nx Nest plugin**

```bash
npm install --save-dev @nx/nest
```

- [ ] **Step 3: Install Nx React plugin**

```bash
npm install --save-dev @nx/react
```

- [ ] **Step 4: Install Nx Next.js plugin**

```bash
npm install --save-dev @nx/next
```

- [ ] **Step 5: Install Nx ESLint plugin**

```bash
npm install --save-dev @nx/eslint
```

- [ ] **Step 6: Install Nx Jest plugin**

```bash
npm install --save-dev @nx/jest
```

- [ ] **Step 7: Verify all plugins installed**

```bash
npm list --depth=0 | grep @nx
```

Expected: All 6 @nx packages listed

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install Nx plugins"
```

---

## Task 5: Create Directory Structure

**Files:**
- Create: `apps/` (directory)
- Create: `libs/domains/` (directory)
- Create: `libs/shared/` (directory)
- Create: `libs/platform/` (directory)
- Create: `tools/generators/` (directory)
- Create: `tools/executors/` (directory)
- Create: `tools/scripts/` (directory)

- [ ] **Step 1: Create apps directory**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
mkdir -p apps
```

- [ ] **Step 2: Create libs structure**

```bash
mkdir -p libs/domains
mkdir -p libs/shared
mkdir -p libs/platform
```

- [ ] **Step 3: Create tools structure**

```bash
mkdir -p tools/generators
mkdir -p tools/executors
mkdir -p tools/scripts
```

- [ ] **Step 4: Create empty .gitkeep files**

```bash
touch apps/.gitkeep
touch libs/domains/.gitkeep
touch libs/shared/.gitkeep
touch libs/platform/.gitkeep
touch tools/.gitkeep
```

- [ ] **Step 5: Verify structure**

```bash
ls -la apps libs tools
```

Expected: All directories present with .gitkeep files

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "chore: create Nx directory structure"
```

---

## Task 6: Configure Path Mappings in tsconfig.base.json

**Files:**
- Modify: `tsconfig.base.json`

- [ ] **Step 1: Read current tsconfig.base.json**

```bash
cat tsconfig.base.json
```

- [ ] **Step 2: Add path mappings for future libraries**

Replace contents of `tsconfig.base.json` with:

```json
{
  "compileOnSave": false,
  "compilerOptions": {
    "rootDir": ".",
    "sourceMap": true,
    "declaration": false,
    "moduleResolution": "node",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "importHelpers": true,
    "target": "es2021",
    "module": "commonjs",
    "lib": ["es2022", "dom"],
    "skipLibCheck": true,
    "skipDefaultLibCheck": true,
    "strict": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": {
      "@swiftship/domains/*": ["libs/domains/*"],
      "@swiftship/shared/*": ["libs/shared/*"],
      "@swiftship/platform/*": ["libs/platform/*"]
    }
  },
  "exclude": ["node_modules", "tmp"]
}
```

- [ ] **Step 3: Verify TypeScript can find path mappings**

```bash
npx tsc --showConfig | grep -A 20 paths
```

Expected: Path mappings shown in output

- [ ] **Step 4: Commit**

```bash
git add tsconfig.base.json
git commit -m "chore: add Nx path mappings to tsconfig"
```

---

## Task 7: Configure Nx Tag System in nx.json

**Files:**
- Modify: `nx.json`

- [ ] **Step 1: Read current nx.json**

```bash
cat nx.json
```

- [ ] **Step 2: Replace nx.json with tagged configuration**

Write to `nx.json`:

```json
{
  "$schema": "./node_modules/nx/schemas/nx-schema.json",
  "npmScope": "swiftship",
  "affected": {
    "defaultBase": "main"
  },
  "tasksRunnerOptions": {
    "default": {
      "runner": "nx/tasks-runners/default",
      "options": {
        "cacheableOperations": ["build", "test", "lint"],
        "parallel": 4
      }
    }
  },
  "targetDefaults": {
    "build": {
      "dependsOn": ["^build"],
      "cache": true
    },
    "test": {
      "cache": true
    },
    "lint": {
      "cache": true
    }
  },
  "workspaceLayout": {
    "apps": "apps",
    "libs": "libs"
  }
}
```

- [ ] **Step 3: Verify Nx can read configuration**

```bash
npx nx show projects
```

Expected: Empty list (no projects yet) or existing projects

- [ ] **Step 4: Commit**

```bash
git add nx.json
git commit -m "chore: configure Nx with workspace layout"
```

---

## Task 8: Setup ESLint Boundary Rules (Warnings Only)

**Files:**
- Modify: `eslint.config.mjs` (or create `.eslintrc.json`)

- [ ] **Step 1: Check current ESLint config**

```bash
ls eslint.config.mjs .eslintrc* 2>/dev/null
```

- [ ] **Step 2: Add Nx ESLint plugin to config**

If using `eslint.config.mjs` (flat config), add to imports:

```javascript
import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'warn',  // Start as warning, will become error in Plan 5
        {
          enforceBuildableLibDependency: true,
          allowCircularSelfDependency: false,
          depConstraints: [
            // TYPES LAYER (leaf, no dependencies)
            { sourceTag: 'layer:types', onlyDependOnLibsWithTags: [] },
            
            // DATA-ACCESS LAYER (types + platform only)
            { sourceTag: 'layer:data-access', onlyDependOnLibsWithTags: ['layer:types', 'layer:platform', 'type:types'] },
            
            // API LAYER (data-access, types, platform)
            { sourceTag: 'layer:api', onlyDependOnLibsWithTags: ['layer:data-access', 'layer:types', 'layer:platform', 'layer:utils'] },
            
            // UI LAYER (types, utils, other UI within scope)
            { sourceTag: 'layer:ui', onlyDependOnLibsWithTags: ['layer:types', 'layer:utils', 'layer:ui'] },
            
            // PLATFORM LAYER (can use other platform, types)
            { sourceTag: 'layer:platform', onlyDependOnLibsWithTags: ['layer:platform', 'layer:types', 'type:types'] },
            
            // APPS (can import anything)
            { sourceTag: 'scope:api', onlyDependOnLibsWithTags: ['*'] },
            { sourceTag: 'scope:admin-portal', onlyDependOnLibsWithTags: ['*'] },
            { sourceTag: 'scope:customer-portal', onlyDependOnLibsWithTags: ['*'] },
            { sourceTag: 'scope:partner-portal', onlyDependOnLibsWithTags: ['*'] }
          ]
        }
      ]
    }
  }
];
```

If using `.eslintrc.json` (legacy), add:

```json
{
  "extends": ["@nx/eslint-plugin"],
  "rules": {
    "@nx/enforce-module-boundaries": [
      "warn",
      {
        "enforceBuildableLibDependency": true,
        "allowCircularSelfDependency": false,
        "depConstraints": [
          { "sourceTag": "layer:types", "onlyDependOnLibsWithTags": [] },
          { "sourceTag": "layer:data-access", "onlyDependOnLibsWithTags": ["layer:types", "layer:platform", "type:types"] },
          { "sourceTag": "layer:api", "onlyDependOnLibsWithTags": ["layer:data-access", "layer:types", "layer:platform", "layer:utils"] },
          { "sourceTag": "layer:ui", "onlyDependOnLibsWithTags": ["layer:types", "layer:utils", "layer:ui"] },
          { "sourceTag": "layer:platform", "onlyDependOnLibsWithTags": ["layer:platform", "layer:types", "type:types"] },
          { "sourceTag": "scope:api", "onlyDependOnLibsWithTags": ["*"] },
          { "sourceTag": "scope:admin-portal", "onlyDependOnLibsWithTags": ["*"] },
          { "sourceTag": "scope:customer-portal", "onlyDependOnLibsWithTags": ["*"] },
          { "sourceTag": "scope:partner-portal", "onlyDependOnLibsWithTags": ["*"] }
        ]
      }
    ]
  }
}
```

- [ ] **Step 3: Test ESLint runs**

```bash
npm run lint
```

Expected: Command runs (warnings OK, errors not yet)

- [ ] **Step 4: Commit**

```bash
git add eslint.config.mjs .eslintrc.json
git commit -m "chore: add Nx ESLint boundary rules (warnings)"
```

---

## Task 9: Create First Library (Platform Config)

**Files:**
- Create: `libs/platform/config/project.json`
- Create: `libs/platform/config/src/index.ts`
- Create: `libs/platform/config/src/lib/environment.ts`

- [ ] **Step 1: Generate platform config library**

```bash
cd "c:\Users\ASUS TUF A15\Desktop\DevOPS\Workspace\SwiftShip-Ai-Shipping-NestJs-Backend"
npx nx g @nx/node:lib libs/platform/config \
  --name=config \
  --buildable=false \
  --publishable=false
```

- [ ] **Step 2: Verify library created**

```bash
ls libs/platform/config
```

Expected: `project.json`, `src/`, `tsconfig.json`, etc.

- [ ] **Step 3: Add tags to project.json**

Edit `libs/platform/config/project.json`, add to `tags` array:

```json
{
  "tags": ["layer:platform", "scope:api", "team:platform", "maturity:stable", "type:feature"]
}
```

- [ ] **Step 4: Move Joi schema to config library**

```bash
# Extract env validation from app.module.ts
# Create libs/platform/config/src/lib/environment.ts
```

Create `libs/platform/config/src/lib/environment.ts`:

```typescript
import * as Joi from 'joi';

export const environmentValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default,
  DATABASE_URL: Joi.string().uri().required(),
  CORS_ORIGIN: Joi.string().optional(),
  SHOPIFY_API_KEY: Joi.string().optional(),
  SHOPIFY_API_SECRET: Joi.string().optional(),
  SHOPIFY_APP_URL: Joi.string().uri().optional(),
  SHOPIFY_SCOPES: Joi.string().optional(),
  JWT_SECRET: Joi.string().default('dev-secret'),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  DELHIVERY_TOKEN: Joi.string().optional(),
  REDIS_URL: Joi.string().uri().optional(),
  XPRESSBEES_TOKEN: Joi.string().optional(),
  STRIPE_SECRET_KEY: Joi.string().optional(),
  STRIPE_WEBHOOK_SECRET: Joi.string().optional(),
  RAZORPAY_KEY_ID: Joi.string().optional(),
  RAZORPAY_KEY_SECRET: Joi.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: Joi.string().optional(),
  PAYMENT_DEFAULT_GATEWAY: Joi.string()
    .valid('STRIPE', 'RAZORPAY')
    .optional(),
  SENDGRID_API_KEY: Joi.string().optional(),
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().optional(),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASSWORD: Joi.string().optional(),
  EMAIL_FROM: Joi.string().email().optional(),
  EMAIL_FROM_NAME: Joi.string().optional(),
  APP_URL: Joi.string().uri().optional(),
  GSTN_API_URL: Joi.string().uri().optional(),
  GSTN_API_KEY: Joi.string().optional(),
  GSTN_CLIENT_ID: Joi.string().optional(),
  GSTN_CLIENT_SECRET: Joi.string().optional(),
  GSTN_SIGNATURE_SECRET: Joi.string().optional(),
  GSTN_RETRY_ATTEMPTS: Joi.number().optional(),
  STORAGE_DRIVER: Joi.string().valid('s3', 'stub').optional(),
  S3_BUCKET: Joi.string().optional(),
  S3_REGION: Joi.string().optional(),
  S3_ENDPOINT: Joi.string().optional(),
  S3_ACCESS_KEY_ID: Joi.string().optional(),
  S3_SECRET_ACCESS_KEY: Joi.string().optional(),
  S3_FORCE_PATH_STYLE: Joi.string().optional(),
});
```

- [ ] **Step 5: Export from index.ts**

Edit `libs/platform/config/src/index.ts`:

```typescript
export * from './lib/environment';
```

- [ ] **Step 6: Verify Nx sees the library**

```bash
npx nx show projects
```

Expected: `platform-config` in the list

- [ ] **Step 7: Test the library**

```bash
npx nx test platform-config
```

Expected: Tests pass (or "no tests" if none defined)

- [ ] **Step 8: Commit**

```bash
git add libs/platform/config
git commit -m "feat(platform): add config library with Joi validation"
```

---

## Task 10: Verify Old Code Still Works

**Files:**
- None (validation only)

- [ ] **Step 1: Run existing tests**

```bash
npm test
```

Expected: All existing tests pass

- [ ] **Step 2: Build existing code**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 3: Start dev server**

```bash
npm run start:dev
```

Expected: Server starts on port 3000 (Ctrl+C to stop)

- [ ] **Step 4: Verify GraphQL endpoint**

```bash
curl http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'
```

Expected: `{"data":{"__typename":"Query"}}`

- [ ] **Step 5: Stop dev server**

```bash
# Ctrl+C in terminal where server is running
```

- [ ] **Step 6: Run Nx affected to verify coexistence**

```bash
npx nx affected:graph --file=tmp/affected-graph.json
```

Expected: Graph generated showing old + new projects

---

## Task 11: Update .gitignore for Nx

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Read current .gitignore**

```bash
cat .gitignore
```

- [ ] **Step 2: Add Nx-specific ignores**

Append to `.gitignore`:

```gitignore
# Nx
.nx/
nx-cache/
tmp/
dist/
build/

# Nx Cloud
.nxcloud/

# Build artifacts
*.tsbuildinfo

# Workspace
workspace.json
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: update .gitignore for Nx"
```

---

## Task 12: Create Migration Documentation

**Files:**
- Create: `docs/superpowers/migration-log.md`

- [ ] **Step 1: Create migration log**

```bash
mkdir -p docs/superpowers
```

Create `docs/superpowers/migration-log.md`:

```markdown
# Nx Migration Log

## Plan 1: Workspace Setup (Complete)

**Date:** 2026-06-12
**Status:** ✅ Complete

### Changes Made
- [x] Created pre-migration backup tag
- [x] Installed Nx CLI and plugins (@nx/node, @nx/nest, @nx/react, @nx/next, @nx/eslint, @nx/jest)
- [x] Created directory structure (apps/, libs/{domains,shared,platform}/, tools/)
- [x] Configured path mappings in tsconfig.base.json
- [x] Set up Nx tag system in nx.json
- [x] Added ESLint boundary rules (warnings only)
- [x] Created first library: @swiftship/platform/config
- [x] Verified old code still works (tests, build, dev server)

### Validation
- ✅ All existing tests pass
- ✅ Build succeeds
- ✅ Dev server starts on port 3000
- ✅ GraphQL endpoint responds

### Next Steps
- Proceed to Plan 2: Pilot Migration
- Migrate 3 low-risk domains: warehouses, notifications, serviceability
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/migration-log.md
git commit -m "docs: add migration log for Plan 1"
```

---

## Plan 1 Completion Checklist

- [ ] Backup tag created (`pre-nx-migration`)
- [ ] Nx CLI installed
- [ ] All 6 Nx plugins installed
- [ ] Directory structure created
- [ ] Path mappings configured
- [ ] Nx tag system configured
- [ ] ESLint boundary rules added (warnings)
- [ ] First library created (`@swiftship/platform/config`)
- [ ] Old code still works (tests, build, dev server)
- [ ] .gitignore updated
- [ ] Migration log created
- [ ] All changes committed

**Estimated Time:** 3 days

**Next:** [Plan 2: Pilot Migration](./2026-06-12-nx-monorepo-plan-2-pilot-migration.md)
