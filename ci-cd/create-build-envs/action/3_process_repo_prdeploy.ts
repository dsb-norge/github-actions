import { core, github } from 'common/deps.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'
import { getActionInput, logMultiline, stringifyYaml, tryParseJson, tryParseYaml } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'

/**
 * Processes repository and PR deployment variables.
 *
 * This function performs several critical steps:
 *   - Retrieves and parses the existing `APPVARS` configuration.
 *   - Determines the default branch from either the GitHub context or environment variables, then checks if the current branch is the default.
 *   - Merges this branch information into `AppVars` (to be used later for PR deployment decisions).
 *   - Processes the `pr-deploy-additional-helm-values` input:
 *         * Tries to interpret it first as a JSON string, then as YAML if JSON parsing fails.
 *         * Converts the input into a clean YAML string and stores it back in `AppVars`.
 *   - Generates default Kubernetes application names and namespaces for PR deployments based on the application name and PR number.
 *   - Outputs the updated `APPVARS` for downstream workflow steps.
 *
 * This comprehensive processing ensures that all repository and deployment details are correctly set up for PR deploys.
 *
 * @returns {Promise<void>} A promise that resolves when repository processing is complete.
 */
export function run() {
  try {
    core.startGroup('Process Repo and PR Deploy Variables')

    // --- Input ---
    const appVarsJsonString = getActionInput('APPVARS', true)
    const appVars: AppVars | null = tryParseJson<AppVars>(appVarsJsonString)
    if (appVars === null || Object.keys(appVars).length === 0) {
      throw new Error('Failed to parse APPVARS JSON from previous step.')
    }

    const context = github.context
    const githubRefName = context.ref || ''
    const githubEventName = context.eventName || ''
    // PR number (for PR events)
    const ghEventNumber: number | undefined = context.issue.number

    // --- Get Repo Info ---
    // Prefer event context, then fallback env var
    const repoDefaultBranch = context.payload?.repository?.default_branch || ''
    const currentBranchName = githubRefName.startsWith('refs/heads/') ? githubRefName.replace('refs/heads/', '') : githubRefName;
    const repoCurrentBranchIsDefault = repoDefaultBranch === currentBranchName
    core.info(`Default branch from context: ${repoDefaultBranch || 'Not Found'}`)
    core.info(`Current branch is default: ${repoCurrentBranchIsDefault}`)
    // Assign to appVars (will be used in step 6)
    appVars['caller-repo-default-branch'] = repoDefaultBranch
    appVars['caller-repo-is-on-default-branch'] = repoDefaultBranch ? repoCurrentBranchIsDefault : false

    // --- Process pr-deploy-additional-helm-values ---
    core.startGroup("Processing 'pr-deploy-additional-helm-values'") // Sub-group for clarity
    let helmValuesSourceDescription: string = 'unknown'
    let helmObjectToProcess: unknown = null // Hold the object/array/string representation

    // Step 1: Determine the source and initial representation
    const appVarValue = appVars['pr-deploy-additional-helm-values']
    const prHelmValuesYmlInput = appVars['prHelmValuesYml'] // Get from merged inputs if needed

    if (appVarValue !== undefined && appVarValue !== null) {
      helmValuesSourceDescription = 'app vars'
      core.info("Using 'pr-deploy-additional-helm-values' from app vars.")
      if (typeof appVarValue === 'string') {
        core.debug('App var value is a string. Trying to parse as JSON first (as per original comment).')
        const parsedJson = tryParseJson<unknown>(appVarValue)
        if (parsedJson !== null) {
          core.debug('Successfully parsed app var string as JSON.')
          helmObjectToProcess = parsedJson
        } else {
          core.debug('Failed to parse app var string as JSON. Will treat as potential YAML string.')
          helmObjectToProcess = appVarValue
        }
      } else if (typeof appVarValue === 'object') {
        core.debug('App var value is already an object/array.')
        helmObjectToProcess = appVarValue
      } else {
        core.warning(`Unexpected type for app var 'pr-deploy-additional-helm-values': ${typeof appVarValue}. Treating as raw value.`)
        helmObjectToProcess = appVarValue
      }
    } else if (prHelmValuesYmlInput) { // Check the input value stored in appVars
      helmValuesSourceDescription = 'action input (expected YAML)'
      core.info("Using 'pr-deploy-additional-helm-values' from action input.")
      helmObjectToProcess = prHelmValuesYmlInput
    } else {
      core.info("'pr-deploy-additional-helm-values' not found in app vars or action input.")
    }

    // Step 2: Convert to a clean YAML string
    let finalHelmYamlString: string | undefined = undefined
    if (helmObjectToProcess !== null && helmObjectToProcess !== undefined) {
      let parsedForYaml: unknown = null
      if (typeof helmObjectToProcess === 'string') {
        core.debug(`Attempting to parse value from ${helmValuesSourceDescription} as YAML...`)
        parsedForYaml = tryParseYaml<unknown>(helmObjectToProcess)
        if (parsedForYaml === null) {
          core.warning(`Could not parse 'pr-deploy-additional-helm-values' as YAML from ${helmValuesSourceDescription}. Storing raw string value.`)
          finalHelmYamlString = helmObjectToProcess
        }
      } else {
        parsedForYaml = helmObjectToProcess
      }

      if (parsedForYaml !== null && finalHelmYamlString === undefined) {
        core.debug(`Stringifying processed object/array to clean YAML format...`)
        finalHelmYamlString = stringifyYaml(parsedForYaml)
      }
    }

    // Step 3: Store and Log the final YAML string
    appVars['pr-deploy-additional-helm-values'] = finalHelmYamlString
    logMultiline("Resulting 'pr-deploy-additional-helm-values' (YAML string)", appVars['pr-deploy-additional-helm-values'])
    core.endGroup() // End sub-group

    // --- Generate K8s Names ---
    const appName = appVars['application-name'] ?? 'unknown-app'
    if (githubEventName === 'pull_request' && ghEventNumber) {
      const defaultPrAppName = `${appName}-pr-${ghEventNumber}`
      if (!appVars['pr-deploy-k8s-application-name']) {
        core.info(`Setting 'pr-deploy-k8s-application-name' default for PR: ${defaultPrAppName}`)
        appVars['pr-deploy-k8s-application-name'] = defaultPrAppName
      }
      if (!appVars['pr-deploy-k8s-namespace']) {
        core.info(`Setting 'pr-deploy-k8s-namespace' default for PR: ${defaultPrAppName}`)
        appVars['pr-deploy-k8s-namespace'] = defaultPrAppName
      }
    } else {
      if (!appVars['pr-deploy-k8s-application-name']) {
        core.info(`Setting 'pr-deploy-k8s-application-name' default: ${appName}`)
        appVars['pr-deploy-k8s-application-name'] = appName
      }
      if (!appVars['pr-deploy-k8s-namespace']) {
        core.info(`Setting 'pr-deploy-k8s-namespace' default: ${appName}`)
        appVars['pr-deploy-k8s-namespace'] = appName
      }
    }

    // --- Output ---
    const updatedAppVarsJsonString = JSON.stringify(appVars)
    core.setOutput('APPVARS', updatedAppVarsJsonString)

    core.endGroup()
  } catch (error) {
    handleError(error, 'Process Repo and PR Deploy Variables')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
