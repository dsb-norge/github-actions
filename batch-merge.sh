#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUCCESSFUL_FILE="$SCRIPT_DIR/successful-merges.txt"
FAILED_FILE="$SCRIPT_DIR/failed-merges.txt"

# Initialize tracking files if they don't exist
touch "$SUCCESSFUL_FILE"
touch "$FAILED_FILE"

# Repository list (same as batch-migrate.sh)
# Extracted on 2026-02-05
REPOS="dsb-norge/data-collectors
dsb-norge/dfo-api
dsb-norge/dle-reporting
dsb-norge/driftstatus
dsb-norge/map-api
dsb-norge/mockoidc
dsb-norge/plis-api-gateway
dsb-norge/plis-dsa
dsb-norge/plis-fpvs
dsb-norge/remedy-hack
dsb-norge/saksbehandler
dsb-norge/sb-status-server
dsb-norge/sms
dsb-norge/brannstatistikk
dsb-norge/bris
dsb-norge/cert
dsb-norge/cloud-monitor
dsb-norge/dleportalen
dsb-norge/docgen
dsb-norge/dsb-data-api
dsb-norge/eksternbrukeradmin
dsb-norge/eksplosiv-org
dsb-norge/elements-service
dsb-norge/elreg
dsb-norge/elvis
dsb-norge/email
dsb-norge/emma
dsb-norge/farliggods
dsb-norge/fast
dsb-norge/filesharing
dsb-norge/helpdesk-tools
dsb-norge/interview-task
dsb-norge/milo
dsb-norge/nlfp
dsb-norge/profapp
dsb-norge/saft
dsb-norge/sambas
dsb-norge/sambas-indexer
dsb-norge/teams
dsb-norge/tofi
dsb-norge/brreg-library
dsb-norge/common-brann
dsb-norge/dsb-kotlin-extensions
dsb-norge/dsb-saga-pattern
dsb-norge/dsb-spring-boot-starter-appinfo
dsb-norge/dsb-spring-boot-starter-feedback
dsb-norge/dsb-spring-boot-starter-feedback-reactive
dsb-norge/dsb-spring-boot-starter-prometheus
dsb-norge/dsb-test-harness
dsb-norge/keycloak-citizen-plugin
dsb-norge/keycloak-dsb-theme
dsb-norge/keycloak-eksternbruker-plugin
dsb-norge/keycloak-event-logger
dsb-norge/keycloak-friendly-captcha
dsb-norge/keycloak-hostname-provider
dsb-norge/keycloak-sql-driver
dsb-norge/matrikkelapi
dsb-norge/sambas-dto-library
dsb-norge/ws-proxy
dsb-norge/dsb-job-execution
dsb-norge/keycloak-app-info
dsb-norge/keycloak-email-provider"

echo "=== PR Merge Batch Runner ==="
echo "Total repositories to process: $(echo "$REPOS" | wc -l)"
echo "Already successful: $(wc -l <"$SUCCESSFUL_FILE")"
echo "Previously failed: $(wc -l <"$FAILED_FILE")"
echo ""

processed=0
skipped=0
failed=0
succeeded=0

for repo in $REPOS; do
  processed=$((processed + 1))

  # Check if already successfully processed
  if grep -Fxq "$repo" "$SUCCESSFUL_FILE" 2>/dev/null; then
    echo "[$processed] SKIP: $repo (already merged)"
    skipped=$((skipped + 1))
    continue
  fi

  echo "[$processed] Processing: $repo"

  # Run the merge script
  if REPO="$repo" "$SCRIPT_DIR/easy-merge.sh"; then
    echo "[$processed] SUCCESS: $repo"
    echo "$repo" >>"$SUCCESSFUL_FILE"
    succeeded=$((succeeded + 1))
  else
    echo "[$processed] FAILED: $repo (exit code: $?)"
    # Remove from failed file if it exists (to avoid duplicates)
    grep -Fxv "$repo" "$FAILED_FILE" >"$FAILED_FILE.tmp" 2>/dev/null || true
    mv "$FAILED_FILE.tmp" "$FAILED_FILE" 2>/dev/null || true
    # Add to failed file with timestamp
    echo "$repo # $(date -Iseconds)" >>"$FAILED_FILE"
    failed=$((failed + 1))
  fi

  echo ""

  # Optional: Add a small delay between repos to avoid rate limiting
  sleep 2
done

echo "=== Merge Summary ==="
echo "Total processed: $processed"
echo "Skipped (already done): $skipped"
echo "Newly succeeded: $succeeded"
echo "Failed: $failed"
echo ""
echo "See $SUCCESSFUL_FILE for successful merges"
echo "See $FAILED_FILE for failed merges"

if [ $failed -gt 0 ]; then
  echo ""
  echo "Failed repositories:"
  cat "$FAILED_FILE"
  exit 1
fi
