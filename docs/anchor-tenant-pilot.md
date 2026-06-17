# Anchor Tenant Pilot — Playbook

> **Purpose.** Land one real D2C merchant doing ≥5K orders/day onto SwiftShip AI, keep them live for 2+ weeks, and turn every incident into a follow-up bead. The pilot is the boundary between "we built it" and "it works for a paying customer under load." No scaling, no Series-A fundraise, no enterprise sales motion happens before this.

**Owner:** founder (CSM role until the first 5 tenants are live).  
**Status:** `SS-039` in the bead log.  
**Success criteria:** 1 tenant live doing ≥5K orders/day for 2+ weeks, post-mortem filed for every incident, follow-up beads queued and tracked in `.beads/issues.jsonl`.

---

## Table of contents

1. [Why this exists](#why-this-exists)
2. [Success criteria](#success-criteria)
3. [Candidate profile template](#candidate-profile-template)
4. [Pre-pilot checklist](#pre-pilot-checklist)
5. [Migration playbook](#migration-playbook)
6. [Daily operations during pilot](#daily-operations-during-pilot)
7. [Incident management](#incident-management)
8. [Success metrics](#success-metrics)
9. [Follow-up beads](#follow-up-beads)
10. [How to fill this in](#how-to-fill-this-in)

---

## Why this exists

We have:

- 65/65 roadmap beads closed.
- 18 domain libs migrated to TypeORM.
- 5 platform adapters (Shopify, WooCommerce, Amazon, Flipkart, Myntra).
- 3 official SDKs (Node, Python, PHP) generated from a tsoa-backed REST API.
- Full observability (OpenTelemetry, Sentry, audit log, correlation IDs).
- Per-tenant wallet, rate limits, KYC, GST, public rate-shop, branded tracking.

We do **not** have:

- A real customer under real load.
- Real reconciliation drift on COD remittances.
- Real DNS, real carrier accounts, real refund requests.
- Real complaints from a real human who has a real alternative (Shiprocket, Delhivery Direct, iThink Logistics) and can churn.

The anchor tenant pilot is the first place those become real. The script at [`scripts/tenant-onboarding-dryrun.sh`](../scripts/tenant-onboarding-dryrun.sh) exercises the technical onboarding path against a fresh dev environment so we can rehearse the cutover before we touch a real merchant.

---

## Success criteria

The pilot is "done" (and we move on to the next 5 tenants) when **all** of the following are true:

1. **1 tenant** is provisioned and live on SwiftShip AI for ≥2 consecutive weeks.
2. **Order volume:** ≥5,000 orders/day on the SwiftShip AI path (i.e. real orders, not synthetic load).
3. **Cutover:** either fresh onboarding (no prior shipping platform) or migration from a competitor. The migration path must be rehearsed against the dry-run script first.
4. **Post-mortems filed** for every SEV1/SEV2 incident during the 2-week window. Post-mortems live in `docs/post-mortems/<date>-<slug>.md`.
5. **Follow-up beads queued** in `.beads/issues.jsonl` for every actionable item in every post-mortem. Use the `incident` label.
6. **Customer-reported incidents:** zero unresolved SEV1 at the 2-week mark. SEV2/3/4 can have open follow-up beads as long as the customer is informed.
7. **Wallet / billing** working with at least one auto-topup cycle.
8. **Branded tracking page** in use by the tenant's end customers (DNS + custom domain verified).
9. **NDR handling** is exercising the AI suggestion + manual override flow.
10. **COD remittance reconciliation** has at least one full settlement cycle (bank → SwiftShip AI → tenant wallet) without a discrepancy that requires a manual fix.

If any of these fail, the pilot is not done and a follow-up bead is filed explaining why and what the new exit criteria are.

---

## Candidate profile template

> **How to fill this in:** do **not** invent real company names, contact details, or order volumes. Use this template as a *schema*. For each real D2C anchor tenant you identify, copy the section below into `docs/anchor-tenant-pilots/<slug>.md` and fill in the real values. The bead description lists "3 candidate anchor tenants" as a deliverable — that is a *template-shaped list*, not fabricated data.

```markdown
## Candidate: {{slug}}

| Field | Value |
| --- | --- |
| Brand name | {{legal name of the D2C brand}} |
| Current platform | {{Shiprocket / Delhivery Direct / iThink / Ecom Express / other}} |
| Daily order volume (avg) | {{e.g. 6,200 orders/day}} |
| Daily order volume (peak, e.g. Diwali) | {{e.g. 18,000 orders/day}} |
| SKU count | {{e.g. 240 SKUs}} |
| Warehouses | {{count + city list, e.g. 2 (Bengaluru, Mumbai)}} |
| Cash on Delivery share | {{e.g. 65%}} |
| Prepaid share | {{e.g. 35%}} |
| NDR rate on current platform | {{e.g. 8.4%}} |
| RTO rate on current platform | {{e.g. 11.2%}} |
| Decision-maker (name, title) | {{e.g. Priya Sharma, Head of Ops}} |
| Decision-maker email / phone | {{+91-... / priya@brand.in}} |
| Technical contact (name, title) | {{e.g. Amit Patel, CTO}} |
| Technical contact email / phone | {{amit@brand.in / +91-...}} |
| On-call contact (24/7 reachable) | {{name + phone — this person gets paged on SEV1}} |
| NDA status | {{signed / not yet / not needed}} |
| Go-live target date | {{e.g. 2026-08-15}} |
| Estimated migration scope | {{number of carriers to migrate, number of SKUs to re-import, estimated downtime window}} |
| Branded tracking domain they want | {{e.g. track.brand.in — must be a domain they own}} |
| KYC documents on file | {{PAN: yes/no, GSTIN: yes/no, bank proof: yes/no}} |
| Pricing tier offered | {{Starter / Growth / Pro / Enterprise}} |
| Wallet top-up amount | {{e.g. ₹50,000 initial}} |
| Auto-topup threshold | {{e.g. recharge when balance < ₹10,000}} |
| Migration approach | {{fresh onboarding / parallel-run / cutover}} |
| Parallel-run window | {{if parallel-run: how long both platforms run, e.g. 7 days}} |
| Rollback criteria | {{what would make us roll back, e.g. >2% order failure rate, NDR rate doubles}} |
| Pilot exit criteria | {{what they expect to see after 2 weeks to consider us their primary platform}} |
```

**Minimum-viable candidate.** A candidate that is *not* a fit:

- Volume <1K orders/day (the operational load isn't enough to surface real bugs).
- Already on a competitor with no current complaints (low motivation to migrate).
- No technical contact reachable on weekends (SEV1 response will stall).
- No NDA in place before the dry-run (legal review of the merchant agreement must happen before any data flows).

**Best-fit candidate.** Volume 3K-10K/day, currently on Shiprocket, has at least one operational pain point (high NDR rate, slow wallet topup, poor branded tracking, lack of rate-shop transparency) that SwiftShip AI directly addresses, has a technical contact who is responsive on Slack/WhatsApp.

---

## Pre-pilot checklist

Complete every item below **before** running [`scripts/tenant-onboarding-dryrun.sh`](../scripts/tenant-onboarding-dryrun.sh) against a real merchant.

### Data import

- [ ] SKU CSV exported from the tenant's current platform, in the format documented at [`docs/data-import/sku-csv.md`](./data-import/sku-csv.md).
- [ ] Warehouse CSV (or JSON), one row per warehouse, with `name`, `pincode`, `contact_phone`, `is_primary`.
- [ ] Rate card CSV per carrier (or accept the default SwiftShip AI rate card; the tenant's negotiated rates need to be loaded separately via the carrier integration).
- [ ] Customer list (optional — only if migrating an existing customer base that expects to see order history).
- [ ] Historical order data (last 90 days, optional, for analytics backfill).

### DNS setup for branded tracking

- [ ] Tenant owns a domain they want to use (e.g. `track.brand.in`).
- [ ] They create a CNAME: `track.brand.in → cname.tracking.swiftship.ai`.
- [ ] TLS provisioned automatically via the SwiftShip AI CDN; verify with `curl -I https://track.brand.in/track/TEST-AWB` returns 200 and the SwiftShip AI TLS cert.
- [ ] End-customer tracking page renders with the tenant's logo + colour scheme (set in `ChannelConnectionEntity.settings` or via the admin portal's "Branding" tab).

### Webhook validation

- [ ] Tenant's webhook URL is reachable from the public internet.
- [ ] Webhook receiver implements HMAC-SHA256 verification using the shared secret from `TenantApiKeyEntity.webhookSecret`.
- [ ] Tenant tests the webhook with a sample event using the [`scripts/test-webhook.sh`](../scripts/test-webhook.sh) helper (to be created in SS-039.1).
- [ ] Tenant confirms their endpoint handles retries (BullMQ retries with exponential backoff up to 5 times, then moves to dead-letter queue).

### Billing setup

- [ ] Tenant's PAN, GSTIN, and cancelled cheque are uploaded via the admin portal's "KYC" tab.
- [ ] Auto-topup enabled with a sensible threshold (e.g. recharge ₹50,000 when balance < ₹10,000).
- [ ] Invoice template customised with the tenant's logo + address.
- [ ] Tenant's finance team has a working email address on the `BillingContact` record (invoices CC'd there).

### KYC submission

- [ ] PAN: front + back image uploaded, OCR-extracted PAN matches the registered name.
- [ ] GSTIN: certificate + last filed GSTR-3B uploaded.
- [ ] Bank proof: cancelled cheque or bank statement (last 90 days) with the account number, IFSC, and account-holder name matching the registered name.
- [ ] KYC review SLA: 24 hours during business days, 48 hours on weekends. The founder (CSM) is the reviewer for the first 5 tenants.

---

## Migration playbook

The migration has three phases: **rehearsal**, **parallel-run**, and **cutover**. The dry-run script exercises the rehearsal phase.

### Rehearsal (T-7 days)

1. **T-7d:** Founder + technical contact kick off. Run the dry-run script against the dev environment: `bash scripts/tenant-onboarding-dryrun.sh --api=http://localhost:3000 --rest=http://localhost:3001`.
2. **T-6d:** Customisation. Per-tenant rate card loaded, branded tracking domain DNS configured (with a 1-hour TTL on the old CNAME to enable fast rollback).
3. **T-5d:** Webhook contract signed off by the tenant's technical contact. Sample events fired in dev, verified end-to-end.
4. **T-4d:** Billing wallet topped up. Invoice template approved. Auto-topup enabled.
5. **T-3d:** KYC documents uploaded. KYC review completed.
6. **T-2d:** Dry-run *again*, this time against a staging environment that mirrors production. Any errors from the first run are resolved.
7. **T-1d:** Final go/no-go meeting. All stakeholders on the call. Rollback plan reviewed.

### Parallel-run (T+0 to T+7)

1. **T+0:** DNS switched to point at SwiftShip AI (low TTL from T-2d makes this fast). Old CNAME remains valid as a fallback for 7 days.
2. **T+0 to T+7:** Both platforms run simultaneously. New orders go through SwiftShip AI. Old in-flight orders complete on the legacy platform.
3. **Daily review at 18:00 IST:** NDR rate, RTO rate, latency p95, error rate, wallet balance. Compare side-by-side with the legacy platform's numbers.
4. **T+3:** First mid-pilot checkpoint. Any SEV1/2 incidents trigger a go/no-go decision.
5. **T+7:** If metrics are within agreed bounds, proceed to cutover. If not, extend parallel-run by another week and file a follow-up bead for the regressions found.

### Cutover (T+7)

1. Old platform's order creation disabled (read-only mode for compliance).
2. Old webhook subscriptions removed.
3. Old DNS CNAME removed.
4. Old wallet balance refunded to the tenant (or transferred to SwiftShip AI wallet if they want to consolidate).
5. Tenant is now a paying SwiftShip AI customer.

### Rollback

If at any point during parallel-run or cutover the agreed rollback criteria fire (e.g. error rate >2%, NDR rate doubles), the rollback is:

1. Revert the DNS CNAME to the legacy platform (TTL was 1 hour, so it propagates in 1-2 hours).
2. Pause new order creation on SwiftShip AI (admin portal: tenant → "Pause" toggle).
3. Communicate to the tenant within 30 minutes.
4. File a SEV1 post-mortem within 48 hours.
5. Do **not** re-attempt the cutover until the post-mortem action items are resolved.

---

## Daily operations during pilot

### Dashboards to watch

The Grafana dashboard for an active pilot is at `https://grafana.swiftship.ai/d/anchor-pilot-<tenant-slug>`. The dashboard tracks:

- **Order volume** (per hour, per day, vs. previous 7 days).
- **Latency p50 / p95 / p99** for the `createOrder`, `getRateQuotes`, `recordTrackingEvent`, and `generateLabel` mutations.
- **Error rate** (5xx only) per mutation.
- **NDR rate** (NDRs / delivered attempts) — should be 1-2 percentage points lower than the legacy platform within 7 days.
- **RTO rate** (RTOs / delivered attempts).
- **Wallet balance** + auto-topup frequency.
- **Branded tracking page views** (the `track.<tenant-domain>` analytics).
- **Webhook delivery success rate** (BullMQ: `completed` / (`completed` + `failed` + `dead_letter`)).

### Slack channel

Each pilot tenant gets a dedicated Slack channel: `#anchor-<tenant-slug>`. Channel members:

- The founder (CSM, paged 24/7 for SEV1).
- The technical contact at the merchant.
- The on-call engineer (rotates weekly; see below).
- The merchant's account manager (if they have one).

Channel etiquette:

- Use threads. Don't @channel.
- Bot posts (Datadog, PagerDuty, Sentry) are silenced in-channel but archived to a separate `#anchor-<tenant-slug>-alerts` channel.
- SEV1 incidents are declared with `:rotating_light: SEV1:` prefix. All hands on deck.

### On-call rotation

The 2-week on-call rotation:

| Day | Primary | Secondary |
| --- | --- | --- |
| Day 1-3 (Mon-Wed) | Engineer A | Engineer B |
| Day 4-5 (Thu-Fri) | Engineer B | Engineer A |
| Day 6-7 (Sat-Sun) | Engineer A (on-call) | Engineer B (escalation only) |
| Day 8-10 (Mon-Wed) | Engineer B | Engineer A |
| Day 11-12 (Thu-Fri) | Engineer A | Engineer B |
| Day 13-14 (Sat-Sun) | Engineer B (on-call) | Engineer A (escalation only) |

For the very first anchor tenant, "Engineer A" and "Engineer B" are the founder + a contracted DevOps engineer. Once the next 4 tenants land, dedicated CSM + on-call engineer roles are hired.

---

## Incident management

### Severity definitions

| Severity | Definition | Response time | Examples |
| --- | --- | --- | --- |
| SEV1 | Tenant cannot process orders OR data loss OR PII leak | 15 min | DNS misrouted, wallet double-debit, labels returning 500, order data not persisted |
| SEV2 | Tenant can process orders but with significant degradation | 1 hour | Latency p95 >2s, tracking events dropped, NDR webhook failing |
| SEV3 | Tenant can process orders normally but a feature is broken | 4 hours | Branded tracking page CSS broken, invoice PDF malformed, refund flow hangs |
| SEV4 | Cosmetic / minor / nice-to-have | next business day | Typo in admin portal, non-critical log line missing tenant id |

### Post-mortem template

Every SEV1 and SEV2 incident gets a post-mortem within 48 hours. Template at [`docs/post-mortems/_template.md`](./post-mortems/_template.md). The bead log gets a new `SS-039.1-incident-<slug>` entry per incident, with the post-mortem path linked.

### Follow-up bead conventions

Every actionable item in a post-mortem becomes a bead:

- Severity in the title: `[SEV1]` or `[SEV2]`.
- Parent: `SS-039` (so they show up under the pilot in `bd list`).
- Labels: `incident`, `pilot`, plus the system involved (`billing`, `carriers`, `ndr`, etc.).
- Estimate: 1-3 days for SEV1 fixes, 1-5 days for SEV2.

---

## Success metrics

At the end of the 2-week pilot, the founder writes a summary to `docs/post-mortems/pilot-summary-<tenant-slug>.md` covering:

- **Order volume processed:** total + per-day.
- **NDR rate:** SwiftShip AI vs. legacy platform (should be ≤ legacy).
- **RTO rate:** SwiftShip AI vs. legacy platform.
- **Latency p50 / p95 / p99** for the 4 critical mutations.
- **Error rate** (5xx) per mutation.
- **Customer-reported incidents:** count by severity.
- **Cost-per-order** vs. the legacy platform (the wallet statement makes this easy to compute).
- **Feature requests** from the tenant (each one becomes a candidate bead).
- **Net Promoter Score** from the tenant's decision-maker (yes, even for one tenant — this is the founder's gut check).
- **Decision:** continue (the tenant stays on SwiftShip AI as a paying customer), expand (the tenant increases volume), or churn (the tenant migrates back to their legacy platform). Each outcome has a follow-up bead.

---

## Follow-up beads

After the pilot ends, the typical follow-up beads are:

- `SS-039.1-incident-*` (one per SEV1/SEV2 incident).
- `SS-040-pricing-feedback` (if the tenant asked for tier changes).
- `SS-041-feature-request-*` (one per feature request).
- `SS-042-onboarding-improvements` (if the dry-run script or playbook needs to change based on what we learned).
- `SS-043-second-anchor-tenant` (start the next pilot).

---

## How to fill this in

This playbook is intentionally **not filled in with real candidate data**. The candidate profile template at [§3](#candidate-profile-template) is the schema; copy it for each real anchor tenant and fill in real values.

When this playbook was written (bead SS-039, 2026-06-16), the team had completed 64 of 65 roadmap beads and was preparing for the first anchor tenant pilot. No real anchor tenant had been signed at the time of writing — the candidate identification happens after this playbook is reviewed and approved by the founder.

If you are the founder reading this: your next step is to identify 3 candidate D2C brands (using the profile template at §3) and add their profiles to `docs/anchor-tenant-pilots/<slug>.md`. The bead log entry for `SS-039` closes when this playbook + the dry-run script are merged; the candidate profiles are a *separate* follow-up bead (`SS-039.1` or similar) because they are a GTM action, not an engineering deliverable.
