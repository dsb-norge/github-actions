import { core, github } from 'common/deps.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'
import { executeCommand, getActionInput, tryParseJson } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'

/**
 * Main function for the GitHub Action step.
 * Deletes the ephemeral ACR repository associated with a pull request.
 */
export async function run(): Promise<void> {
  try {
    // --- Get Inputs & Context ---
    const dsbBuildEnvsInput: string = getActionInput('dsb-build-envs', true)
    const eventName = github.context.eventName

    // --- Prerequisite Check ---
    core.startGroup('Checking prerequisites...')
    if (eventName !== 'pull_request') {
      throw new Error(`GitHub event name is '${eventName}', this action should only be called by pull request events!`)
    }
    core.info(`GitHub event name is '${eventName}'.`)

    // --- Parse Build Envs ---
    const appVars = tryParseJson<AppVars>(dsbBuildEnvsInput)
    if (!appVars) {
      throw new Error('Failed to parse dsb-build-envs JSON.')
    }

    // Extract required variables (already checked by require-build-envs, but good practice)
    const registry = appVars['docker-image-registry']
    const repoBase = appVars['docker-image-repo']
    const appName = appVars['application-image-name']

    if (!registry || !repoBase || !appName) {
      // Should not happen if require-build-envs ran correctly
      throw new Error('Missing required ACR details in dsb-build-envs.')
    }

    core.endGroup()

    const fullRepoName = `${repoBase}/${appName}`

    // --- Delete ACR Repository ---
    core.info(`Attempting to delete ACR repository: ${registry}/${fullRepoName}`)
    try {
      // Corrected: Pass the full command as a single string
      await executeCommand(
        ['az', 'acr', 'repository', 'delete', '--name', registry, '--repository', fullRepoName, '--yes'],
        `Deleting ACR repository ${fullRepoName}`,
      )
      core.info(`Successfully initiated deletion of ACR repository: ${registry}/${fullRepoName}`)
    } catch (deleteError) {
      // Log as warning, as the repo might already be deleted or never existed
      core.warning(`Failed to delete ACR repository ${registry}/${fullRepoName}. It might already be deleted. Error: ${deleteError}`)
      // Do not fail the action if deletion fails, as the goal is cleanup
    }
  } catch (error) {
    handleError(error, 'deleting PR ACR repository')
  } finally {
    core.info('Logging out from Azure CLI...')
    try {
      // Corrected: Pass the full command as a single string
      await executeCommand('az account clear', 'Clearing Azure account')
      core.info('Successfully logged out from Azure CLI.')
    } catch (logoutError) {
      // Log logout errors as warnings
      core.warning(`Failed to log out from Azure CLI: ${logoutError}`)
    }
  }
}

// --- Conditional Execution ---
if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
