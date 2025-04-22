import { core } from 'common/deps.ts' // Assuming core is exported here
import { getActionInput, tryParseJson } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'

/**
 * Main function for the GitHub Action step.
 * Modifies the dsb-build-envs JSON to disable Maven artifact deployment flags.
 */
export function run(): void {
  core.info('Disabling Maven artifact deployment flags in dsb-build-envs...')

  try {
    // --- Get Input ---
    const dsbBuildEnvsInput: string = getActionInput('dsb-build-envs', true)
    const appVars = tryParseJson<AppVars>(dsbBuildEnvsInput)
    if (!appVars) {
      // If parsing fails, we cannot proceed
      throw new Error('Failed to parse dsb-build-envs JSON.')
    }

    // --- Modify Deployment Flags ---
    const releaseKey = 'maven-build-project-deploy-release-artifacts'
    const snapshotKey = 'maven-build-project-deploy-snapshot-artifacts'

    core.info(`Setting '${releaseKey}' to false.`)
    appVars[releaseKey] = false

    core.info(`Setting '${snapshotKey}' to false.`)
    appVars[snapshotKey] = false

    // --- Log Modified Output ---
    if (core.isDebug()) {
      core.startGroup("Modified 'dsb-build-envs'")
      core.debug(JSON.stringify(appVars, null, 2))
      core.endGroup()
    }

    // --- Set Output ---
    core.setOutput('dsb-build-envs', JSON.stringify(appVars))
    core.info('Successfully modified dsb-build-envs to disable deployment.')
  } catch (error) {
    handleError(error, 'disabling Maven deployment flags')
  }
}

// --- Conditional Execution ---
// Run the action's main function if executing in GitHub Actions environment
if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
