#!/bin/env bash

# Helper functions
function _jq { echo "${OBJ}" | base64 --decode | jq -r "${*}"; }
function get-val { echo "${JSON_OBJ}" | jq -r --arg name "${1}" '.[$name]'; }

log-info "'$(basename ${BASH_SOURCE[0]})' loaded."
