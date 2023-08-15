#!/bin/env bash

# working with JSON array input
function get-first-val { echo "${JSON_ARRAY}" | jq -r --arg name "${1}" '. | map(.[$name] | select( . != null ))  | first // empty'; }

log-info "'$(basename ${BASH_SOURCE[0]})' loaded."
