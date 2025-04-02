import { core } from 'common/deps.ts' // Assuming core and copy are exported here
import { executeCommand, getActionInput, tryParseJson } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'

/**
 * Main function for the GitHub Action step.
 * Runs npm install, lint, build, with optional custom command hooks.
 */
export async function run(): Promise<void> {
  core.info('Starting Node.js build process...')

  try {
    const dsbBuildEnvsInput: string = getActionInput('dsb-build-envs', true)
    const appVars = tryParseJson<AppVars>(dsbBuildEnvsInput)
    // No hard failure if parsing fails, custom commands just won't run
    if (!appVars) {
      throw new Error('Failed to parse dsb-build-envs JSON. Custom commands will be skipped.')
    }

    // --- Execute Build Steps with Hooks ---

    if (appVars['nodejs-build-project-custom-command-pre-npm-ci']) {
      core.info('Executing pre npm ci custom command...')
      await executeCommand(appVars['nodejs-build-project-custom-command-pre-npm-ci'], 'Custom command: pre npm ci')
    }

    // 2. npm ci
    await executeCommand('npm ci --ignore-scripts --color=always', 'Installing dependencies with npm ci')

    // 3. Pre npm run lint hook
    if (appVars['nodejs-build-project-custom-command-pre-npm-run-lint']) {
      core.info('Executing pre npm run lint custom command...')
      await executeCommand(appVars['nodejs-build-project-custom-command-pre-npm-run-lint'], 'Custom command: pre npm run lint')
    }

    // 4. npm run lint
    // Optional: Add error handling or check if lint script exists in package.json
    await executeCommand('npm run lint --color=always', 'Running npm lint')

    // 5. Pre npm run build hook
    if (appVars['nodejs-build-project-custom-command-pre-npm-run-build']) {
      core.info('Executing pre npm run build custom command...')
      await executeCommand(appVars['nodejs-build-project-custom-command-pre-npm-run-build'], 'Custom command: pre npm run build')
    }

    // 6. npm run build
    // Optional: Add error handling or check if build script exists
    await executeCommand('npm run build --color=always', 'Running npm build')

    // 7. Final hook
    if (appVars['nodejs-build-project-custom-command-final']) {
      core.info('Executing final custom command...')
      await executeCommand(appVars['nodejs-build-project-custom-command-final'], 'Custom command: final')
    }

    core.info('Node.js build process completed successfully.')
  } catch (error) {
    // Catch errors from executeCommand or other unexpected issues
    handleError(error, 'running Node.js build process')
  }
}

// --- Conditional Execution ---
// Run the action's main function if executing in GitHub Actions environment
if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
