#!/bin/env bash

# Helper functions for working with JSON to output
# ================================================

# Add/overwrite fields in APP_VARS_JSON safely
function set-field { APP_VARS_JSON=$(echo "${APP_VARS_JSON}" | jq --arg name "$1" --arg value "$2" '.[$name] = $value'); }
function set-field-from-json { APP_VARS_JSON=$(echo "${APP_VARS_JSON}" | jq --arg name "$1" --argjson json_value "$2" '.[$name] = $json_value'); }

# Remove fields from APP_VARS_JSON safely
function rm-field { APP_VARS_JSON=$(echo "${APP_VARS_JSON}" | jq --arg key_name "$1" 'del(.[$key_name])'); }

# Check if field exists in APP_VARS_JSON safely
function has-field { if [[ "$(echo "${APP_VARS_JSON}" | jq --arg name "$1" 'has($name)')" == 'true' ]]; then true; else false; fi; }

# Get field value from APP_VARS_JSON safely
function get-val { echo "${APP_VARS_JSON}" | jq -r --arg name "$1" '.[$name]'; }

# Log the name and value of a field
function log-field { log-info "The value of '$1' is '$(get-val "$1")'" ; }


# Helper functions for working with the action input
# ==================================================

# Get field value from action inputs safely
function get-input-val { echo "${ALL_ACTION_INPUTS}" | jq -r --arg name "$1" '.[$name]'; }

# True if value is in array PROTECTED_ENVS
function is-protected { if [[ " ${PROTECTED_ENVS[*]} " =~ " ${1} " ]]; then true; else false; fi; }

# True if value is in array SPECIAL_ENVS
function is-special { if [[ " ${SPECIAL_ENVS[*]} " =~ " ${1} " ]]; then true; else false; fi; }


# Helper functions for working with contexts JSONs
# ================================================

function gh-context-has-field { if [[ "$(echo "${GITHUB_JSON}" | jq --arg name "$1" 'has($name)')" == 'true' ]]; then true; else false; fi; }
function gh-context-get-val { echo "${GITHUB_JSON}" | jq -r --arg name "$1" '.[$name]'; }

function secret-context-has-field { if [[ "$(echo "${SECRETS_JSON}" | jq --arg name "$1" 'has($name)')" == 'true' ]]; then true; else false; fi; }
function secret-context-get-val { echo "${SECRETS_JSON}" | jq -r --arg name "$1" '.[$name]'; }

function vars-context-has-field { if [[ "$(echo "${VARS_JSON}" | jq --arg name "$1" 'has($name)')" == 'true' ]]; then true; else false; fi; }
function vars-context-get-val { echo "${VARS_JSON}" | jq -r --arg name "$1" '.[$name]'; }


# Helper functions for JSON with named envs and their values
# ==========================================================

function set-envs-field { ENVS_POPULATED_JSON=$(echo "${ENVS_POPULATED_JSON}" | jq --arg name "$1" --arg value "$2" '.[$name] = $value') ; }


log-info "'$(basename ${BASH_SOURCE[0]})' loaded."