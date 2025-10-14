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

    // pre-pip install hook
    if (appVars['python-build-project-custom-command-pre-install']) {
      core.info('Executing pre pip install custom command...')
      await executeCommand(appVars['python-build-project-custom-command-pre-install'], 'Custom command: pre install')
    }

    // pip install
    await executeCommand('python -m pip install .', 'Installing dependencies with pip install')

    // pre-lint hook
    if (appVars['python-build-project-custom-command-pre-lint']) {
      core.info('Executing pre lint custom command...')
      await executeCommand(appVars['python-build-project-custom-command-pre-lint'], 'Custom command: pre lint')
    }

    // linting
    core.info('Running linting...')
    if (appVars['application-dependencies']?.map((dep) => dep.name).includes('ruff')) {
      await executeCommand('python -m ruff check', 'Running ruff lint')
    } else {
      core.warning('Skipping lint step no linter was found in application-dependencies.')
    }

    // pre-test hook
    if (appVars['python-build-project-custom-command-pre-test']) {
      core.info('Executing pre test custom command...')
      await executeCommand(appVars['python-build-project-custom-command-pre-test'], 'Custom command: pre test')
    }

    // testing
    if (appVars['application-dependencies']?.map((dep) => dep.name).includes('pytest')) {
      await executeCommand('python -m pytest -vv', 'Running tests with pytest')
    } else {
      core.warning('Skipping test step no test framework was found in application-dependencies.')
    }

    // final hook
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
