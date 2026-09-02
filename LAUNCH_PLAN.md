# Launch Plan — from "feature-complete repo" to "competing with Shiprocket"

> Written 2026-08-30, after the full docs/code audit (`STATUS.md`).
> Question this answers: **is SwiftShip ready to deploy and compete — and if not,
> what exactly gets it there?**
>
> Companion docs: [`STATUS.md`](./STATUS.md) (tree state + known breakage),
> [`ROADMAP_24W.md`](./ROADMAP_24W.md) (what was built), [`READINESS_SUMMARY.md`](./READINESS_SUMMARY.md)
> (capability snapshot), [`docs/anchor-tenant-pilot.md`](./docs/anchor-tenant-pilot.md)
> (pilot playbook that exists today).

---

## 0. The honest verdict

**No — it cannot be deployed today, and it is not yet competitive.** But the gap
is smaller than it looks and is well-understood. Three distinct layers:

| Layer | State | Blocking? |
|---|---|---|
| **1. It must compile and boot** | ❌ `apps/api` fails typecheck (import depths, missing jest config), `src/prisma` imports a deleted file, e2e inherits the breakage | **Yes — nothing else matters until this is fixed** |
| **2. It must be verified end-to-end** | ⚠️ ~96 unit specs exist, but e2e is a health-check only, the full stack has never been booted as a unit, SDK CI round-trip never observed green, k6/chaos written but never run against a live stack | **Yes — for any real customer** |
| **3. It must be *real*, not sandbox** | ⚠️ Carrier adapters are real code but credential-gated (no live carrier agreements visible in the repo); ClearTax = sandbox; WATI/Exotel = trial creds; Razorpay/Stripe = test keys; no domain, no TLS, no status page, no on-call, no DLT registration, no production DB | **Yes — for revenue** |

**What is genuinely strong already** (don't rebuild any of this):
multi-tenant architecture (wallet, throttling, feature flags), the rate engine
(cache + circuit breaker + ranking + A/B simulator), NDR automation + analytics,
COD reconciliation with 5-bank parsing, KYC/GST/E-way flows, channel integrations
(6 channels), public REST + GraphQL + 3 SDKs, observability (OTel/Sentry/audit/
correlation), k8s manifests, CI, chaos + load tooling, pilot playbook.

**The uncomfortable truth about "competing with Shiprocket":** their moat is not
features — it's (a) negotiated carrier rates, (b) years of uptime trust,
(c) support at scale, (d) a sales org. This repo already exceeds their *product*
surface (GraphQL, SDKs, rate simulator, transparent COD recon). The plan below
is therefore 40% engineering and 60% business/ops — that ratio is normal and
should be embraced, not fought.

---

## 1. Phase 0 — Make it run *(engineering unf*ck)*

**Goal:** `docker compose up` boots a working API + web + admin; all CI gates green.
**Estimate:** 1–2 weeks, 1 developer. **Everything else is blocked on this.**

- [x] **P0 fixes from STATUS.md §2** (exact symptoms there):  — ALL DONE 2026-09-01 (SS-100; plus ~25 further live-boot bugs):
  - [x] `apps/api/src/app.module.ts` + `main.ts`: fix `'../../libs/...'` → `'../../../libs/...'`; delete the garbage `'../../libs/domains/..'` import
  - [x] Fix `app.resolver.ts` TS2564s; add `@types/morgan` (+ @types/passport-jwt, @types/nodemailer, @types/pdfkit, @types/aws4, @nestjs/swagger@11, @nestjs/schedule)
  - [x] Recreate `apps/api/jest.config.ts` + `tsconfig.spec.json` (copy shape from `libs/domains/channels`)
  - [x] Bypass `src/prisma/prisma.service.ts` (legacy tree cut from the app graph; deletion with SS-101) (imports deleted shim)
  - [x] Fix TS2322 in `libs/platform/typeorm/src/lib/datasource.ts` (+ JoinColumn/uuid-FK sweep across all entities)
  - [x] Give `libs/domains/ecommerce-integrations` a `project.json` (lint-only until SS-101 ports its services) (graph-guard expects it)
- [x] **Gates green:** (typecheck+test green for api + all touched libs; e2e suites written, run pending SS-102) `npx nx run-many -t lint typecheck test --all`, then `npx nx run api-e2e:e2e`; roll the `jest.preset.js` fix into every domain lib
- [x] **Boot the whole thing locally (2026-09-01):** live against docker Postgres+Redis — schema auto-created, /health OK, GraphQL serves, register/login return real JWTs. Local port note: containers on 55432/56379 via docker-compose.override.yml. `docker compose up -d postgres redis` → run all 16 migrations → `nx serve api` → verify GraphQL playground, `/health/ready`, `/metrics`, `/docs/v1/` (api-public), admin-portal + web pages render
- [x] **Fix the Docker story:** root `Dockerfile` is now the canonical multi-stage Nx build (`npx nx build api` → `dist/apps/api/main.js`, plus a CommonJS `typeorm` lib build for startup migrations via `docker-entrypoint.sh`); dead `prisma/` copy and `apps/api/Dockerfile` removed; compose + `release.yml` aligned (see `deploy/k8s/README.md` → "Production image")
- [ ] **Push and watch CI:** (only remaining Phase-0 item — e2e job needs the SS-102 DATABASE_URL fix first) `ci.yml` fully green including `graph-guard`; `sdk-ci.yml` green on a Linux runner (the deferred SS-027 acceptance — needs JDK 21 on the runner, which GitHub-hosted has)
- [ ] **Seed a demo tenant end-to-end** via the existing dry-run script: `scripts/tenant-onboarding-dryrun.sh` — it exercises signup → KYC → order → rate-shop → label → tracking through GraphQL+REST+newman. If it passes, Phase 0 is done.

**Exit criteria:** one command boots the platform; CI is green; the dry-run script passes on a clean database.

## 2. Phase 1 — Make it real *(integration hardening)*

**Goal:** every external dependency talks to a production (or production-equivalent)
endpoint. Runs **in parallel with Phase 2**.
**Estimate:** 3–6 weeks elapsed, mostly waiting on external approvals — start all
applications in week 1.

- [ ] **Carriers — the big one.** The 13 adapters are real implementations gated on
  env credentials. Priority order for India D2C volume:
  1. Delhivery, 2. BlueDart, 3. DTDC, 4. Ecom Express, 5. Xpressbees (these 5 ≈ 80% of market volume)
  - [ ] Register for each carrier's partner/API program (Delhivery Partner API, BlueDart Dart+ web services, DTDC API, Ecom Express, Xpressbees) — each needs company KYC of *SwiftShip itself*
  - [ ] Get sandbox creds → run each adapter against the carrier sandbox → fix the request/response drift that only live testing reveals
  - [ ] **Negotiate rate cards** (or start via a carrier aggregator to resell while direct contracts mature). Without real rates, the rate engine ranks fiction
  - [ ] Deactivate uncontracted carriers in the registry (graceful skip already built in) — never show a rate you can't fulfil
- [ ] **GST/E-way:** swap `ClearTaxSandboxAdapter` → ClearTax production (or IRIS) with the company's own GSTIN; verify e-way bill numbers are government-valid
- [ ] **WhatsApp + SMS + voice (India-specific, long lead times):**
  - [ ] WhatsApp Business API via WATI/Gupshup — needs business verification + **template approvals (1–2 weeks each batch)**; the NDR templates are the priority
  - [ ] **DLT registration** (mandatory in India for SMS) + approved sender IDs — start immediately, it's the slowest
  - [ ] Exotel production account for the NDR voice fallback
- [ ] **Payments:** Razorpay live KYC (Route for settlements if marketplace-style flows are needed); wire wallet top-up → actual gateway webhooks → ledger; reconcile against the existing invoice system. Stripe is only useful for international — deprioritize
- [ ] **Bank + COD remittance:** open the current account, register the sweeps, and validate the 5 bank parsers against *real* statement formats (HDFC/ICICI/Axis/SBI/Kotak exports) — parser drift is the #1 recon failure mode
- [ ] **KYC of merchants:** point the PAN/GSTIN validators at production APIs; define the manual-review queue for failures
- [ ] **Secrets:** move every credential to sealed secrets/vault in k8s; rotate anything that ever lived in a laptop `.env`

**Exit criteria:** a label generated in the system is a *real*, trackable AWB from a real carrier; a WhatsApp NDR message actually arrives; a wallet top-up actually settles.

## 3. Phase 2 — Make it live *(production deployment)*

**Goal:** a hardened, monitored, public deployment. Runs in parallel with Phase 1.
**Estimate:** 2–3 weeks.

- [ ] **Pick the target:** the k8s manifests in `deploy/k8s/` are ready for a small cluster (Hetzner/DO/AWS). Simpler alternative for v1: managed Postgres (Neon/RDS) + managed Redis + the api/web/admin images on ECS/Fly/Render — fewer moving parts, migrate to k8s at scale
- [ ] **Domains + TLS:** `api.swiftship.ai`, `app.swiftship.ai` (admin), `track.swiftship.ai` (web) + CDN in front of the widget scripts
- [ ] **Data discipline:** migrations run via CI job; automated backups + PITR + a *tested* restore; staging environment that mirrors prod
- [ ] **Observability actually on:** Grafana dashboard (exists: `deploy/grafana/dashboards/swiftship-api.json`), alert rules → phone (PagerDuty/free alternative), Sentry prod DSN, log retention
- [ ] **Status page + runbooks:** self-host upptime; promote the chaos runbooks (`chaos/runbooks/`) to the incident playbook; define on-call (even a 1-person rotation)
- [ ] **Run the tooling that's already written, against staging:**
  - [ ] k6: `loadtest:order-create`, `loadtest:rate-shop`, `loadtest:graphql-rps` — first realistic target: **sustained 50 RPS, p95 < 500ms** (a 5K orders/day tenant is ~0.1 RPS avg; leave headroom), then scale goals later
  - [ ] chaos: `chaos:redis`, `chaos:postgres`, `chaos:carrier` — verify graceful degradation, not crashes
- [ ] **Security pass:** dependency audit (`npm audit`), rotate all secrets, verify tenant isolation with a 2-tenant penetration test (the #1 SaaS risk here), rate-limit at the edge, review the audit log coverage on money mutations
- [ ] **E2E the money paths** (expand `apps/api-e2e` beyond health): signup → KYC → order → rate-shop → label → track → NDR → COD → reconcile → invoice → wallet. One test per leg minimum

**Exit criteria:** public HTTPS endpoints, staging passes load + chaos suites, backups restore-tested, alerts fire to a human.

## 4. Phase 3 — Make it used *(anchor-tenant pilot)*

**Goal:** proof that a real merchant ships real volume cheaper/better than Shiprocket.
**Estimate:** 4–8 weeks. The playbook already exists — execute it.

- [ ] Recruit per `docs/anchor-tenant-pilot.md`: 1 friendly merchant doing 500–3K orders/day (start with 1, not 3)
- [ ] **Ramp:** week 1: 10 orders/day manual-batch → week 2: 100 → weeks 3-4: 1K/day automated → hold
- [ ] **Kill/scale criteria — measure weekly against their existing Shiprocket account:**
  - per-shipment landed cost (must be ≤, ideally 5–10% below)
  - delivery SLA hit-rate per lane
  - label/manifest failure rate (< 0.5%)
  - COD reconciliation accuracy (target ≥ 99.5% within 48h — the existing engine's promise)
  - NDR auto-resolution within 4h (target 70%)
- [ ] Run support personally (WhatsApp group, < 15min response) — this doubles as requirements gathering
- [ ] Fix what breaks (there *will* be carrier webhook drift, parser drift, edge pincodes); add each fix as a bead + e2e test
- [ ] After 2 stable weeks at 1K+/day: invoice them (real money through the wallet), get a written testimonial + the cost/SLA comparison numbers

**Exit criteria:** one merchant, 1K+ orders/day for 2+ weeks, paying, at measurably better cost or SLA than Shiprocket.

## 5. Phase 4 — Make it competitive *(the actual fight)*

Only meaningful after Phase 3 evidence. Levers, in order of ROI:

1. **Sell the differentiators merchants can't get from Shiprocket:**
   - transparent COD reconciliation (their #1 support complaint about aggregators)
   - rate simulator ("what if you'd used X") + courier scorecards
   - DevEx: GraphQL + 3 SDKs + Swagger + Postman (agencies and headless brands care)
   - NDR analytics + WhatsApp-first automation
2. **Pricing attack:** Shiprocket's starter plans land ~₹27–42 per 500g after add-ons. With direct carrier contracts + the wallet model, publish *all-in* per-shipment pricing with no surprise surcharges — that alone is a sales pitch
3. **Scale the pilot 1 → 10 tenants** (the tenancy/rate-limit/feature-flag work is done — this is sales + support load)
4. **Then build the vision items** still unbuilt from `project_overview.md`: AI fraud detection (RTO prediction on COD orders — data now exists from the pilot), white-label tracking domains, support chatbot
5. **Reliability track record:** publish the status page history; SOC2-style controls when enterprise tenants ask

## 6. Timeline summary (assumes 1–2 devs + founder doing business ops)

| Phase | Elapsed | Parallel? | Gate |
|---|---|---|---|
| 0 — Make it run | weeks 1–2 | — | boots + CI green + dry-run passes |
| 1 — Make it real | weeks 2–8 | with 2 | real AWB, real WhatsApp, settled payment |
| 2 — Make it live | weeks 3–5 | with 1 | public HTTPS, load+chaos green, backups |
| 3 — Make it used | weeks 6–14 | — | 1 paying anchor tenant @ 1K orders/day |
| 4 — Compete | weeks 14+ | — | 10 tenants, published pricing |

**Realistic time to first revenue: ~2.5–3 months.** Time to credible Shiprocket
alternative: 6–12 months of Phase 3→4 iteration — same as any logistics SaaS.

## 7. Top risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Carrier API drift breaks adapters in weeks 1–4 of pilot | **High** | sandbox-first hardening, contract tests per adapter, circuit breaker already built |
| Carrier rate negotiations stall (no live rates) | **High** | start via aggregator reselling; the rate engine doesn't care where rates come from |
| DLT/WhatsApp approvals eat 3+ weeks | **High** | file in week 1; NDR voice + portal fallbacks exist |
| COD parser mismatches erode merchant trust | Medium | validate parsers on real statements (Phase 1); dispute queue exists for the residue |
| Solo-dev bus factor / burnout | Medium | Phase 0 first (unblocks everything), then ruthlessly prioritize the 5 core carriers |
| Trying to compete on features instead of rates+trust | Medium | this plan caps feature work until Phase 3 evidence exists |

---

## What to do *right now* (day 1)

1. Work the Phase 0 checklist top-to-bottom (it's STATUS.md §2 + §4).
2. File the carrier partner applications + DLT registration **today** — longest leads.
3. Recruit the anchor tenant candidate in parallel — their lane mix tells you which 5 carriers to harden first.
