#!/bin/env bash

function helm-release-exists {
  local namespace release_name
  namespace="${1}"
  release_name="${2}"
  if (helm status --namespace "${namespace}" "${release_name}" 2>/dev/null 1>&2); then true; else false; fi
}

function k8s-namespace-exists {
  local namespace
  namespace="${1}"
  if (kubectl get namespace "${namespace}" 2>/dev/null 1>&2); then true; else false; fi
}

log-info "'$(basename ${BASH_SOURCE[0]})' loaded."
