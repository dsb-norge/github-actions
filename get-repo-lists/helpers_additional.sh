#!/bin/env bash

# common part of all output jq filters
function get-jq-filter {
  local additionalFilter
  additionalFilter="${1}"
  cat <<EOF
  .repos
  | map(select(
    ${additionalFilter}
  )) as \$repos
  | {
    "repos": ( \$repos | map(.nameWithOwner) | sort ),
    "totalRepoCount": ( \$repos | length ),
    "totalPackageCount": ( \$repos | map(.packageCount) | add )
  }
EOF
}

log-info "'$(basename ${BASH_SOURCE[0]})' loaded."
