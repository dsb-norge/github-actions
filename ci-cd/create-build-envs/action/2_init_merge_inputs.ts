import { core } from 'common/deps.ts'
import { PROTECTED_ENVS } from './constants.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'
import { getActionInput, logMultiline, readContextFromFile, tryParseJson } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'

/**
 * Initializes and merges workflow inputs into a unified application variables object (`AppVars`).
 *
 * This function performs these key steps:
 *   1. Retrieves configuration inputs using `core.getInput` from the GitHub Actions workflow.
 *   2. Reads extra context files (e.g., secrets, GitHub, and vars contexts) to supplement the inputs.
 *   3. Masks sensitive inputs (as defined by `PROTECTED_ENVS`) so that secrets are not logged.
 *   4. Merges the retrieved inputs into an existing `AppVars` object (parsed from a JSON string):
 *        - For each key, if there’s no existing value or it is null/undefined/empty, the input is used.
 *        - For keys marked as protected, any non-empty input overrides the current value.
 *        - Otherwise, if a non-protected key already has a valid value in `AppVars`, it is preserved.
 *   5. Serializes the updated `AppVars` back to JSON and sets it as the workflow output.
 *
 * This advanced merging ensures that manual inputs (especially for protected keys) always take precedence,
 * while preserving previously set configuration for non-protected keys.
 *
 * @returns {Promise<void>} A promise that resolves when inputs are fully merged and output as `APPVARS`.
 */
export async function run() {
  try {
    core.startGroup('initialize and merge inputs')

    // --- Get REGULAR Inputs using core.getInput ---
    const inputs = {
      appVarsJsonString: getActionInput('app-vars', true),
      'pr-deploy-additional-helm-values': getActionInput('pr-deploy-additional-helm-values'),
      'maven-user-settings-repositories-yml': getActionInput('maven-user-settings-repositories-yml'),
      'maven-extra-envs-from-github-yml': getActionInput('maven-extra-envs-from-github-yml'),
      'maven-build-project-deploy-to-repositories-yml': getActionInput('maven-build-project-deploy-to-repositories-yml'),
      'application-name': getActionInput('application-name'),
      'application-version': getActionInput('application-version'),
      'application-type': getActionInput('application-type'),
      'application-source-path': getActionInput('application-source-path'),
      'application-vendor': getActionInput('application-vendor'),
      'docker-image-registry': getActionInput('docker-image-registry'),
      'docker-image-repo': getActionInput('docker-image-repo'),
      'application-image-name': getActionInput('application-image-name'),
      'docker-image-prune-keep-min-images': getActionInput('docker-image-prune-keep-min-images'),
      'docker-image-prune-keep-num-days': getActionInput('docker-image-prune-keep-num-days'),
      'acr-username': getActionInput('acr-username'),
      'acr-password': getActionInput('acr-password'),
      'acr-service-principal': getActionInput('acr-service-principal'),
      'sonarqube-token': getActionInput('sonarqube-token'),
      'jasypt-password': getActionInput('jasypt-password'),
      'java-version': getActionInput('java-version'),
      'java-distribution': getActionInput('java-distribution'),
      'nodejs-version': getActionInput('nodejs-version'),
      'github-repo-token': getActionInput('github-repo-token'),
      'npmjs-token': getActionInput('npmjs-token'),
      'app-config-repo': getActionInput('app-config-repo'),
      'app-config-repo-token': getActionInput('app-config-repo-token'),
      'static-deploy-environments': getActionInput('static-deploy-environments'),
      'static-deploy-from-default-branch-only': getActionInput('static-deploy-from-default-branch-only'),
      'pr-deploy-app-config-branch': getActionInput('config-branch-ref'),
      'pr-deploy-aks-cluster-name': getActionInput('pr-deploy-aks-cluster-name'),
      'pr-deploy-aks-resource-group': getActionInput('pr-deploy-aks-resource-group'),
      'pr-deploy-aks-creds-tenant-id': getActionInput('pr-deploy-aks-creds-tenant-id'),
      'pr-deploy-aks-creds-subscription-id': getActionInput('pr-deploy-aks-creds-subscription-id'),
      'pr-deploy-aks-creds-service-principal-id': getActionInput('pr-deploy-aks-creds-service-principal-id'),
      'pr-deploy-argo-applications-url': getActionInput('pr-deploy-argo-applications-url'),
      'pr-deploy-comment-prefix': getActionInput('pr-deploy-comment-prefix'),
      'github-dependencies-cache-enabled': getActionInput('github-dependencies-cache-enabled'),
      'github-dependencies-cache-delete-on-pr-close': getActionInput('github-dependencies-cache-delete-on-pr-close'),
      'github-dependencies-cache-path': getActionInput('github-dependencies-cache-path'),
      'config-branch-ref': getActionInput('config-branch-ref'),
    }

    // --- Read Context Files (only needed for debug/masking here) ---
    const secretsContext = await readContextFromFile<Record<string, string>>('SECRETS_CONTEXT_FILE') ?? {}

    // Mask secrets from inputs and context file
    Object.entries(inputs).forEach(([key, value]) => {
      if (PROTECTED_ENVS.has(key) && value) core.setSecret(value)
    })
    Object.values(secretsContext).forEach((value) => {
      if (value) core.setSecret(value)
    })

    // --- Debug Logging ---
    if (core.isDebug()) {
      const varsContext = await readContextFromFile<Record<string, string>>('VARS_CONTEXT_FILE') ?? {}
      logMultiline('Input: app-vars (JSON string)', inputs.appVarsJsonString, true)
      core.debug(`Secrets Context Keys: ${Object.keys(secretsContext).join(', ')}`)
      core.debug(`Vars Context Keys: ${Object.keys(varsContext).join(', ')}`)
      logMultiline('Input: pr-deploy-additional-helm-values (YAML string)', inputs['pr-deploy-additional-helm-values'], true)
      logMultiline('Input: maven-extra-envs-from-github-yml (YAML string)', inputs['maven-extra-envs-from-github-yml'], true)
      logMultiline('Input: maven-build-project-deploy-to-repositories-yml (YAML string)', inputs['maven-build-project-deploy-to-repositories-yml'], true)
    }

    // --- Initialize and Merge ---
    const appVars: AppVars | null = tryParseJson<AppVars>(inputs.appVarsJsonString)
    if (!appVars) {
      throw new Error('Failed to parse app-vars JSON string.')
    }
    core.info('Merging action inputs into AppVars...')
    for (const [inputKey, inputValue] of Object.entries(inputs)) {
      // Skip the base app-vars string itself
      if (inputKey === 'appVarsJsonString') continue
      let useInputValue = false
      const existingValue = appVars[inputKey]
      const keyExists = Object.hasOwn(appVars, inputKey) // More robust check than 'in'

      if (PROTECTED_ENVS.has(inputKey)) {
        // Use non-empty protected input value
        if (inputValue) {
          useInputValue = true
          core.info(`Using protected input value for: ${inputKey} (App var value ignored)`)
        } else {
          core.debug(`Protected input ${inputKey} is empty, keeping potential app var value.`)
        }
      } else if (!keyExists || existingValue === null || existingValue === undefined || existingValue === '') {
        // Use non-empty input value if key is missing OR existing value is null/undefined/empty string
        if (inputValue) { // Check if the input value itself is non-empty
          useInputValue = true
          if (!keyExists) {
            core.info(`Using input value for missing app var: ${inputKey}`)
          } else {
            core.info(`Using input value for null/undefined/empty app var: ${inputKey}`)
          }
        } else {
          core.debug(`Input value for ${inputKey} is empty, not merging.`)
        }
      } else {
        // App var exists, is not protected, and has a non-empty value. Keep it.
        core.debug(`App var already exists for: ${inputKey} with non-empty value, keeping app var value.`)
      }

      if (useInputValue && inputValue !== undefined && inputValue !== null) {
        appVars[inputKey] = inputValue
        core.debug(`Set appVars['${inputKey}'] from action input.`)
      }
    }
    core.info('Input merge complete.')

    // --- Output ---
    const finalAppVarsJsonString = JSON.stringify(appVars)
    core.setOutput('APPVARS', finalAppVarsJsonString)

    core.endGroup()
  } catch (error) {
    handleError(error, 'initialize and merge inputs')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
