#!/bin/env bash

# working with JSON structures
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

log-info "'$(basename ${BASH_SOURCE[0]})' loaded."
