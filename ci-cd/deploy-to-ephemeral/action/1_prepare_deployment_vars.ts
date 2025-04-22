import { core } from 'common/deps.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'
import { getActionInput, tryParseJson } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'

export function run(): void {
  core.startGroup('Preparing Deployment Variables for Ephemeral Environment')
  let appVars: AppVars | null = null // Define for use in catch/finally

  try {
    // --- Get Inputs ---
    const dsbBuildEnvsInput: string = getActionInput('dsb-build-envs', true)

    // --- Parse Build Envs JSON ---
    appVars = tryParseJson<AppVars>(dsbBuildEnvsInput)
    if (!appVars) {
      throw new Error('Failed to parse dsb-build-envs JSON.')
    }

    const hasChanges = appVars['has-changes']
    const previousTag = appVars['application-previous-version-tag']
    const registry = appVars['docker-image-registry']
    const repo = appVars['docker-image-repo']
    const baseAppName = appVars['application-name'] // Base name without suffix

    core.info(`Initial has-changes: ${hasChanges}`)
    core.info(`Initial previous-version-tag: ${previousTag ?? 'N/A'}`)
    core.info(`Initial application-version: ${appVars['application-version']}`)
    core.info(`Initial application-image-id: ${appVars['application-image-id']}`)
    core.info(`Base application-name: ${baseAppName}`)

    // --- Modify version AND image ID if no changes and previous tag exists ---
    if (hasChanges === false && previousTag && registry && repo && baseAppName) {
      core.info(`No changes detected. Modifying deployment version and image ID to use previous tag: ${previousTag}`)

      // Construct the image ID using the BASE application name (no PR suffix)
      const baseImageId = `${registry}/${repo}/${baseAppName}`

      // Update both version and image ID
      appVars['application-version'] = previousTag // Use the previous tag as the version
      appVars['application-image-id'] = baseImageId // Use the base image path

      core.info(`Modified application-version: ${appVars['application-version']}`)
      core.info(`Modified application-image-id: ${appVars['application-image-id']}`)
    } else if (hasChanges === false && !previousTag) {
      core.setFailed('Cannot deploy: No changes and no previous version tag found.')
    } else {
      core.info('App has changes or modification is not applicable. Using original deployment variables.')
    }

    // --- Set Output ---
    const modifiedJsonString = JSON.stringify(appVars)
    core.setOutput('modified_json', modifiedJsonString)
    core.debug('Outputting potentially modified dsb-build-envs JSON:')
    core.debug(JSON.stringify(JSON.parse(modifiedJsonString), null, 2)) // Pretty print for debug
  } catch (error) {
    handleError(error, 'preparing ephemeral deployment variables')
    // Ensure output is set even on error
    core.setOutput('modified_json', appVars ? JSON.stringify(appVars) : getActionInput('dsb-build-envs', true))
  } finally {
    core.endGroup()
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
