#!/usr/bin/env python3
"""Append the 2026-09 P0-repair + launch-plan beads to .beads/issues.jsonl."""

import json
from pathlib import Path

BEADS_PATH = Path(__file__).resolve().parent.parent / ".beads" / "issues.jsonl"

NEW_BEADS = [
    {
        "id": "SS-100",
        "title": "P0-REPAIR: apps/api compiles, tests green, builds, and BOOTS live (Phase 0 of LAUNCH_PLAN)",
        "type": "bug",
        "priority": "P0",
        "status": "closed",
        "labels": ["p0", "repair", "phase0"],
        "created_at": "2026-09-01",
        "closed_at": "2026-09-01",
        "closure_note": "350 tsc errors -> 0; jest configs recreated + preset depths fixed; nx build api green (webpack config + assets); ~20 live-boot bugs fixed (DI reflection import-type erasure, TDZ model ordering, missing module imports, uuid FK types, duplicate index, BullMQ maxRetries, throttler GQL context, AuthResolver/KycModule wiring); full-stack boot verified against live Postgres+Redis with register/login returning real JWTs. Committed with docs.",
    },
    {
        "id": "SS-101",
        "title": "SS-decommission: port remaining src/* libs (ecommerce-integrations services, dashboard/rate-shop dead code, 8 shim barrels) and delete legacy src/",
        "type": "chore",
        "priority": "P1",
        "status": "open",
        "labels": ["decommission", "typeorm", "nx"],
        "created_at": "2026-09-01",
        "description": "Rate-shop + dashboard barrels flipped to local exports (legacy re-exports removed); users + storage barrels flipped; ecommerce-integrations registered lint-only (its local Shopify/WooCommerce services still import the removed PrismaService — port them to TypeORM repositories, then restore build/typecheck targets). Remaining shim barrels: bulk-operations, metrics, plugins, surcharges, webhooks. Then delete src/, scripts/write-barrels.sh, root nest-cli.json + legacy Dockerfile flow, prisma/ reference copy.",
    },
    {
        "id": "SS-102",
        "title": "E2E: run the 8 new money-path suites against a live stack in CI (DATABASE_URL wiring in ci.yml e2e job)",
        "type": "test",
        "priority": "P1",
        "status": "open",
        "labels": ["e2e", "ci"],
        "created_at": "2026-09-01",
        "description": "apps/api-e2e now has 8 suites (auth, tenant-onboarding, order-lifecycle + isolation, rate-shop-ranking, shipment-label-tracking, ndr-flow, cod-remittance-recon, kyc-gst-invoice) + shared harness; typecheck-clean, never executed (no DB locally). ci.yml e2e job must set DATABASE_URL=postgres://postgres:postgres@localhost:5432/swiftship_test (service container creds) and run the suites on the runner.",
    },
    {
        "id": "SS-103",
        "title": "GQL surface gaps found while booted: dashboardStats/rateShop/checkServiceability queries unwired; publicRateShop mutation TODO; GraphQL playground schema snapshot",
        "type": "feature",
        "priority": "P2",
        "status": "open",
        "labels": ["graphql", "decommission"],
        "created_at": "2026-09-01",
        "description": "The legacy dashboard/rate-shop resolvers (dashboardStats, revenueAnalytics, carrierPerformance, slaMetrics, totalSales, rateShop, checkServiceability) were dropped with the barrel flip and need porting into the dashboard/rate-shop libs. publicRateShop mutation (SS-022 TODO) still missing — widgets use REST. Commit the generated apps/api/src/schema.graphql after the next boot.",
    },
    {
        "id": "SS-104",
        "title": "SEC: dependency audit remediation (57 vulns after fix: 1 crit / 33 high) + secret scan CI step",
        "type": "chore",
        "priority": "P1",
        "status": "open",
        "labels": ["security"],
        "created_at": "2026-09-01",
        "description": "npm audit fix applied (129 -> 57). Remaining need targeted major-version bumps (66 were in dev tooling). Add npm audit + gitleaks-style secret scan to CI. Dev JWT_SECRET default must be blocked in production builds.",
    },
    {
        "id": "SS-105",
        "title": "LAUNCH Phase 1: real integrations (carrier sandbox creds for top-5, ClearTax prod, DLT/WhatsApp, Razorpay live, real bank statement fixtures)",
        "type": "feature",
        "priority": "P0",
        "status": "open",
        "labels": ["launch", "integrations", "business"],
        "created_at": "2026-09-01",
        "description": "See LAUNCH_PLAN.md Phase 1. File carrier partner applications + DLT registration first (longest leads). Validate the 5 bank parsers against real statement exports. Business-side items cannot be closed by code.",
    },
    {
        "id": "SS-106",
        "title": "LAUNCH Phase 2: deploy staging (domains/TLS/backups), run k6 + chaos against it, tenant-isolation pen test",
        "type": "infra",
        "priority": "P1",
        "status": "open",
        "labels": ["launch", "infra"],
        "created_at": "2026-09-01",
        "description": "Docker production path is ready (root Dockerfile multi-stage + migration entrypoint + compose + release.yml aligned by SS-100 session). Alert rules + status page + runbook exist (deploy/prometheus/alerts, .upptimerc.yml, docs/runbook.md) — compose observability stack needs the alerts volume mount + SS_ALERT_WEBHOOK_URL (documented in runbook §7).",
    },
    {
        "id": "SS-107",
        "title": "LAUNCH Phase 3-4: anchor-tenant pilot execution + competitive positioning",
        "type": "feature",
        "priority": "P1",
        "status": "open",
        "labels": ["launch", "pilot", "business"],
        "created_at": "2026-09-01",
        "description": "Execute docs/anchor-tenant-pilot.md with 1 merchant (10 -> 1K orders/day ramp); weekly kill/scale criteria vs their Shiprocket account; then pricing attack + differentiators per LAUNCH_PLAN Phase 4.",
    },
]

with open(BEADS_PATH, "a", encoding="utf-8") as fh:
    for bead in NEW_BEADS:
        fh.write(json.dumps(bead, ensure_ascii=False) + "\n")

print(f"appended {len(NEW_BEADS)} beads")
