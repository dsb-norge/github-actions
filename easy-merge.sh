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

FILES_COUNT=$(
  gh pr view $PR_NUMBER --repo $REPO --json files --jq '.files | length'
)

if [ "$FILES_COUNT" -ne 1 ]; then
  echo "Expected exactly one file changed in the PR, but found $FILES_COUNT"
  exit 1
fi

echo "PR has exactly one changed file, as expected."

# Get the pending run ID
RUN_ID=$(
  gh api repos/$REPO/actions/runs \
    --jq '
  .workflow_runs[]
  | select(
    .conclusion=="success"
    and .status=="completed"
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
  echo "No successful run not found."
  exit 1
fi

echo "Found successful run: $RUN_ID"

gh pr ready $PR_NUMBER --repo $REPO

echo "PR marked as ready for review!"

gh pr merge $PR_NUMBER --repo $REPO --rebase --admin

echo "PR merged!"

# open url to actions in browser
URL="https://github.com/$REPO/actions"
echo "Opening $URL"
explorer.exe "$URL" || :
