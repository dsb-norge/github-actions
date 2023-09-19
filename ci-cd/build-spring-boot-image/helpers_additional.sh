#!/bin/env bash

# Helper functions for working with dsb build envs JSON
# =====================================================

# Check if field exists in BUILD_ENVS safely
function has-field { if [[ "$(echo "${BUILD_ENVS}" | jq --arg name "$1" 'has($name)')" == 'true' ]]; then true; else false; fi; }

# Get field value from BUILD_ENVS safely
function get-val { echo "${BUILD_ENVS}" | jq -r --arg name "$1" '.[$name]'; }

# Add/overwrite fields in BUILD_ENVS safely
function set-field { BUILD_ENVS=$(echo "${BUILD_ENVS}" | jq --arg name "$1" --arg value "$2" '.[$name] = $value'); }

# Helper functions for working with JSON output
# =====================================================

# Use jq to ensure valid JSON
function set-val { OUT_JSON="$(echo "${OUT_JSON}" | jq --arg name "${1}" --arg value "${2}" '.[$name] = $value')"; }

# =====================================================
log-info "'$(basename ${BASH_SOURCE[0]})' loaded."
