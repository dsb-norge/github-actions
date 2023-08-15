#!/bin/env bash

# Helper functions for working with dsb build envs JSONs
# ======================================================

# Check if field exists in BUILD_ENVS safely
function has-field { if [[ "$(echo "${BUILD_ENVS}" | jq --arg name "$1" 'has($name)')" == 'true' ]]; then true; else false; fi; }

# Get field value from BUILD_ENVS safely
function get-val { echo "${BUILD_ENVS}" | jq -r --arg name "$1" '.[$name]'; }

# Helper functions for working with dsb build envs JSONs
# ======================================================

function export-extra-envs {
  _extra-envs 'export' "$@"
}
function unset-extra-envs {
  _extra-envs 'unset' "$@"
}
function _extra-envs {
  local op="${1}"
  local envs_name="${2}"
  local envs_json="${3}"
  local env_names env_name env_value

  if [ "${op}" == "export" ]; then
    if [ -z "${envs_json}" ]; then
      log-info "No '${envs_name}' extra environment variables to export."
    else
      start-group "'${envs_name}' extra environment variables exported"
      env_names=$(echo ${envs_json} | jq -r '[keys[]] | join(" ")')
      for env_name in ${env_names}; do
        env_value=$(echo ${envs_json} | jq -r ".${env_name}")
        echo " - '${env_name}' with value length ${#env_value}"
        export "${env_name}"="${env_value}"
      done
      end-group
    fi
  fi
  if [ "${op}" == "unset" ] && [ ! -z "${envs_json}" ]; then
    log-info "Removing '${envs_name}' extra environment variables ..."
    for env_name in ${env_names}; do
      unset "${env_name}"
    done
  fi
}

log-info "'$(basename ${BASH_SOURCE[0]})' loaded."
