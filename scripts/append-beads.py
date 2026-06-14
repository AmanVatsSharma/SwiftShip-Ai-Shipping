#!/usr/bin/env python3
"""Append the 13 new SwiftShip roadmap beads to .beads/issues.jsonl.

Each bead is a JSON object on its own line. This avoids shell-quoting
hazards that broke the bash heredoc.
"""

import json
import sys
from pathlib import Path

BEADS_PATH = Path(__file__).resolve().parent.parent / ".beads" / "issues.jsonl"

NEW_BEADS = [
    {
        "id": "SS-031",
        "title": "P7-Compliance: KYC (PAN + GSTIN + bank account) with BullMQ async verification",
        "type": "feature",
        "priority": "P0",
        "status": "open",
        "labels": ["compliance", "onboarding", "typeorm"],
        "created_at": "2026-06-15",
        "description": (
            "Indian merchants need KYC before they can ship. Shiprocket has this; we don't. Bead ships: "
            "PanValidatorService (regex + checksum), GstinValidatorService (15-char parse + state lookup), "
            "BankVerifierService (Setu/CKYC adapter behind interface), KycEntity + KycDocumentEntity, "
            "KycService with BullMQ async verify + retry/dead-letter, GraphQL resolver (submitKyc, kycStatus). "
            "Enforce: OrdersService rejects COD orders from tenants with non-VERIFIED KYC. Files: "
            "libs/domains/onboarding/src/lib/kyc/{pan-validator,gstin-validator,bank-verifier.service,"
            "kyc.entity,kyc-document.entity,kyc.service,kyc.resolver,kyc.input,kyc.model,index}.ts; "
            "libs/domains/onboarding/src/lib/kyc/__tests__/{pan-validator,gstin-validator,bank-verifier,"
            "kyc.service}.spec.ts; migration 1718160000010-AddKycTables.ts. AppModule wiring. "
            "Tests cover: valid PAN/GSTIN/bank, invalid, async verify flow, retry, dead-letter, "
            "tenant guard on resolver. Reuses existing TenantGuard from SS-001."
        ),
        "owner": "unassigned",
        "estimate": "5d",
        "blocked_by": ["SS-005"],
        "parent": "EPIC-COMPLIANCE",
    },
    {
        "id": "SS-032",
        "title": "P7-Compliance: GST invoicing + E-way bill generation (ClearTax adapter)",
        "type": "feature",
        "priority": "P0",
        "status": "open",
        "labels": ["compliance", "billing", "gst"],
        "created_at": "2026-06-15",
        "description": (
            "Indian sellers need GST-compliant invoices with HSN code + CGST/SGST/IGST split, and E-way "
            "bills for shipments > Rs50k. Bead ships: GstInvoiceService (HSN rate table 5/12/18/28%, "
            "intra-state vs inter-state tax split), GstEwayBillService behind GstEwayProviderAdapter "
            "interface (ClearTax sandbox default, swappable to IRIS/Cygnet), GstInvoiceEntity + "
            "GstEwayBillEntity, GraphQL resolver. Migration 1718160000011-AddGstInvoiceTables.ts "
            "(gst_invoices FK to invoices, gst_eway_bills FK to shipments, ewb_no UNIQUE). Files: "
            "libs/domains/billing/src/lib/gst/{gst-invoice.service,gst-eway-bill.service,gst-rate-table,"
            "gst-invoice.entity,gst-eway-bill.entity,gst-invoice.input,gst-invoice.model,gst.resolver,"
            "index}.ts; libs/domains/billing/src/lib/gst/__tests__/{gst-invoice,gst-eway-bill}.service.spec.ts. "
            "Tests cover: intra-state order (CGST+SGST), inter-state order (IGST), HSN lookup, "
            "E-way bill threshold logic, ClearTax sandbox call. Reuses SS-031 KYC state for tax identity."
        ),
        "owner": "unassigned",
        "estimate": "5d",
        "blocked_by": ["SS-031"],
        "parent": "EPIC-COMPLIANCE",
    },
    {
        "id": "SS-033",
        "title": "P7-Compliance: COD remittance + bank reconciliation + dispute queue",
        "type": "feature",
        "priority": "P0",
        "status": "open",
        "labels": ["billing", "cod", "reconciliation"],
        "created_at": "2026-06-15",
        "description": (
            "Shiprocket gets 80% of its support tickets from COD reconciliation. Bead ships: "
            "CodRemittanceEntity (courier, period, amount, deposit_date, status: PENDING/RECEIVED/"
            "RECONCILED/DISPUTED), CodBankStatementParser with adapters for HDFC/ICICI/SBI/Axis/Kotak "
            "CSV formats, CodReconciliationService (fuzzy match on ref + amount, exact match on date, "
            "+-3 day window), CodDisputeService (OPEN/UNDER_REVIEW/RESOLVED with evidence), "
            "CodRemittanceCronService (daily 06:00 IST trigger), migration 1718160000013-"
            "AddCodRemittanceTables.ts. Files: libs/domains/billing/src/lib/cod-remittance/"
            "{cod-remittance.entity,cod-remittance.service,cod-bank-statement-parser,"
            "cod-reconciliation.service,cod-dispute.service,cod-dispute.entity,index}.ts; "
            "libs/domains/billing/src/lib/cod-remittance/cron/cod-remittance-cron.service.ts; "
            "libs/domains/billing/src/lib/cod-remittance/__tests__/{cod-reconciliation,cod-dispute}."
            "service.spec.ts. Tests cover: HDFC/ICICI/SBI parser fixtures, reconciliation matching, "
            "fuzzy match within window, dispute creation on miss, dispute resolution, cron trigger. "
            "This is the 2nd-highest ROI bead after KYC."
        ),
        "owner": "unassigned",
        "estimate": "5d",
        "blocked_by": ["SS-031"],
        "parent": "EPIC-COMPLIANCE",
    },
    {
        "id": "SS-034",
        "title": "P7-Mobile: PWA install + offline (Phase 1) then Expo native app (Phase 2)",
        "type": "feature",
        "priority": "P1",
        "status": "open",
        "labels": ["mobile", "pwa", "expo"],
        "created_at": "2026-06-15",
        "description": (
            "60% of Indian seller activity is mobile; Shiprocket has apps. Phase 1: PWA in "
            "apps/admin-portal/ (next-pwa plugin, manifest.json with icons 192/512/maskable, service "
            "worker with stale-while-revalidate for assets + network-first for API, Lighthouse PWA >= 90). "
            "Phase 2: Expo app in apps/mobile/ (Apollo Client + JWT in secure storage, screens "
            "Dashboard/Orders/Tracking, push notifications via Expo, biometric auth, EAS build for "
            "iOS+Android, TestFlight internal beta). Files (Phase 1): apps/admin-portal/{next.config.js,"
            "public/manifest.json,public/icons/,public/sw.js,app/layout.tsx}; (Phase 2): apps/mobile/"
            "{package.json,tsconfig.json,app.json,App.tsx,screens/}. Phase 1 in week 9, Phase 2 in week 10. "
            "Tests: lighthouse-ci PWA audit, e2e test of install flow on Chrome DevTools."
        ),
        "owner": "unassigned",
        "estimate": "10d",
        "blocked_by": ["SS-001"],
        "parent": "EPIC-MOBILE",
    },
    {
        "id": "SS-035",
        "title": "P8-Reliability: k6 load test scenarios at 10K RPS + bottleneck report",
        "type": "feature",
        "priority": "P1",
        "status": "open",
        "labels": ["observability", "performance", "typeorm"],
        "created_at": "2026-06-15",
        "description": (
            "Production SLA readiness requires evidence. Bead ships: 3 k6 scenarios (order-create at "
            "1K RPS p99<500ms, rate-shop at 5K RPS p99<200ms cache-hit-dominated, graphql mixed at 10K "
            "RPS p99<300ms), seed script for 100 tenants + 10K orders + 100K tracking events, npm scripts "
            "(loadtest:order-create, loadtest:rate-shop, loadtest:graphql-rps), bottleneck report in "
            "loadtest/README.md. Files: loadtest/k6/scenarios/{order-create,rate-shop,graphql-rps}.js; "
            "loadtest/k6/lib/seed.js; loadtest/README.md; root package.json npm run entries. The "
            "bottleneck report must identify the top-3 saturating components (likely: postgres connection "
            "pool, graphql resolver chain, redis throughput) with evidence + backlog follow-ups filed."
        ),
        "owner": "unassigned",
        "estimate": "3d",
        "blocked_by": ["SS-005b"],
        "parent": "EPIC-RELIABILITY",
    },
    {
        "id": "SS-036",
        "title": "P8-Reliability: Chaos engineering scenarios + runbook",
        "type": "feature",
        "priority": "P1",
        "status": "open",
        "labels": ["observability", "reliability"],
        "created_at": "2026-06-15",
        "description": (
            "Production SLA requires known failure modes. Bead ships: chaos/scenarios/redis-down.js "
            "(ioredis-mock + disconnect, app falls back to in-memory LRU + 503 on writes, /healthz "
            "flips), chaos/scenarios/postgres-failover.js (testcontainers restart + replica promotion, "
            "write resume within 30s), chaos/scenarios/carrier-timeout.js (proxy-mock 30s delay, "
            "circuit breaker trips, label gen fails with explicit error). chaos/README.md documents "
            "expected vs actual + follow-up beads for every gap. Files: chaos/scenarios/{redis-down,"
            "postgres-failover,carrier-timeout}.js; chaos/README.md. The runbook at "
            "/docs/runbooks/{redis,postgres,carrier-timeout}.md is created in the same PR."
        ),
        "owner": "unassigned",
        "estimate": "3d",
        "blocked_by": ["SS-035"],
        "parent": "EPIC-RELIABILITY",
    },
    {
        "id": "SS-037",
        "title": "P8-Trust: Public API docs (Postman + OpenAPI + getting-started)",
        "type": "feature",
        "priority": "P1",
        "status": "open",
        "labels": ["devex", "public-api"],
        "created_at": "2026-06-15",
        "description": (
            "A new integrator must sign up, get an API key, hit Postman Run, ship in <30 min. Bead "
            "ships: OpenAPI spec from REST controllers (use @nestjs/swagger), GraphQL schema reference "
            "(use auto-generated apps/api/src/schema.graphql as source of truth), Markdown docs "
            "(docs/public-api/{getting-started,authentication,rate-limits,errors,webhooks}.md), Postman "
            "collection with 8 example flows (order-create, rate-shop, tracking, label generation, RMA, "
            "wallet top-up, KYC submit, channel sync), Postman environment file with sandbox vars, "
            "hosted at /api/v1/openapi.json and /api/v1/docs. Files: docs/public-api/*.md; "
            "docs/openapi/swagger.yaml; postman/SwiftShip.postman_collection.json; postman/"
            "SwiftShip.postman_environment.json. Tests: collection runs end-to-end against staging."
        ),
        "owner": "unassigned",
        "estimate": "4d",
        "blocked_by": ["SS-035"],
        "parent": "EPIC-RELIABILITY",
    },
    {
        "id": "SS-038",
        "title": "P9-Growth: NDR analytics dashboard (breakdown by reason / pincode / courier / time)",
        "type": "feature",
        "priority": "P2",
        "status": "open",
        "labels": ["ndr-automation", "dashboard"],
        "created_at": "2026-06-15",
        "description": (
            "Sellers lose money to NDR they cant diagnose. Bead ships: NdrAnalyticsService (top N "
            "reasons with recovery rate + avg attempts), GraphQL queries (ndrAnalytics, ndrByPincode, "
            "ndrByCourier, ndrByTimeOfDay), admin portal dashboard with recharts. Files: "
            "libs/domains/ndr/src/lib/analytics/{ndr-analytics.service,ndr-analytics.resolver,"
            "ndr-analytics.model,ndr-analytics.input,index}.ts; libs/domains/ndr/src/lib/analytics/"
            "__tests__/ndr-analytics.service.spec.ts; apps/admin-portal/app/dashboard/ndr-analytics/"
            "page.tsx. Tests cover: breakdown by reason, top pincode clusters, courier comparison, "
            "time-of-day pattern. Reuses ndr_events table populated by SS-017 worker."
        ),
        "owner": "unassigned",
        "estimate": "3d",
        "blocked_by": ["SS-017"],
        "parent": "EPIC-NDR-GROWTH",
    },
    {
        "id": "SS-039",
        "title": "P9-Growth: Anchor tenant pilot playbook + dry-run script",
        "type": "feature",
        "priority": "P2",
        "status": "open",
        "labels": ["pilot", "go-to-market"],
        "created_at": "2026-06-15",
        "description": (
            "Cannot evaluate against synthetic load; need a real 5K-orders/day merchant. Bead ships: "
            "docs/anchor-tenant-pilot.md playbook (data import, DNS setup for branded tracking, webhook "
            "validation, billing setup, KYC submission, 2-week on-call rotation), scripts/tenant-"
            "onboarding-dryrun.sh (provisions tenant, creates API key, runs Postman collection, "
            "generates fake GST invoice, fires fake tracking event, simulates COD remittance), 3 "
            "candidate anchor tenants identified (D2C brands doing 3K-10K orders/day currently on "
            "Shiprocket, willing to migrate). Files: docs/anchor-tenant-pilot.md; scripts/"
            "tenant-onboarding-dryrun.sh. Acceptance: 1 tenant live doing >=5K orders/day for 2+ "
            "weeks, post-mortems filed for every incident, follow-up beads queued."
        ),
        "owner": "unassigned",
        "estimate": "10d",
        "blocked_by": ["SS-031", "SS-032", "SS-033", "SS-035"],
        "parent": "EPIC-GO-TO-MARKET",
    },
    {
        "id": "SS-040",
        "title": "P-FINAL: Prisma compat audit script + CI guard (no new shim imports)",
        "type": "chore",
        "priority": "P0",
        "status": "open",
        "labels": ["typeorm", "infra", "devex"],
        "created_at": "2026-06-15",
        "description": (
            "Without a guard, the 1-lib-per-week cadence is meaningless. Bead ships: scripts/"
            "audit-prisma-compat.mjs (greps libs/domains/*/src for PrismaCompat and @prisma/client, "
            "prints counts per lib), npm run audit:prisma in root package.json, CI step that fails "
            "the graph job on any new @prisma/client import. The audit runs on every PR and on the "
            "Nx graph CI job before lint. docs/superpowers/plans/2026-06-15-prisma-audit.md captures "
            "the day-0 baseline. Files: scripts/audit-prisma-compat.mjs; root package.json; "
            ".github/workflows/ci.yml. Replaces SS-029 in the bead log as the first child of the "
            "shim-removal track."
        ),
        "owner": "unassigned",
        "estimate": "1d",
        "blocked_by": [],
        "parent": "EPIC-TYPEORM-FINAL",
    },
    {
        "id": "SS-041",
        "title": "P-FINAL: Migrate libs/domains/billing off PrismaCompat to @InjectRepository",
        "type": "chore",
        "priority": "P0",
        "status": "open",
        "labels": ["typeorm", "billing"],
        "created_at": "2026-06-15",
        "description": (
            "First shim-removal bead. MIGRATION.md runbook + call-site mapping. Replace every "
            "prisma.x.* call in libs/domains/billing/src/lib/*.service.ts with the equivalent "
            "@InjectRepository(Entity) repository call. Add TypeOrmModule.forFeature to "
            "billing.module.ts. Remove registerPrismaCompat. Tests: 100% green, coverage unchanged "
            "or better. Files: libs/domains/billing/src/lib/*.service.ts; libs/domains/billing/src/"
            "lib/billing.module.ts. Reuses the TypeORM billing service stub at libs/domains/billing/"
            "src/lib/typeorm-billing.service.ts as the reference for the pattern."
        ),
        "owner": "unassigned",
        "estimate": "3d",
        "blocked_by": ["SS-040"],
        "parent": "EPIC-TYPEORM-FINAL",
    },
    {
        "id": "SS-042",
        "title": "P-FINAL: Migrate libs/domains/cod off PrismaCompat (adds reconciliation invariant test)",
        "type": "chore",
        "priority": "P0",
        "status": "open",
        "labels": ["typeorm", "cod", "billing"],
        "created_at": "2026-06-15",
        "description": (
            "Second shim-removal bead. Money lib, so must include a reconciliation invariant test "
            "asserting that for every tenant, sum(ledger credits) - sum(ledger debits) == "
            "wallet.availableBalance, on every test run. Per MIGRATION.md, cod has been on compat; "
            "migrate all *.service.ts. Files: libs/domains/cod/src/lib/*.service.ts; libs/domains/"
            "cod/src/lib/cod.module.ts; libs/domains/cod/src/lib/__tests__/"
            "cod-reconciliation-invariant.spec.ts (new)."
        ),
        "owner": "unassigned",
        "estimate": "3d",
        "blocked_by": ["SS-041"],
        "parent": "EPIC-TYPEORM-FINAL",
    },
    {
        "id": "SS-043",
        "title": "P-FINAL: Migrate remaining 8 libs (manifests/onboarding/orders/payments/pickups/shipments/users/identity) off PrismaCompat",
        "type": "chore",
        "priority": "P1",
        "status": "open",
        "labels": ["typeorm"],
        "created_at": "2026-06-15",
        "description": (
            "Bulk shim removal for the remaining 8 libs. Special cases: orders + shipments use "
            "createQueryBuilder for join-heavy calls + N+1 test (100 items <= 5 queries); payments "
            "preserves raw-body capture for Stripe + Razorpay signature verification; users + "
            "shared/identity preserve TenantContext propagation through @InjectRepository. Each lib "
            "gets its own subtask in the bead log. SS-043 is the umbrella; child beads SS-043a "
            "through SS-043h. Runs weeks 3-9 of Track A. Per MIGRATION.md, the remaining compat libs "
            "are: manifests, onboarding, orders, payments, pickups, shipments, users (plus shared/"
            "identity). Acceptance per lib: zero PrismaCompat refs + 100% tests green + coverage "
            "delta >= 0. The shim-delete gate (SS-044) requires this bead to be fully closed."
        ),
        "owner": "unassigned",
        "estimate": "21d",
        "blocked_by": ["SS-042"],
        "parent": "EPIC-TYPEORM-FINAL",
    },
    {
        "id": "SS-044",
        "title": "P-FINAL: Delete PrismaCompat shim + @prisma/client re-exports (Plan 5 complete)",
        "type": "chore",
        "priority": "P0",
        "status": "open",
        "labels": ["typeorm", "infra"],
        "created_at": "2026-06-15",
        "description": (
            "The big day. Delete libs/platform/typeorm/src/lib/prisma-compat.types.ts + "
            "@prisma/client/index.d.ts + @prisma/client/runtime.d.ts. Drop the two @prisma/client "
            "path mappings from tsconfig.base.json. Drop the no-restricted-imports rule from "
            "eslint.config.mjs. Run full monorepo build+test+lint+typecheck+e2e, all must pass. "
            "Update MIGRATION.md: Plan 5 complete with date. Files: delete 3; modify "
            "tsconfig.base.json + eslint.config.mjs + MIGRATION.md. SS-040 audit script must "
            "return 0 @prisma/client imports repo-wide as the precondition."
        ),
        "owner": "unassigned",
        "estimate": "1d",
        "blocked_by": ["SS-043"],
        "parent": "EPIC-TYPEORM-FINAL",
    },
]


def main() -> int:
    with BEADS_PATH.open("a", encoding="utf-8") as f:
        for bead in NEW_BEADS:
            f.write(json.dumps(bead, ensure_ascii=False) + "\n")
    print(f"Appended {len(NEW_BEADS)} beads to {BEADS_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
