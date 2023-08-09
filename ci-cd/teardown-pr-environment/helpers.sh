#!/bin/env bash

# Helper consts
_action_name='teardown-pr-environment'

# Helper functions
function _log { echo "${1}${_action_name}: ${2}"; }
function log-info { _log "" "${*}"; }
function log-debug { _log "DEBUG: " "${*}"; }
function log-warn { _log "WARN: " "${*}"; }
function log-error { _log "ERROR: " "${*}"; }
function start-group { echo "::group::${_action_name}: ${*}"; }
function end-group { echo "::endgroup::"; }
function log-multiline {
  start-group "${1}"
  echo "${2}"
  end-group
}
function mask-value { echo "::add-mask::${*}"; }

function helm-release-exists {
  local namespace release_name
  namespace="${1}"
  release_name="${2}"
  if (helm status --namespace "${namespace}" "${release_name}" 2>/dev/null 1>&2); then true; else false; fi
}

function k8s-namespace-exists {
  local namespace
  namespace="${1}"
  if (kubectl get namespace "${namespace}" 2>/dev/null 1>&2); then true; else false; fi
}

log-info "'$(basename ${BASH_SOURCE[0]})' loaded."
