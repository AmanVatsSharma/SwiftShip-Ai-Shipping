# Nx Monorepo Migration Master Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the SwiftShip AI NestJS backend into an enterprise-grade Nx monorepo with three Next.js frontends, following the hybrid domain/layer library structure with enforced boundaries.

**Architecture:** Nx workspace with `apps/` (deployables: api, admin-portal, customer-portal, partner-portal) and `libs/` (domains/ + shared/ + platform/). Domain libraries follow vertical slice pattern (types, data-access, api, ui). Tag-based ESLint boundaries prevent architectural drift. Nx Cloud provides distributed caching for fast CI.

**Tech Stack:** Nx 17+, NestJS 11, GraphQL/Apollo, Prisma 6, Next.js 14, TypeScript 5, GraphQL Code Generator, React 18

---

## Master Plan Overview

This migration is split into **6 independent plans** (this document is the index):

1. **[Plan 1: Workspace Setup](./2026-06-12-nx-monorepo-plan-1-workspace-setup.md)** (Days 1-3) - Nx workspace, base configs, path mappings
2. **[Plan 2: Pilot Migration](./2026-06-12-nx-monorepo-plan-2-pilot-migration.md)** (Days 4-7) - Migrate 3 low-risk domains (warehouses, notifications, serviceability)
3. **[Plan 3: Bulk Migration](./2026-06-12-nx-monorepo-plan-3-bulk-migration.md)** (Days 8-20) - Migrate remaining 17+ domains in dependency order
4. **[Plan 4: App Extraction](./2026-06-12-nx-monorepo-plan-4-app-extraction.md)** (Days 21-25) - Extract API + 3 Next.js apps
5. **[Plan 5: Cleanup & Enforcement](./2026-06-12-nx-monorepo-plan-5-cleanup-enforcement.md)** (Days 26-30) - Remove old src/, enable full boundaries
6. **[Plan 6: CI/CD & Observability](./2026-06-12-nx-monorepo-plan-6-cicd-observability.md)** (Days 30+) - GitHub Actions, Nx Cloud, monitoring

**Total: 30 days for complete migration**

Each plan produces working, testable software. You can pause between plans.

---

## Plan Structure

Each plan follows this structure:

### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.ts`
- Modify: `exact/path/to/existing.ts:123-145`
- Test: `tests/exact/path/to/test.ts`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

## Pre-Flight Checklist

Before starting Plan 1, ensure:

- [ ] Node.js 22+ installed
- [ ] npm 10+ installed
- [ ] Git initialized in repo
- [ ] All current tests passing (`npm test`)
- [ ] All current builds passing (`npm run build`)
- [ ] No uncommitted changes (`git status` clean)
- [ ] Backup of current state (tag: `pre-nx-migration`)

---

## Migration Principles

1. **Atomic changes** - Each commit is independently revertable
2. **Continuous validation** - Tests run after every change
3. **Gradual enforcement** - Boundaries start as warnings, become errors over time
4. **No feature changes** - Pure structural refactor, no behavior changes
5. **Frequent commits** - Commit after every task, not every phase

---

## Success Criteria (All Plans)

- [ ] All 20+ domains migrated to `libs/domains/`
- [ ] All 3 Next.js apps functional in `apps/`
- [ ] GraphQL codegen working across all apps
- [ ] Zero boundary violations
- [ ] CI pipeline completes in <5 minutes
- [ ] Bundle size budgets enforced
- [ ] Old `src/` directory removed
- [ ] Documentation updated

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking changes | Pilot with low-risk domains first, validate thoroughly |
| CI build times | Nx Cloud distributed caching from day 1 |
| Developer confusion | Comprehensive README + onboarding docs per plan |
| Import path errors | Automated codemod scripts for bulk refactoring |
| Bundle bloat | Budgets enforced in CI, alerts on regression |

---

## Rollback Strategy

**Per-Plan Rollback:**
```bash
git revert <plan-end-commit-sha>
```

**Workspace-Wide Rollback (before cleanup phase):**
```bash
git checkout pre-nx-migration
```

**Feature Flags for Gradual Rollout:**
- Use environment variables to switch between old/new implementations
- Keep old `src/` until Plan 5 (cleanup) for safety net

---

## Next Steps

1. Create backup tag: `git tag pre-nx-migration`
2. Review and approve Plan 1 (Workspace Setup)
3. Execute Plan 1
4. Review results, then proceed to Plan 2

**Ready to start? Let's begin with [Plan 1: Workspace Setup](./2026-06-12-nx-monorepo-plan-1-workspace-setup.md).**
