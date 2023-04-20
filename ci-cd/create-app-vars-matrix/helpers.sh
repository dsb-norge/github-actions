#!/bin/env bash

# Helper consts
_action_name='create-app-vars-matrix'

# Helper functions
function _log { echo "${1}${_action_name}: ${2}"; }
function log-info { _log "" "${*}"; }
function log-warn { _log "WARN: " "${*}"; }
function log-error { _log "ERROR: " "${*}"; }
function start-group { echo "::group::${_action_name}: ${*}"; }
function end-group { echo "::endgroup::"; }
function log-json {
  start-group "${1}"
  echo "${2}"
  end-group
}
function _jq { echo ${APP_VARS} | base64 --decode | jq -r ${*}; }
function has-field { if [[ "$(echo "${OUT_OBJ}" | jq --arg name "${1}" 'has($name)')" == 'true' ]]; then true; else false; fi; }
function get-val { echo "${OUT_OBJ}" | jq -r --arg name "${1}" '.[$name] | select( . != null )'; }
function set-val { OUT_OBJ="$(echo "${OUT_OBJ}" | jq --arg name "${1}" --arg value "${2}" '.[$name] = $value')"; }
function add-to-all { IN_JSON="$(echo "${IN_JSON}" | jq --arg name "${1}" --arg value "${2}" '.[] += {($name): $value}')"; }
function fail-field {
  DO_EXIT=1
  echo "::group::ERROR: ${_action_name}: ${1}"
  echo "$(_jq '.')"
  echo "::endgroup::"
}

log-info "'helpers.sh' loaded."
