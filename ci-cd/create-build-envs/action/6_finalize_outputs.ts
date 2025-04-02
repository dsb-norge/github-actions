import { core, ensureDir, join } from 'common/deps.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'
import { getActionInput, getRelativePath, getWorkspacePath, logMultiline, tryParseJson } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'
import { ENVS_WITHOUT_SECRETS } from './constants.ts'

/**
 * Finalizes and prepares the action outputs.
 *
 * This function completes the processing of application variables by:
 *   - Verifying and parsing the primary `APPVARS` input.
 *   - Generating final application properties such as Docker image IDs, source URLs, and source revisions.
 *   - Logging key variable values (including branch and source information) for traceability.
 *   - Creating a version of `AppVars` without sensitive data (by filtering keys defined in `ENVS_WITHOUT_SECRETS`).
 *   - Writing this non-secret JSON to a file for downstream artifact creation.
 *   - Setting multiple GitHub Action outputs: the path to the non-secret JSON, an artifact name based on version and app name,
 *     and the full (masked) JSON output for internal use.
 *
 * This step consolidates results from all previous stages and ensures that both secure and full operational data are available.
 *
 * @returns {Promise<void>} A promise that resolves when output finalization is complete.
 */
async function run() {
  try {
    core.startGroup('Finalize and Set Outputs')

    // --- Input ---
    const appVarsJsonString = getActionInput('APPVARS', true)
    if (!appVarsJsonString) throw new Error('INPUT_APPVARS environment variable not set.')
    const appVars: AppVars = tryParseJson<AppVars>(appVarsJsonString)!
    if (Object.keys(appVars).length === 0) {
      throw new Error('Failed to parse APPVARS JSON from previous step.')
    }

    const githubRepository = Deno.env.get('GITHUB_REPOSITORY') ?? ''
    const githubSha = Deno.env.get('GITHUB_SHA') ?? ''
    const githubServerUrl = Deno.env.get('GITHUB_SERVER_URL') ?? 'https://github.com'
    const githubRefName = Deno.env.get('GITHUB_REF_NAME') ?? '' // Get calling branch name

    // --- Set Miscellaneous and Generated App Vars ---
    core.startGroup('Setting Final Generated App Vars')

    // Image ID
    const registry = appVars['docker-image-registry']
    const repo = appVars['docker-image-repo']
    const imageName = appVars['application-image-name']
    if (registry && repo && imageName) {
      appVars['application-image-id'] = `${registry}/${repo}/${imageName}`
      logMultiline("Generated 'application-image-id'", appVars['application-image-id'])
    } else {
      core.debug("Could not generate 'application-image-id' due to missing registry, repo, or image name.")
    }

    // Source Info
    if (githubRepository) {
      appVars['application-source'] = `${githubServerUrl}/${githubRepository}`
      logMultiline("Generated 'application-source'", appVars['application-source'])
    }
    if (githubSha) {
      appVars['application-source-revision'] = githubSha
      logMultiline("Generated 'application-source-revision'", appVars['application-source-revision'])
    }

    // PR Deploy App Config Branch (Should be set from input in step 2)
    logMultiline("Value 'pr-deploy-app-config-branch'", appVars['pr-deploy-app-config-branch'])

    // Caller Repo Info (Default branch and isDefault set in step 3)
    logMultiline("Value 'caller-repo-default-branch'", appVars['caller-repo-default-branch'])
    if (githubRefName) { // Set calling branch here based on current env var
      appVars['caller-repo-calling-branch'] = githubRefName
      logMultiline("Generated 'caller-repo-calling-branch'", appVars['caller-repo-calling-branch'])
    }
    logMultiline("Value 'caller-repo-is-on-default-branch'", String(appVars['caller-repo-is-on-default-branch']))

    core.endGroup() // End Setting Final Generated App Vars

    // --- Prepare and Write Outputs ---
    core.startGroup('Preparing Final Action Outputs')

    // Create JSON without secrets
    const appVarsWithoutSecrets: Partial<AppVars> = {}
    for (const key of ENVS_WITHOUT_SECRETS) {
      if (Object.hasOwn(appVars, key) && appVars[key] !== null && appVars[key] !== undefined) {
        appVarsWithoutSecrets[key] = appVars[key]
      }
    }

    // Write non-secret JSON to file
    const outDir = join(getWorkspacePath(), '_create-build-envs')
    const outJsonFile = join(outDir, `${appVars['application-name'] ?? 'unknown-app'}.json`)
    await ensureDir(outDir)
    const nonSecretJsonString = JSON.stringify(appVarsWithoutSecrets, null, 2)
    await Deno.writeTextFile(outJsonFile, nonSecretJsonString)
    core.info(`${Object.keys(appVarsWithoutSecrets).length} non-secret envs saved to: ${getRelativePath(outJsonFile)}`)
    logMultiline('Non-secret envs JSON', nonSecretJsonString)

    // Set FINAL Action Outputs
    core.setOutput('json-without-secrets-path', outJsonFile)
    const artifactVersion = appVars['application-version'] ?? 'no-version'
    const artifactAppName = appVars['application-name'] ?? 'unknown-app'
    const artifactName = `build-envs-${artifactVersion}-${artifactAppName}`
    core.setOutput('build-envs-artifact-name', artifactName)
    core.info(`Set output 'build-envs-artifact-name': ${artifactName}`)

    // Output the full JSON (including secrets)
    const fullJsonString = JSON.stringify(appVars)
    core.setOutput('json', fullJsonString)
    core.info("Set output 'json' (multiline, includes secrets - will be masked by runner)")
    core.debug('Full output JSON (includes secrets):')
    core.debug(JSON.stringify(JSON.parse(fullJsonString), null, 2))

    core.endGroup() // End Outputs

    core.info('Action finished successfully.')
  } catch (error) {
    handleError(error, 'Finalize and Set Outputs')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
