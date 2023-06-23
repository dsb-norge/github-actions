#!/bin/env bash

# Helper consts
_action_name='prune-maven-artifacts-in-repo'

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
function set-output { echo "${1}=${2}" >> $GITHUB_OUTPUT; }

# working with JSON array input
function get-first-val { echo "${JSON_ARRAY}" | jq -r --arg name "${1}" '. | map(.[$name] | select( . != null ))  | first // empty'; }


log-info "'$(basename ${BASH_SOURCE[0]})' loaded."
