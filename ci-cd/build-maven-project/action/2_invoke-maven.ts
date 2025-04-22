import { core } from 'common/deps.ts' // Assuming core and copy are exported here
import { executeCommand, getActionInput, getWorkspacePath, parseExtraEnvs } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'

/**
 * Main function for the GitHub Action step.
 */
export async function run(): Promise<void> {
  core.info('Executing Maven commands...')

  try {
    // --- Get Inputs (representing previous step outputs) ---
    const mvnVersionCmd: string = getActionInput('mvn-version-cmd', true)
    const mvnCmd: string = getActionInput('mvn-cmd', true)

    // --- Get Environment Variables for Extra Envs ---
    // These are expected to be set in the environment, not passed as inputs
    const extraEnvsJson: string | undefined = Deno.env.get('EXTRA_ENVS')
    const extraEnvsFromGhJson: string | undefined = Deno.env.get('EXTRA_ENVS_FROM_GH')

    // --- Export Environment Variables ---
    const exportedKeysGeneral = parseExtraEnvs(extraEnvsJson, 'general')
    const exportedKeysGitHub = parseExtraEnvs(extraEnvsFromGhJson, 'from github')
    const exportedKeys = { ...exportedKeysGeneral, ...exportedKeysGitHub }
    core.debug(`Exported environment variables: ${JSON.stringify(exportedKeys)}`)

    // --- Execute Maven Commands ---
    await executeCommand(mvnVersionCmd, 'Setting maven project version', exportedKeys, getWorkspacePath())
    await executeCommand(mvnCmd, 'Invoke maven with goals', exportedKeys, getWorkspacePath())

    core.info('Maven commands executed successfully.')
  } catch (error) {
    handleError(error, 'executing maven commands')
  }
}

// --- Conditional Execution ---
// Run the action's main function if executing in GitHub Actions environment
if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
