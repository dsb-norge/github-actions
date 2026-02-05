# v4 Reusable Workflows Migration Plan

## Overview
This document maps all repositories and workflow files that use the following reusable workflows from `dsb-norge/github-actions`:
- `ci-cd-default.yml` (various versions: v2, v3, etc.)
- `ci-cd-build-deploy-maven-lib.yml` (various versions: v2, v3, etc.)

The goal is to track where these workflows are called from and plan the rollout of version `v4`.

---

## Data Collection Status

✅ **Complete Map Generated** - Using GitHub CLI (bypassed API rate limits)

### Summary Statistics
- **Total Workflow Usages Found**: 73 repositories (all in dsb-norge organization)
- **Repositories with ci-cd-default.yml**: 49 repositories
- **Repositories with ci-cd-build-deploy-maven-lib.yml**: 24 repositories
- **Version Distribution**:
  - `@v2`: 42 repositories (21 ci-cd-default + 21 ci-cd-build-deploy-maven-lib)
  - `@v3`: 30 repositories (27 ci-cd-default + 3 ci-cd-build-deploy-maven-lib)
  - `@v4`: 1 repository (test-application - reference implementation)

### Scan Method Used
**GitHub CLI with repository enumeration and exact pattern matching** - This bypasses the strict code search API rate limits (60/hour):
```bash
# For each repository in dsb-norge and dsb-infra organizations:
# 1. List all .github/workflows files
# 2. Download each workflow file
# 3. Search for EXACT patterns:
#    - dsb-norge/github-actions/.github/workflows/ci-cd-default.yml@v
#    - dsb-norge/github-actions/.github/workflows/ci-cd-build-deploy-maven-lib.yml@v
# 4. Extract version information
```

**Important**: The scan uses exact full path matching to avoid false positives from similar workflows in other repositories (e.g., `dsb-norge/github-actions-terraform`).

---

## dsb-norge Organization (73 Repositories)

### Application Repositories - ci-cd-default.yml (v2) - 21 repos
- dsb-norge/ad-client
- dsb-norge/ad-sync
- dsb-norge/albin
- dsb-norge/altinn-forms
- dsb-norge/altinnws
- dsb-norge/brreg
- dsb-norge/citizen-service
- dsb-norge/data-collectors
- dsb-norge/dfo-api
- dsb-norge/dle-reporting
- dsb-norge/driftstatus
- dsb-norge/map-api
- dsb-norge/mockoidc
- dsb-norge/plis-api-gateway
- dsb-norge/plis-dsa
- dsb-norge/plis-fpvs
- dsb-norge/rayvn
- dsb-norge/remedy-hack
- dsb-norge/saksbehandler
- dsb-norge/sb-status-server
- dsb-norge/sms

### Application Repositories - ci-cd-default.yml (v3) - 27 repos
- dsb-norge/brannstatistikk
- dsb-norge/bris
- dsb-norge/cert
- dsb-norge/cloud-monitor
- dsb-norge/dleportalen
- dsb-norge/docgen
- dsb-norge/dsb-data-api
- dsb-norge/eksternbrukeradmin
- dsb-norge/eksplosiv-org
- dsb-norge/elements-service
- dsb-norge/elreg
- dsb-norge/elvis
- dsb-norge/email
- dsb-norge/emma
- dsb-norge/farliggods
- dsb-norge/fast
- dsb-norge/filesharing
- dsb-norge/helpdesk-tools
- dsb-norge/interview-task
- dsb-norge/milo
- dsb-norge/nlfp
- dsb-norge/profapp
- dsb-norge/saft
- dsb-norge/sambas
- dsb-norge/sambas-indexer
- dsb-norge/teams
- dsb-norge/tofi

### Library Repositories - ci-cd-build-deploy-maven-lib.yml (v2) - 21 repos
- dsb-norge/brreg-library
- dsb-norge/common-brann
- dsb-norge/dsb-kotlin-extensions
- dsb-norge/dsb-saga-pattern
- dsb-norge/dsb-spring-boot-starter-appinfo
- dsb-norge/dsb-spring-boot-starter-feedback
- dsb-norge/dsb-spring-boot-starter-feedback-reactive
- dsb-norge/dsb-spring-boot-starter-prometheus
- dsb-norge/dsb-test-harness
- dsb-norge/keycloak-citizen-plugin
- dsb-norge/keycloak-db-userprovider
- dsb-norge/keycloak-dsb-theme
- dsb-norge/keycloak-eksternbruker-plugin
- dsb-norge/keycloak-event-logger
- dsb-norge/keycloak-friendly-captcha
- dsb-norge/keycloak-hostname-provider
- dsb-norge/keycloak-monitoring
- dsb-norge/keycloak-sql-driver
- dsb-norge/matrikkelapi
- dsb-norge/sambas-dto-library
- dsb-norge/ws-proxy

### Library Repositories - ci-cd-build-deploy-maven-lib.yml (v3) - 3 repos
- dsb-norge/dsb-job-execution
- dsb-norge/keycloak-app-info
- dsb-norge/keycloak-email-provider

### Already on v4 - 1 repo
- dsb-norge/test-application (reference implementation)

---

## Search Approach - Successful Method

### ✅ GitHub CLI Enumeration (Successfully Used)
The most reliable method that successfully bypassed rate limits:

```bash
#!/bin/bash
# For each organization (dsb-norge, dsb-infra):
# 1. List all repositories: gh repo list ORG --limit 1000
# 2. For each repo, get .github/workflows files via GitHub API
# 3. Download and parse each workflow file
# 4. Extract version information from workflow uses statements
# 5. Build comprehensive mapping
```

**Advantages**:
- ✅ No rate limiting issues
- ✅ Accurate version detection
- ✅ Works with large numbers of repositories (187 in dsb-norge, many in dsb-infra)
- ✅ Provides complete, structured output
- ✅ Can be parallelized with limited processes

### ⚠️ GitHub Code Search API (Did NOT use)
Encountered strict rate limiting (60 requests/hour) with the search endpoints:
```
- dsb-norge/github-actions/.github/workflows/ci-cd-build-deploy-maven-lib.yml@v
- dsb-norge/github-actions/.github/workflows/ci-cd-default.yml@v
```

---

## Migration Strategy by Version

### Single Phase: Direct Migration to v4 (72 repositories)
All repositories are migrated directly to v4 in one phase, regardless of current version (v2 or v3):
- **ci-cd-default.yml v2 → v4**: 21 application repositories
- **ci-cd-build-deploy-maven-lib.yml v2 → v4**: 21 library repositories
- **ci-cd-default.yml v3 → v4**: 27 application repositories
- **ci-cd-build-deploy-maven-lib.yml v3 → v4**: 3 library repositories
- **Already on v4**: 1 repository (dsb-norge/test-application - reference implementation)

### Breaking Change in v4
v3 has no breaking changes, but v4 introduces one **required change**:

All jobs referencing either `ci-cd-default.yml` or `ci-cd-build-deploy-maven-lib.yml` must add:
```yaml
permissions: write-all # allow all, ok since we trust our own workflow
```

**Migration Example** (from test-application, already migrated):
```yaml
jobs:
  ci-cd:
    # TODO revert to @v4
    uses: dsb-norge/github-actions/.github/workflows/ci-cd-default.yml@v4
    secrets: inherit # pass all secrets, ok since we trust our own workflow
    permissions: write-all # allow all, ok since we trust our own workflow
    with:
      # ... existing with values ...
```

This pattern applies to both `ci-cd-default.yml` and `ci-cd-build-deploy-maven-lib.yml` workflows.

---

## Migration Checklist

- [x] Collect complete list of all files using the workflows (73 repositories found)
- [x] Categorize by workflow type (ci-cd-default vs ci-cd-build-deploy-maven-lib)
- [x] Categorize by current version (v2, v3, v4)
- [x] Document v4 breaking change (permissions: write-all requirement)
- [ ] Test v4 workflows in staging repositories from both v2 and v3
- [ ] Execute single-phase migration to v4:
  - [ ] Migrate v2 repositories (42 repos)
  - [ ] Migrate v3 repositories (30 repos)
- [ ] Track migration progress per repository
- [ ] Validate all workflows work correctly with v4

---

## Implementation Notes

### GitHub CLI Method (Recommended for Future Updates)
The successful approach used to collect this data:
```bash
# Reusable script for future updates
#!/bin/bash
for ORG in dsb-norge dsb-infra; do
  repos=$(gh repo list "$ORG" --limit 1000 --json nameWithOwner -q '.[].nameWithOwner')
  for repo in $repos; do
    # Parallel processing with controlled concurrency
    search_workflows "$repo" &
    if (( $(jobs -r -p | wc -l) >= 4 )); then wait -n; fi
  done
  wait
done
```

### Rate Limiting Workaround
- **Avoid**: GitHub Code Search API (60 requests/hour limit)
- **Use**: GitHub CLI with gh api (no strict rate limits, better handling)
- **Benefit**: Enumeration-based search is more reliable and faster

---

## Notes

- ✅ Complete mapping achieved using GitHub CLI with exact pattern matching
- ✅ 73 repositories identified (all in dsb-norge organization)
- ✅ All false positives removed (terraform workflows in dsb-infra use different workflow repository)
- Data collected on: February 5, 2026
- This document serves as the specification for v4 migration rollout
- Revisit this mapping quarterly to track adoption progress

