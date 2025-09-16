import { core } from 'common/deps.ts' // Assuming core and copy are exported here
import { executeCommand, getActionInput, tryParseJson } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'

/**
 * Main function for the GitHub Action step.
 * Runs install, lint, build, with optional custom command hooks.
 */
export async function run(): Promise<void> {
  core.info('Starting python build process...')

  try {
    const dsbBuildEnvsInput: string = getActionInput('dsb-build-envs', true)
    const appVars = tryParseJson<AppVars>(dsbBuildEnvsInput)
    // No hard failure if parsing fails, custom commands just won't run
    if (!appVars) {
      throw new Error('Failed to parse dsb-build-envs JSON. Custom commands will be skipped.')
    }

    // --- Execute Build Steps with Hooks ---

    if (appVars['python-build-project-custom-command-pre-install']) {
      core.info('Executing pre pip install custom command...')
      await executeCommand(appVars['python-build-project-custom-command-pre-install'], 'Custom command: pre install')
    }

    // 2. pip install
    await executeCommand('pip3 install .', 'Installing dependencies with pip install')

    // 3. Pre pip run lint hook
    if (appVars['python-build-project-custom-command-pre-lint']) {
      core.info('Executing pre lint custom command...')
      await executeCommand(appVars['python-build-project-custom-command-pre-lint'], 'Custom command: pre lint')
    }

    // 4. linting
    if (appVars['application-dependencies']?.map((dep) => dep.name).includes('ruff')) {
      await executeCommand('ruff check', 'Running ruff lint')
    }

    // 5. Final hook
    if (appVars['python-build-project-custom-command-final']) {
      core.info('Executing final custom command...')
      await executeCommand(appVars['python-build-project-custom-command-final'], 'Custom command: final')
    }

    core.info('Python build process completed successfully.')
  } catch (error) {
    // Catch errors from executeCommand or other unexpected issues
    handleError(error, 'running Python build process')
  }
}

// --- Conditional Execution ---
// Run the action's main function if executing in GitHub Actions environment
if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
