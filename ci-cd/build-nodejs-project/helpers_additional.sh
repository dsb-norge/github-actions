#!/bin/env bash

# Working with BUILD_ENVS variable:

# Check if field exists in BUILD_ENVS safely
function has-field { if [[ "$(echo "${BUILD_ENVS}" | jq --arg name "$1" 'has($name)')" == 'true' ]]; then true; else false; fi; }

# Get field value from BUILD_ENVS safely
function get-val { echo "${BUILD_ENVS}" | jq -r --arg name "$1" '.[$name]'; }

log-info "'$(basename ${BASH_SOURCE[0]})' loaded."
