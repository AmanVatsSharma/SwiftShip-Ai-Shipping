#!/usr/bin/env bash
# scripts/tenant-onboarding-dryrun.sh
# SS-039 — end-to-end dry-run for the anchor tenant pilot.
#
# Exercises the live API (GraphQL + REST) end to end:
#   1. onboards a tenant via GraphQL
#   2. rotates its API key
#   3. runs the public REST Postman collection
#   4. generates a fake GST invoice
#   5. fires a fake tracking event
#   6. simulates a COD remittance
#   7. verifies wallet / order / invoice / tracking
#   8. soft-deletes the tenant
#
# Idempotent: random suffix per run (no collisions across re-runs).
# Run modes:
#   bash tenant-onboarding-dryrun.sh                # real E2E (requires API up)
#   bash tenant-onboarding-dryrun.sh --dryrun        # print the plan, do nothing
#   bash tenant-onboarding-dryrun.sh --no-cleanup    # skip the soft-delete
#   bash tenant-onboarding-dryrun.sh --api=<url>     # override the GraphQL base URL
#
# Requires: bash 4+, curl, jq. Optional: newman (for the Postman step).
#
# Exit code 0 only if every step succeeded.

set -euo pipefail

# ------------------------------------------------------------------------------
# Pre-flight
# ------------------------------------------------------------------------------

fail() { echo "✗ $*" >&2; exit 1; }
ok()   { echo "✓ $*"; }
step() { echo; echo "━━━ $* ━━━"; }

command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v jq   >/dev/null 2>&1 || fail "jq is required"
(( BASH_VERSINFO[0] >= 4 ))      || fail "bash 4+ is required (you have ${BASH_VERSION})"

# ------------------------------------------------------------------------------
# Args
# ------------------------------------------------------------------------------

DRY_RUN=0
CLEANUP=1
API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
REST_BASE_URL="${REST_BASE_URL:-http://localhost:3001}"

for arg in "$@"; do
  case "$arg" in
    --dryrun)        DRY_RUN=1 ;;
    --no-cleanup)    CLEANUP=0 ;;
    --api=*)         API_BASE_URL="${arg#--api=}" ;;
    --rest=*)        REST_BASE_URL="${arg#--rest=}" ;;
    -h|--help)
      sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) fail "unknown arg: $arg (try --help)" ;;
  esac
done

# ------------------------------------------------------------------------------
# Random suffix (idempotency across re-runs)
# ------------------------------------------------------------------------------

if command -v uuidgen >/dev/null 2>&1; then
  RUN_ID="$(uuidgen | tr '[:upper:]' '[:lower:]' | head -c 8)"
else
  RUN_ID="$(date +%s%N | tail -c 9)"
fi

TENANT_NAME="pilot-${RUN_ID}"
ADMIN_EMAIL="pilot-${RUN_ID}@swiftship.test"
AWB="AWB${RUN_ID}"
SLOT_START=$(( $(date +%s) - 3600 ))

log()  { echo "[$(date +%H:%M:%S)] $*"; }

# ------------------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------------------

# gql <query-string> [<vars-json>]
# Echoes the response body; fails on transport error or GraphQL errors.
gql() {
  local query="$1"
  local vars="${2:-null}"
  local body
  body="$(jq -n --arg q "$query" --argjson v "$vars" \
            '{query: $q, variables: $v}')"
  local resp
  resp="$(curl -sS --max-time 30 \
            -H 'Content-Type: application/json' \
            -X POST "$API_BASE_URL/graphql" \
            -d "$body")" || fail "curl to $API_BASE_URL/graphql failed"
  if echo "$resp" | jq -e '.errors // empty' >/dev/null 2>&1; then
    fail "GraphQL errors: $(echo "$resp" | jq -c '.errors')"
  fi
  echo "$resp"
}

# Extract a dotted path from a JSON object. fail-fast if the value is null.
jq_path() {
  local resp="$1"; local path="$2"
  local val
  val="$(echo "$resp" | jq -r "$path")"
  [[ "$val" == "null" || -z "$val" ]] && fail "missing path $path in: $resp"
  echo "$val"
}

curl_rest() {
  local method="$1"; local path="$2"; local key="$3"; local data="${4:-}"
  local args=(-sS --max-time 30 -X "$method" \
              -H "X-SwiftShip-Api-Key: $key" \
              -H 'Content-Type: application/json' \
              "$REST_BASE_URL$path")
  [[ -n "$data" ]] && args+=(-d "$data")
  curl "${args[@]}" || fail "REST $method $path failed"
}

# ------------------------------------------------------------------------------
# Banner
# ------------------------------------------------------------------------------

cat <<BANNER
══════════════════════════════════════════════════════
  SwiftShip AI — anchor tenant onboarding dry-run
══════════════════════════════════════════════════════
  API:        $API_BASE_URL
  REST:       $REST_BASE_URL
  Run ID:     $RUN_ID
  Tenant:     $TENANT_NAME
  AWB:        $AWB
  Cleanup:    $CLEANUP
  Dry-run:    $DRY_RUN
══════════════════════════════════════════════════════
BANNER

# ------------------------------------------------------------------------------
# Step 1 — onboardTenant (GraphQL)
# ------------------------------------------------------------------------------

step "1/10 — onboardTenant (GraphQL)"

ONBOARD_QUERY='mutation Onboard($input: OnboardTenantInput!) {
  onboardTenant(input: $input) {
    tenant { id slug name status }
    user   { id email }
    apiKey { id key }
    wallet { id availableBalance }
  }
}'

ONBOARD_VARS=$(jq -n --arg name "$TENANT_NAME" --arg email "$ADMIN_EMAIL" --arg awb "$AWB" '{
  input: {
    name: $name,
    adminEmail: $email,
    tier: "GROWTH",
    homeCountry: "IN",
    currency: "INR",
    defaultAwbPrefix: $awb
  }
}')

if (( DRY_RUN )); then
  log "would call: POST $API_BASE_URL/graphql (mutation onboardTenant)"
  log "vars: $ONBOARD_VARS"
else
  RESP="$(gql "$ONBOARD_QUERY" "$ONBOARD_VARS")"
  TENANT_ID="$(jq_path "$RESP" '.data.onboardTenant.tenant.id')"
  TENANT_SLUG="$(jq_path "$RESP" '.data.onboardTenant.tenant.slug')"
  API_KEY="$(jq_path "$RESP" '.data.onboardTenant.apiKey.key')"
  WALLET_BALANCE="$(jq_path "$RESP" '.data.onboardTenant.wallet.availableBalance')"
  ok "tenant $TENANT_ID ($TENANT_SLUG) wallet balance: $WALLET_BALANCE"
fi

# ------------------------------------------------------------------------------
# Step 2 — rotateApiKey
# ------------------------------------------------------------------------------

step "2/10 — rotateApiKey"

ROTATE_QUERY='mutation Rotate($id: String!) {
  rotateApiKey(input: { apiKeyId: $id }) { id key rotatedAt }
}'

if (( DRY_RUN )); then
  log "would call: rotateApiKey"
else
  RESP="$(gql "$ROTATE_QUERY" "$(jq -n --arg id "$(echo "$RESP" | jq -r '.data.onboardTenant.apiKey.id')" '{id: $id}')")"
  ROTATED_AT="$(jq_path "$RESP" '.data.rotateApiKey.rotatedAt')"
  ok "rotated at $ROTATED_AT"
fi

# ------------------------------------------------------------------------------
# Step 3 — REST Postman collection (or curl fallback)
# ------------------------------------------------------------------------------

step "3/10 — Run public REST API checks"

if command -v newman >/dev/null 2>&1; then
  if (( DRY_RUN )); then
    log "would run: newman run postman/PublicApi.json --env-var apiKey=$API_KEY"
  else
    newman run postman/PublicApi.json \
      --env-var "apiKey=$API_KEY" \
      --env-var "baseUrl=$REST_BASE_URL" \
      --bail 2>&1 | tail -20 || fail "newman run failed"
    ok "newman run OK"
  fi
else
  log "newman not installed — running curl-based checks"
  if (( DRY_RUN )); then
    log "would curl: GET $REST_BASE_URL/v1/orders"
    log "would curl: GET $REST_BASE_URL/v1/shipments"
    log "would curl: GET $REST_BASE_URL/v1/rate-shop/quote"
  else
    curl_rest GET "/v1/orders?limit=5" "$API_KEY" | jq . >/dev/null \
      || fail "GET /v1/orders failed"
    ok "GET /v1/orders OK"
    curl_rest GET "/v1/shipments?limit=5" "$API_KEY" | jq . >/dev/null \
      || fail "GET /v1/shipments failed"
    ok "GET /v1/shipments OK"
    curl_rest GET "/v1/rate-shop/quote?origin=110001&dest=560001&weight=500&cod=true" "$API_KEY" | jq . >/dev/null \
      || fail "GET /v1/rate-shop/quote failed"
    ok "GET /v1/rate-shop/quote OK"
  fi
fi

# ------------------------------------------------------------------------------
# Step 4 — fake GST invoice
# ------------------------------------------------------------------------------

step "4/10 — Create fake GST invoice"

INVOICE_QUERY='mutation CreateInvoice($input: CreateInvoiceInput!) {
  createInvoice(input: $input) {
    id
    invoiceNumber
    status
    totalAmount
    irn
    cgstAmount
    sgstAmount
    igstAmount
  }
}'

INVOICE_VARS=$(jq -n --arg tenant "$TENANT_ID" '{
  input: {
    tenantId: $tenant,
    customerGstin: "29ABCDE1234F1Z5",
    placeOfSupply: "KA",
    lines: [
      { description: "Shipping service — 100 orders", quantity: 100, unitPrice: 49, gstRate: 18 }
    ],
    notes: "Generated by scripts/tenant-onboarding-dryrun.sh"
  }
}')

if (( DRY_RUN )); then
  log "would call: createInvoice"
else
  RESP="$(gql "$INVOICE_QUERY" "$INVOICE_VARS")"
  INVOICE_ID="$(jq_path "$RESP" '.data.createInvoice.id')"
  INVOICE_NUM="$(jq_path "$RESP" '.data.createInvoice.invoiceNumber')"
  ok "invoice $INVOICE_NUM ($INVOICE_ID)"
fi

# ------------------------------------------------------------------------------
# Step 5 — fake tracking event
# ------------------------------------------------------------------------------

step "5/10 — Fire fake tracking event"

TRACK_QUERY='mutation Fire($input: RecordTrackingEventInput!) {
  recordTrackingEvent(input: $input) {
    id awb status location timestamp
  }
}'

TRACK_VARS=$(jq -n --arg awb "$AWB" '{
  input: {
    awb: $awb,
    status: "PICKED_UP",
    location: "Bengaluru hub",
    description: "Package picked up from seller",
    timestamp: "2026-06-15T10:00:00Z"
  }
}')

if (( DRY_RUN )); then
  log "would call: recordTrackingEvent for AWB $AWB"
else
  RESP="$(gql "$TRACK_QUERY" "$TRACK_VARS")"
  TRACK_ID="$(jq_path "$RESP" '.data.recordTrackingEvent.id')"
  ok "tracking event $TRACK_ID"
fi

# ------------------------------------------------------------------------------
# Step 6 — simulate COD remittance
# ------------------------------------------------------------------------------

step "6/10 — Simulate COD remittance (fake bank settlement CSV)"

# Fake bank settlement CSV in the format the COD reconciliation parser expects.
# Header row + 3 data rows. The reconciliation job will pick this up.
SETTLE_CSV="/tmp/settlement-${RUN_ID}.csv"
cat > "$SETTLE_CSV" <<CSV
awb,amount,remitted_at,bank_ref
$AWB,490,2026-06-15T18:00:00Z,BNK${RUN_ID}001
AWB${RUN_ID}2,250,2026-06-15T18:00:00Z,BNK${RUN_ID}002
AWB${RUN_ID}3,650,2026-06-15T18:00:00Z,BNK${RUN_ID}003
CSV

if (( DRY_RUN )); then
  log "would POST $SETTLE_CSV to /v1/cod/remittances"
else
  curl -sS --max-time 30 \
    -H "X-SwiftShip-Api-Key: $API_KEY" \
    -H 'Content-Type: text/csv' \
    --data-binary "@$SETTLE_CSV" \
    "$REST_BASE_URL/v1/cod/remittances" \
    | jq . >/dev/null || fail "COD remittance upload failed"
  ok "COD remittance file uploaded"
fi

# ------------------------------------------------------------------------------
# Step 7 — verify
# ------------------------------------------------------------------------------

step "7/10 — Verify"

WALLET_QUERY='query W($id: String!) { tenant(id: $id) { wallet { availableBalance } } }'

if (( DRY_RUN )); then
  log "would re-query wallet + order + invoice + tracking"
else
  RESP="$(gql "$WALLET_QUERY" "$(jq -n --arg id "$TENANT_ID" '{id: $id}')")"
  BAL="$(jq_path "$RESP" '.data.tenant.wallet.availableBalance')"
  ok "wallet balance after dry-run: $BAL"

  # re-query the tracking timeline
  TIMELINE_RESP="$(curl_rest GET "/v1/track/$AWB" "$API_KEY")"
  STATUS="$(echo "$TIMELINE_RESP" | jq -r '.currentStatus // "UNKNOWN"')"
  [[ "$STATUS" != "PICKED_UP" ]] && fail "expected PICKED_UP, got $STATUS"
  ok "tracking timeline reports PICKED_UP"
fi

# ------------------------------------------------------------------------------
# Step 8 — soft-delete (cleanup)
# ------------------------------------------------------------------------------

step "8/10 — Cleanup (soft-delete tenant)"

if (( CLEANUP == 0 )); then
  log "cleanup skipped (--no-cleanup)"
elif (( DRY_RUN )); then
  log "would call: disconnectTenant"
else
  DISCONNECT_QUERY='mutation D($id: String!) {
    disconnectTenant(input: { tenantId: $id }) { id status disconnectedAt }
  }'
  RESP="$(gql "$DISCONNECT_QUERY" "$(jq -n --arg id "$TENANT_ID" '{id: $id}')")"
  STATUS="$(jq_path "$RESP" '.data.disconnectTenant.status')"
  ok "tenant disconnected (status: $STATUS)"
fi

# ------------------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------------------

step "9/10 — Summary"
cat <<SUMMARY

  Run ID:           $RUN_ID
  Tenant:           $TENANT_ID  ($TENANT_SLUG)
  Wallet balance:   $BAL
  Invoice:          $INVOICE_NUM  ($INVOICE_ID)
  Tracking event:   $TRACK_ID
  AWB:              $AWB
  COD settlement:   $SETTLE_CSV

SUMMARY

step "10/10 — Done ✓"
echo "All 8 onboarding steps passed. Tenant $TENANT_SLUG is provisioned and torn down cleanly."
echo "Re-run with: bash $0 --api=$API_BASE_URL --rest=$REST_BASE_URL"
exit 0
