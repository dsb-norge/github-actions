import { core, exists, relative, resolve } from 'common/deps.ts'
import { getActionInput, tryParseJson } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'

/**
 * Main function for the GitHub Action step.
 * Checks if the application source directory exists and resolves its paths.
 */
export async function run(): Promise<void> {
  core.info('Checking working directory...')

  try {
    // --- Get Inputs and Environment Variables ---
    const dsbBuildEnvsInput: string = getActionInput('dsb-build-envs', true)
    const workspacePath: string = Deno.env.get('GITHUB_WORKSPACE') || '.'

    // --- Parse Build Envs JSON ---
    const appVars = tryParseJson<AppVars>(dsbBuildEnvsInput)
    if (!appVars) {
      throw new Error('Failed to parse dsb-build-envs JSON.')
    }

    // --- Get Configured Source Path ---
    // Default to '.' if the path is not specified or empty
    const relSourceDir = String(appVars['application-source-path'] || '.')
    core.info(`Configured 'application-source-path': '${relSourceDir}'`)

    // --- Resolve and Sanitize Absolute Path ---
    // path.resolve handles joining, making absolute, AND sanitizing (like realpath)
    const absPath = resolve(workspacePath, relSourceDir)
    core.debug(`Resolved absolute path candidate: ${absPath}`)

    // --- Check if Directory Exists ---
    if (!(await exists(absPath, { isDirectory: true }))) {
      // Use core.setFailed directly here for a more specific exit reason
      core.setFailed(`Unable to determine working directory! The path '${relSourceDir}' resolved to '${absPath}', which does not exist or is not a directory within the workspace '${workspacePath}'.`)
      return // Stop execution after setting failure
    }

    // --- Calculate Relative Path ---
    // Calculate path relative to the workspace root
    const relPath = relative(workspacePath, absPath)
    // Ensure relative path starts with './' if it's in the current directory or subdirs
    // and not an absolute path or outside the workspace (though the check above should prevent the latter)
    const finalRelPath = relPath.startsWith('.') || relPath.startsWith('/') ? relPath : `./${relPath}`

    core.info(`Found and verified project directory at '${finalRelPath}' (absolute: '${absPath}')`)

    // --- Set Outputs ---
    core.setOutput('abs-path', absPath)
    core.setOutput('rel-path', finalRelPath) // Output the potentially adjusted relative path

    core.info('Successfully determined and verified working directory paths.')
  } catch (error) {
    // Catch errors from JSON parsing or unexpected issues
    handleError(error, 'checking working directory')
  }
}

// --- Conditional Execution ---
// Run the action's main function if executing in GitHub Actions environment
if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
