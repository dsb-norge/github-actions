#!/bin/env bash

# Helper functions
function _jq { echo "${OBJ}" | base64 --decode | jq -r "${*}"; }
function has-field { if [[ "$(echo "${JSON_OBJ}" | jq --arg name "${1}" 'has($name)')" == 'true' ]]; then true; else false; fi; }
function get-val { echo "${JSON_OBJ}" | jq -r --arg name "${1}" '.[$name] | select( . != null )'; }

log-info "'$(basename ${BASH_SOURCE[0]})' loaded."
