#!/bin/env bash

# this is the script for step 'step-build-env'
# externalized into this file to prevent the action file becoming too large

# =============================================================================
#  Constants
# =============================================================================

# These fields will be set by action inputs and values from app vars will be ignored
PROTECTED_ENVS=(
  acr-password
  acr-service-principal
  app-config-repo-token
  github-repo-token
  jasypt-password
  maven-extra-envs-from-github
  pr-deploy-aks-creds
  sonarqube-token
)

# Values for these fields will be handled specifically below
#  - app-vars is used as basis for output and should not be added as separate field.
#  - helm values requires special format, see further down.
#  - docker-image-prune-* is hardcoded when running from a PR.
#  - *-json is used in this action, contains sensitive information and should not be returned
#  The rest is generated in this script and should not be added from app vars.
SPECIAL_ENVS=(
  app-vars
  application-image-id
  application-source
  application-source-revision
  caller-repo-calling-branch
  caller-repo-default-branch
  caller-repo-is-on-default-branch
  docker-image-prune-keep-min-images
  docker-image-prune-keep-num-days
  github-dependencies-cache-key
  github-dependencies-cache-restore-keys
  github-json
  maven-build-project-deploy-to-repositories-yml
  maven-extra-envs-from-github-yml
  maven-user-settings-repositories-yml
  pr-deploy-additional-helm-values
  pr-deploy-app-config-branch
  pr-deploy-k8s-application-name
  pr-deploy-k8s-namespace
  secrets-json
  vars-json
)

# These does not contain any secrets and are safe to share
# with other jobs and upload to github in a build artifact
ENVS_WITHOUT_SECRETS=(
  acr-username
  app-config-repo
  application-build-timestamp
  application-description
  application-image-id
  application-image-name
  application-name
  application-source
  application-source-path
  application-source-revision
  application-type
  application-vendor
  application-version
  caller-repo-calling-branch
  caller-repo-default-branch
  caller-repo-is-on-default-branch
  docker-image-prune-keep-min-images
  docker-image-prune-keep-num-days
  docker-image-registry
  docker-image-repo
  github-dependencies-cache-delete-on-pr-close
  github-dependencies-cache-enabled
  github-dependencies-cache-key
  github-dependencies-cache-path
  github-dependencies-cache-pr-base-key
  github-dependencies-cache-restore-keys
  java-distribution
  java-version
  maven-build-project-arguments
  maven-build-project-command
  maven-build-project-deploy-release-artifacts
  maven-build-project-deploy-release-deploy-command
  maven-build-project-deploy-release-version-command
  maven-build-project-deploy-snapshot-artifacts
  maven-build-project-deploy-snapshot-deploy-command
  maven-build-project-deploy-snapshot-version-command
  maven-build-project-deploy-to-repositories-yml
  maven-build-project-goals
  maven-build-project-version-arguments
  maven-build-project-version-command
  maven-build-project-version-goals
  nodejs-build-project-custom-command-final
  nodejs-build-project-custom-command-pre-npm-ci
  nodejs-build-project-custom-command-pre-npm-run-build
  nodejs-build-project-custom-command-pre-npm-run-lint
  nodejs-version
  pr-deploy-additional-helm-values
  pr-deploy-aks-cluster-name
  pr-deploy-aks-resource-group
  pr-deploy-app-config-branch
  pr-deploy-argo-applications-url
  pr-deploy-comment-additional-text
  pr-deploy-comment-prefix
  pr-deploy-k8s-application-name
  pr-deploy-k8s-namespace
  spring-boot-build-image-arguments
  spring-boot-build-image-command
  spring-boot-build-image-pull-images-pre-build-yml
  spring-boot-build-image-goals
  spring-boot-build-image-version-arguments
  spring-boot-build-image-version-command
  spring-boot-build-image-version-goals
  static-deploy-environments
  static-deploy-from-default-branch-only
)


# =============================================================================
#  Merge input app vars with defaults of the action
# =============================================================================

# Loop over all inputs to this action:
#  - If the field is "special", do nothing
#  - If field is protected: use value from this action inputs
#  - If field does not exist in app vars: use value from this action inputs
# This enables the possibility to override all but protected fields from app vars.
INPUT_NAMES=($(echo "${ALL_ACTION_INPUTS}" | jq -r '.|keys|.[]'))
for NAME in ${INPUT_NAMES[*]}; do
  if (is-protected "${NAME}" || ! has-field "${NAME}") && ! is-special "${NAME}"; then
    set-field "${NAME}" "$(get-input-val "${NAME}")"
  fi
done


# =============================================================================
#  App vars: pr-deploy-*
# =============================================================================

# Handle 'pr-deploy-additional-helm-values' specifically
#   app vars field is on JSON format whilst this actions input expects yml
if has-field "pr-deploy-additional-helm-values"; then
  log-info "using 'pr-deploy-additional-helm-values' from app vars."
  log-info "converting app var 'pr-deploy-additional-helm-values' from JSON to valid yaml ..."
  PRETTY_VAL=$(echo "$(get-val 'pr-deploy-additional-helm-values')" | yq --input-format json --output-format yml --prettyPrint eval -)
else
  log-info "using 'pr-deploy-additional-helm-values' from this action's input"
  log-info "validating 'pr-deploy-additional-helm-values' as valid yaml and stripping comments ..."
  PRETTY_VAL=$(echo "${PR_HELM_VALUES_YML}" | yq --input-format yml --output-format yml --prettyPrint eval '... comments=""' -)
fi
set-field "pr-deploy-additional-helm-values" "${PRETTY_VAL}"
log-multiline "resulting value of 'pr-deploy-additional-helm-values'" "$(get-val 'pr-deploy-additional-helm-values')"

# Differs depending on PR build or not, allow app vars to override
PR_KUBERNETES_NAMESPACE="$(get-val 'application-name')"
PR_KUBERNETES_APP_NAME="$(get-val 'application-name')"
if [ "${GITHUB_EVENT_NAME}" == 'pull_request' ]; then
  PR_KUBERNETES_NAMESPACE=${PR_KUBERNETES_NAMESPACE}-pr-${GH_EVENT_NUMBER}
  PR_KUBERNETES_APP_NAME=${PR_KUBERNETES_APP_NAME}-pr-${GH_EVENT_NUMBER}
fi
# Only set field if not given in app vars
if ! has-field "pr-deploy-k8s-application-name"; then
  set-field "pr-deploy-k8s-application-name" "${PR_KUBERNETES_APP_NAME}"
fi
# Only set field if not given in app vars
if ! has-field "pr-deploy-k8s-namespace"; then
  set-field "pr-deploy-k8s-namespace" "${PR_KUBERNETES_APP_NAME}"
fi


# =============================================================================
#  App vars: docker-image-prune-*
# =============================================================================

# If PR build these are hardcoded, allow app vars to override when not running from a PR
if [ "${GITHUB_EVENT_NAME}" == 'pull_request' ]; then
  set-field "docker-image-prune-keep-min-images" "5"
  set-field "docker-image-prune-keep-num-days" "0"
else
  for NAME in docker-image-prune-keep-min-images docker-image-prune-keep-num-days; do
    if ! has-field "${NAME}"; then
      set-field "${NAME}" "$(get-input-val "${NAME}")"
    fi
  done
fi


# =============================================================================
#  App vars: maven-*
# =============================================================================

# Handled specifically as app vars field is on JSON format and
# 'maven-user-settings-repositories-yml' is expected to be yaml format (as multiline string)
if has-field "maven-user-settings-repositories-yml"; then
  log-info "using 'maven-user-settings-repositories-yml' from app vars."
  REPOS_YML="$(get-val 'maven-user-settings-repositories-yml')"
else
  log-info "using 'maven-user-settings-repositories-yml' from this action's input"
  REPOS_YML="${MVN_SETTINGS_REPOS_YML}"
fi

log-info "validating app var 'maven-user-settings-repositories-yml' as yaml and stripping comments ..."
PRETTY_VAL=$(echo "${REPOS_YML}" | yq --input-format yml --output-format yml --prettyPrint eval '... comments=""' -)

log-info "injecting caller repo into 'maven-user-settings-repositories-yml' ..."
# loops over repo list and substitutes in the actual caller repo in strings
export ACTUAL_REPO="${GITHUB_REPOSITORY}"
INJECTED_VAL=$(
  echo "${PRETTY_VAL}" |
    yq --input-format yml --output-format yml eval '
              .[] |=
              .[] |=
              .[] |=
              sub("{{ github.repository }}", strenv(ACTUAL_REPO))
            '
)

set-field "maven-user-settings-repositories-yml" "${INJECTED_VAL}"
log-multiline "resulting value of 'maven-user-settings-repositories-yml'" "$(get-val 'maven-user-settings-repositories-yml')"

# 'maven-extra-envs-from-github-yml' is expected to be yaml format (as multiline string)
# and be converted to a JSON object named 'maven-extra-envs-from-github' compatible with the 'build-maven-project' action.
start-group "create 'maven-extra-envs-from-github' from 'maven-extra-envs-from-github-yml'"
if has-field "maven-extra-envs-from-github-yml"; then
  log-info "using 'maven-extra-envs-from-github-yml' from app vars."
  ENVS_YML="$(get-val 'maven-extra-envs-from-github-yml')"
else
  log-info "using 'maven-extra-envs-from-github-yml' from this action's input"
  ENVS_YML="${MVN_EXTRA_GH_ENVS_YML}"
fi
log-info "converting app var 'maven-extra-envs-from-github-yml' to json ..."
ENVS_JSON=$(echo "${ENVS_YML}" | yq --input-format yml --output-format json --prettyPrint eval -)

# 'maven-extra-envs-from-github-yml' will be converted to json as # 'maven-extra-envs-from-github'
# and populated with values from contexts in github

ENVS_POPULATED_JSON='{}' # will hold named envs with values

log-info "populating 'maven-extra-envs-from-github-yml' with values from the 'github' context ..."
ENV_NAMES=($(echo "${ENVS_JSON}" | jq -r 'select(."from-github-context" != null) | ."from-github-context" | keys | .[]'))
for ENV_NAME in ${ENV_NAMES[*]}; do
  log-info "  environment variable '${ENV_NAME}'"
  CONTEXT_FIELD=$(echo "${ENVS_JSON}" | jq -r --arg name "${ENV_NAME}" '."from-github-context" | .[$name]')
  log-info "   with value from secret '${CONTEXT_FIELD}'"
  if ! gh-context-has-field "${CONTEXT_FIELD}"; then
    log-error "A field named '${CONTEXT_FIELD}' does not exist in the current 'github' context!"
    exit 1
  fi
  set-envs-field "${ENV_NAME}" "$(gh-context-get-val ${CONTEXT_FIELD})" # modifies ENVS_POPULATED_JSON
done

log-info "populating 'maven-extra-envs-from-github-yml' from the 'secrets' context ..."
ENV_NAMES=($(echo "${ENVS_JSON}" | jq -r 'select(."from-secrets" != null) | ."from-secrets" | keys | .[]'))
for ENV_NAME in ${ENV_NAMES[*]}; do
  log-info "  environment variable '${ENV_NAME}'"
  CONTEXT_FIELD=$(echo "${ENVS_JSON}" | jq -r --arg name "${ENV_NAME}" '."from-secrets" | .[$name]')
  log-info "   with value from secret '${CONTEXT_FIELD}'"
  if ! secret-context-has-field "${CONTEXT_FIELD}"; then
    log-error "A field named '${CONTEXT_FIELD}' does not exist in the current 'secrets' context!"
    exit 1
  fi
  set-envs-field "${ENV_NAME}" "$(secret-context-get-val ${CONTEXT_FIELD})" # modifies ENVS_POPULATED_JSON
done

log-info "populating 'maven-extra-envs-from-github-yml' from the 'variables' context ..."
ENV_NAMES=($(echo "${ENVS_JSON}" | jq -r 'select(."from-variables" != null) | ."from-variables" | keys | .[]'))
for ENV_NAME in ${ENV_NAMES[*]}; do
  log-info "  environment variable '${ENV_NAME}'"
  CONTEXT_FIELD=$(echo "${ENVS_JSON}" | jq -r --arg name "${ENV_NAME}" '."from-variables" | .[$name]')
  log-info "   with value from secret '${CONTEXT_FIELD}'"
  if ! vars-context-has-field "${CONTEXT_FIELD}"; then
    log-error "A field named '${CONTEXT_FIELD}' does not exist in the current 'variables' context!"
    exit 1
  fi
  set-envs-field "${ENV_NAME}" "$(vars-context-get-val ${CONTEXT_FIELD})" # modifies ENVS_POPULATED_JSON
done

log-info "'maven-extra-envs-from-github-yml' now becomes JSON field named 'maven-extra-envs-from-github' ..."
set-field "maven-extra-envs-from-github" "${ENVS_POPULATED_JSON}"

log-info "removing 'maven-extra-envs-from-github-yml' from output ..."
rm-field "maven-extra-envs-from-github-yml"
end-group # create 'maven-extra-envs-from-github'

# Handled specifically as app vars field is on JSON format and
# 'maven-build-project-deploy-to-repositories-yml' is expected to be yaml format (as multiline string)
if has-field "maven-build-project-deploy-to-repositories-yml"; then
  log-info "using 'maven-build-project-deploy-to-repositories-yml' from app vars."
  DEPLOY_REPOS_YML="$(get-val 'maven-build-project-deploy-to-repositories-yml')"
else
  log-info "using default value for 'maven-build-project-deploy-to-repositories-yml' from this action's input"
  DEPLOY_REPOS_YML="${MVN_DEPLOY_REPOS_YML}"
fi

log-info "validating app var 'maven-build-project-deploy-to-repositories-yml' as yaml and stripping comments ..."
PRETTY_VAL=$(echo "${DEPLOY_REPOS_YML}" | yq --input-format yml --output-format yml --prettyPrint eval '... comments=""' -)

log-info "injecting caller repo into 'maven-build-project-deploy-to-repositories-yml' ..."
# loops over repo maps and substitutes in the actual caller repo
export ACTUAL_REPO="${GITHUB_REPOSITORY}"
INJECTED_VAL=$(
  echo "${PRETTY_VAL}" |
    yq --input-format yml --output-format yml eval '
              .[] |=
              .[] |=
              sub("{{ github.repository }}", strenv(ACTUAL_REPO))
            '
)

set-field "maven-build-project-deploy-to-repositories-yml" "${INJECTED_VAL}"
log-multiline "resulting value of 'maven-build-project-deploy-to-repositories-yml'" "$(get-val 'maven-build-project-deploy-to-repositories-yml')"


# =============================================================================
#  App vars: github-dependencies-*
# =============================================================================

# Handle GitHub actions cache related logic
DEPS_CACHE_ENABLED="$(get-val 'github-dependencies-cache-enabled')"
if [ ! "${DEPS_CACHE_ENABLED}" == 'true' ]; then
  log-info "Caching of dependencies using GitHub cache is not enabled."
else
  start-group "Caching of dependencies using GitHub cache is enabled. Resolving configuration ..."

  # dependencies cache type
  DEPS_CACHE_TYPE_MAVEN_APP_TYPES=(
    'spring-boot'
    'maven-library'
  )
  DEPS_CACHE_TYPE_NPM_APP_TYPES=(
    'vue'
  )
  APP_TYPE="$(get-val 'application-type')"
  if [[ " ${DEPS_CACHE_TYPE_MAVEN_APP_TYPES[*]} " =~ " ${APP_TYPE} " ]]; then
    DEPS_CACHE_TYPE='maven'
  elif [[ " ${DEPS_CACHE_TYPE_NPM_APP_TYPES[*]} " =~ " ${APP_TYPE} " ]]; then
    DEPS_CACHE_TYPE='npm'
  else
    log-error "Dependencies caching for application type '${APP_TYPE}' has not been implemented!"
    exit 1
  fi
  log-info "Application type is '${APP_TYPE}', dependencies cache type will be '${DEPS_CACHE_TYPE}'."

  if [ ! "${DEPS_CACHE_TYPE}" == 'maven' ] && [ ! "${DEPS_CACHE_TYPE}" == 'npm' ]; then
    log-error "Dependencies caching for cache type '${DEPS_CACHE_TYPE}' has not been implemented!"
    exit 1
  fi

  # dependencies cache path
  if [ '' == "$(get-val 'github-dependencies-cache-path')" ]; then
    log-info "Dependencies directory 'github-dependencies-cache-path' not configured, using defaults."
    if [ "${DEPS_CACHE_TYPE}" == 'maven' ]; then
      DEPS_CACHE_PATH='${HOME}/.m2/repository' # single quotes to avoid env expansion
    elif [ "${DEPS_CACHE_TYPE}" == 'npm' ]; then
      DEPS_CACHE_PATH='${HOME}/.npm' # single quotes to avoid env expansion
    fi
    set-field 'github-dependencies-cache-path' "${DEPS_CACHE_PATH}"
  fi
  log-info "Configured to cache dependencies from directory '$(get-val "github-dependencies-cache-path")'"

  # all this to decide file pattern for dependencies cache key
  if ! has-field 'application-source-path'; then
    log-warn "'application-source-path' not defined, using default path."
    SRC_PATH="${GITHUB_WORKSPACE}"
  else
    SRC_PATH="$(realpath ${GITHUB_WORKSPACE}/$(get-val 'application-source-path'))"
  fi
  log-info "'application-source-path' is '${SRC_PATH}'"
  if [ "${DEPS_CACHE_TYPE}" == 'maven' ]; then
    if [ -f "${SRC_PATH}" ]; then
      log-info "Cache type is '${DEPS_CACHE_TYPE}' and 'application-source-path' exists as a file, the file will be used to determine 'github-dependencies-cache-key'."
      DEPS_CACHE_PATTERN="${SRC_PATH}"
    else
      if [ -d "${SRC_PATH}" ]; then
        log-info "Cache type is '${DEPS_CACHE_TYPE}' and 'application-source-path' exists as a directory, looking for pom.xml ..."
        POM_FILE_PATH="${SRC_PATH}/pom.xml"
        if [ -f "${POM_FILE_PATH}" ]; then
          log-info "pom.xml found, using '$(ws-path "${POM_FILE_PATH}")' to determine 'github-dependencies-cache-key'."
          DEPS_CACHE_PATTERN="${POM_FILE_PATH}"
        else
          log-info "Unable to locate pom.xml, will use default file pattern for cache type '${DEPS_CACHE_TYPE}' in '$(ws-path "${SRC_PATH}")' to determine 'github-dependencies-cache-key'."
          DEPS_CACHE_PATTERN="${SRC_PATH}/**/pom.xml"
        fi
      else
        log-warn "'application-source-path' does not exist as directory or file, will use default file pattern for cache type '${DEPS_CACHE_TYPE}' in root of the repo to determine 'github-dependencies-cache-key'."
        DEPS_CACHE_PATTERN="${GITHUB_WORKSPACE}/**/pom.xml"
      fi
    fi
  elif [ "${DEPS_CACHE_TYPE}" == 'npm' ]; then
    CACHE_KEY_FILE='package-lock.json'
    if [ -d "${SRC_PATH}" ]; then
      log-info "Cache type is '${DEPS_CACHE_TYPE}' and 'application-source-path' exists as a directory, looking for ${CACHE_KEY_FILE} ..."
      LOCK_FILE_PATH="${SRC_PATH}/${CACHE_KEY_FILE}"
      if [ -f "${LOCK_FILE_PATH}" ]; then
        log-info "${CACHE_KEY_FILE} found, using '$(ws-path "${LOCK_FILE_PATH}")' to determine 'github-dependencies-cache-key'."
        DEPS_CACHE_PATTERN="${LOCK_FILE_PATH}"
      else
        log-info "Unable to locate ${CACHE_KEY_FILE}, will use default file pattern for cache type '${DEPS_CACHE_TYPE}' in '$(ws-path "${SRC_PATH}")' to determine 'github-dependencies-cache-key'."
        DEPS_CACHE_PATTERN="${SRC_PATH}/**/${CACHE_KEY_FILE}"
      fi
    else
      if [ -f "${SRC_PATH}" ]; then
        log-info "Cache type is '${DEPS_CACHE_TYPE}' and 'application-source-path' exists as a file, looking for ${CACHE_KEY_FILE} ..."
        SRC_PATH_DIR="$(dirname "${SRC_PATH}")"
        LOCK_FILE_PATH="${SRC_PATH_DIR}/${CACHE_KEY_FILE}"
        if [ -f "${LOCK_FILE_PATH}" ]; then
          log-info "${CACHE_KEY_FILE} found, using '$(ws-path "${LOCK_FILE_PATH}")' to determine 'github-dependencies-cache-key'."
          DEPS_CACHE_PATTERN="${LOCK_FILE_PATH}"
        else
          log-info "Unable to locate ${CACHE_KEY_FILE}, will use default file pattern for cache type '${DEPS_CACHE_TYPE}' in '$(ws-path "${SRC_PATH_DIR}")' to determine 'github-dependencies-cache-key'."
          DEPS_CACHE_PATTERN="${SRC_PATH_DIR}/**/${CACHE_KEY_FILE}"
        fi
      else
        log-warn "'application-source-path' does not exist as directory or file, will use default file pattern for cache type '${DEPS_CACHE_TYPE}' in root of the repo to determine 'github-dependencies-cache-key'."
        DEPS_CACHE_PATTERN="${GITHUB_WORKSPACE}/**/${CACHE_KEY_FILE}"
      fi
    fi
  fi
  log-info "File pattern '${DEPS_CACHE_PATTERN}' will be used to determine 'github-dependencies-cache-key'."

  # cache keys
  # this makes a hash of hashes, supports multiple files in case file pattern is a glob
  CACHE_KEY_HASH_FULL="$(md5sum ${DEPS_CACHE_PATTERN} | LC_ALL=C sort | md5sum)"
  CACHE_KEY_HASH=${CACHE_KEY_HASH_FULL::8}

  log-info "Fallback base cache key format is: [os]-[cache type]-[month num]-[year num]-"
  CACHE_KEY_OS="${RUNNER_OS}"
  CACHE_KEY_MONTH="$(date +%b)"
  CACHE_KEY_MINIMUM="${CACHE_KEY_OS,,}-${DEPS_CACHE_TYPE}-"
  CACHE_KEY_BASE_FALLBACK="${CACHE_KEY_MINIMUM}${CACHE_KEY_MONTH,,}-$(date +%y)-"
  log-info "Fallback base cache key is: ${CACHE_KEY_BASE_FALLBACK}"

  log-info "Base cache key format is: [os]-[cache type]-[month num]-[year num]-[hash]"
  CACHE_KEY_BASE="${CACHE_KEY_BASE_FALLBACK}${CACHE_KEY_HASH}"
  log-info "Base cache key is: ${CACHE_KEY_BASE}"

  log-info "Fallback PR cache key format: [os]-[cache type]-pr[pr number]-"
  CACHE_KEY_PR_FALLBACK="${CACHE_KEY_MINIMUM}pr${GH_EVENT_NUMBER}-"
  log-info "Fallback PR cache key is: ${CACHE_KEY_PR_FALLBACK}"

  log-info "PR cache key format: [os]-[cache type]-pr[pr number]-[hash]"
  CACHE_KEY_PR="${CACHE_KEY_PR_FALLBACK}${CACHE_KEY_HASH}"
  log-info "PR cache key is: ${CACHE_KEY_PR}"

  if [ "${GITHUB_EVENT_NAME}" == 'pull_request' ]; then
    log-info "Running from pull request event, PR cache key will be used."
    CACHE_KEY="${CACHE_KEY_PR}"
  else
    log-info "Running from non-pull request event, base cache key will be used."
    CACHE_KEY="${CACHE_KEY_BASE}"
  fi
  set-field 'github-dependencies-cache-pr-base-key' "${CACHE_KEY_PR_FALLBACK}"
  log-field 'github-dependencies-cache-pr-base-key'
  set-field 'github-dependencies-cache-key' "${CACHE_KEY}"
  log-field 'github-dependencies-cache-key'

  # determine dependencies restore keys
  if [ "${GITHUB_EVENT_NAME}" == 'pull_request' ]; then
    log-info "Running from pull request event, PR cache keys are added to cache restore keys."
    CACHE_RESTORE_KEYS="$(printf '%s\n' ${CACHE_KEY_PR} ${CACHE_KEY_PR_FALLBACK} ${CACHE_KEY_BASE} ${CACHE_KEY_BASE_FALLBACK} ${CACHE_KEY_MINIMUM})"
  else
    log-info "Not Running from pull request, PR cache keys are not added to cache restore keys."
    CACHE_RESTORE_KEYS="$(printf '%s\n' ${CACHE_KEY_BASE} ${CACHE_KEY_BASE_FALLBACK})"
  fi
  set-field 'github-dependencies-cache-restore-keys' "${CACHE_RESTORE_KEYS}"
  log-field 'github-dependencies-cache-restore-keys'

  end-group # Caching of dependencies
fi          # end dependencies enabled == true


# =============================================================================
#  Misc. app vars
# =============================================================================

# Generated fields, not possible to override from app vars
IMAGE_ID="$(get-val 'docker-image-registry')/$(get-val 'docker-image-repo')/$(get-val 'application-image-name')"
set-field "application-image-id" "${IMAGE_ID}"
set-field "pr-deploy-app-config-branch" "${CONFIG_BRANCH_REF}"
set-field "application-source" "${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}"
set-field "application-source-revision" "${GITHUB_SHA}"
set-field "caller-repo-default-branch" "${REPO_DEFAULT_BRANCH}"
set-field "caller-repo-calling-branch" "${GITHUB_REF_NAME}"
set-field "caller-repo-is-on-default-branch" "${REPO_CURRENT_BRANCH_IS_DEFAULT}"

log-info "Number of envs: $(echo ${APP_VARS_JSON} | jq 'length')"

# Separate output JSON not contain any secrets. Considered safe
# to share with other jobs and upload to github in a build artifact
ENVS_WITHOUT_SECRETS_STRING=${ENVS_WITHOUT_SECRETS[*]}
JQ_SELECT_FIELDS_FORMAT="{\"${ENVS_WITHOUT_SECRETS_STRING// /\",\"}\"}"
APP_VARS_JSON_NOT_SECRET=$(echo "${APP_VARS_JSON}" | jq "${JQ_SELECT_FIELDS_FORMAT}" | jq 'del(..|nulls)')

OUT_DIR=./_create-build-envs
OUT_JSON_FILE="${OUT_DIR}/$(get-val 'application-name').json"
log-info "$(echo "${APP_VARS_JSON_NOT_SECRET}" | jq 'length') non-secret envs will be saved to file: ${OUT_JSON_FILE}"
mkdir -p ${OUT_DIR}
log-multiline "non-secret envs JSON" "$(echo "${APP_VARS_JSON_NOT_SECRET}" | tee "${OUT_JSON_FILE}")"


# =============================================================================
#  Outputs
# =============================================================================

set-output 'json-without-secrets-path' "${OUT_JSON_FILE}"
set-output 'build-envs-artifact-name' "build-envs-$(get-val 'application-version')"

set-multiline-output 'json' "${APP_VARS_JSON}"

# =============================================================================

log-info "'$(basename ${BASH_SOURCE[0]})' executed."
