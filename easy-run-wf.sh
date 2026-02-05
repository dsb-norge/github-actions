#!/bin/bash
set -euo pipefail

PR_NUMBER=$(
  gh pr list \
    --repo $REPO \
    --search "Upgrade CI/CD workflow to v4" \
    --json number \
    --jq '.[0].number'
)

if [ -z "$PR_NUMBER" ]; then
  echo "PR 'Upgrade CI/CD workflow to v4' not found"
  exit 1
fi

echo "Found PR: $PR_NUMBER"

# Get the pending run ID
RUN_ID=$(
  gh api repos/$REPO/actions/runs \
    --jq '
  .workflow_runs[]
  | select(
    .conclusion=="action_required"
    and .pull_requests[0].number == '$PR_NUMBER'
    and (
      .referenced_workflows[0].path == "dsb-norge/github-actions/.github/workflows/ci-cd-default.yml@v4"
      or .referenced_workflows[0].path == "dsb-norge/github-actions/.github/workflows/ci-cd-build-deploy-maven-lib.yml@v4"
    )
  )
  | .id' |
    head -n 1
)

if [ -z "$RUN_ID" ]; then
  echo "No pending workflows found"
  exit 1
fi

echo "Found pending run: $RUN_ID"

gh api --method POST /repos/$REPO/actions/runs/$RUN_ID/rerun

echo "Workflow triggered!"
