#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Repository list from WORKFLOW_MIGRATION_PLAN_v4.md (lines 42-120)
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
dsb-norge/rayvn
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
dsb-norge/keycloak-db-userprovider
dsb-norge/keycloak-dsb-theme
dsb-norge/keycloak-eksternbruker-plugin
dsb-norge/keycloak-event-logger
dsb-norge/keycloak-friendly-captcha
dsb-norge/keycloak-hostname-provider
dsb-norge/keycloak-monitoring
dsb-norge/keycloak-sql-driver
dsb-norge/matrikkelapi
dsb-norge/sambas-dto-library
dsb-norge/ws-proxy
dsb-norge/dsb-job-execution
dsb-norge/keycloak-app-info
dsb-norge/keycloak-email-provider"

echo "Filtering out archived repositories..." >&2
echo "" >&2

for repo in $REPOS; do
  # Check if repository is archived
  is_archived=$(gh repo view "$repo" --json isArchived -q .isArchived 2>/dev/null || echo "error")

  if [ "$is_archived" = "error" ]; then
    echo "WARNING: Could not check $repo (might not exist or no access)" >&2
  elif [ "$is_archived" = "false" ]; then
    echo "$repo"
  else
    echo "SKIPPED: $repo (archived)" >&2
  fi
done
