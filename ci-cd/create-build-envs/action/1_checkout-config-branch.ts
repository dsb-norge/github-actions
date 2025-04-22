import { core } from 'common/deps.ts'
import { exists } from 'common/deps.ts'
import { handleError } from 'common/utils/error.ts'
import { executeCommand } from 'common/utils/helpers.ts'

/**
 * Checks out a specified branch from the application configuration repository.
 *
 * This function performs the following actions:
 *   - Retrieves and sanitizes the GitHub token for secure authentication.
 *   - Clones the branch (specified by the `pr-deploy-app-config-branch` input) of the repository defined by `app-config-repo`.
 *   - Checks if the specified branch exists:
 *         * If yes, it sets that branch as the output (`ref`) for later use.
 *         * If not, it defaults to the `main` branch and logs this fallback.
 *   - Removes any temporary files created during the clone process.
 *
 * This action ensures that the workflow always works with a valid configuration branch for PR deployments,
 * with proper security using the sanitized GitHub token.
 *
 * @returns {Promise<void>} A promise that resolves when the repository checkout is complete.
 */
export async function run() {
  try {
    const ghToken = Deno.env.get('GH_TOKEN') || ''
    const appConfigRepo = core.getInput('app-config-repo', { required: true })
    const prDeployAppConfigBranch = core.getInput('pr-deploy-app-config-branch')

    core.info("Using GitHub token for application config repo from input 'app-config-repo-token' ...")
    const ghTokenSanitized = ghToken.replace(/ /g, '')
    core.setSecret(ghTokenSanitized)

    if (prDeployAppConfigBranch && prDeployAppConfigBranch.trim() !== '') {
      core.info(`Cloning branch "${prDeployAppConfigBranch}" of application repo "${appConfigRepo}" ...`)
      const tmpFile = './not-going-to-use-this'

      const cloneCommand = [
        'git',
        'clone',
        '-c color.ui=always',
        '--branch',
        prDeployAppConfigBranch,
        `https://oauth2:${ghTokenSanitized}@github.com/${appConfigRepo}`,
        tmpFile,
      ]

      let code = 0
      try {
        code = await executeCommand(cloneCommand.join(' '), `Cloning branch "${prDeployAppConfigBranch}" of application repo "${appConfigRepo}"`)
      } catch {
        // If the command fails, we assume the branch does not exist
        code = 1
      }

      if (code === 0) {
        core.setOutput('ref', prDeployAppConfigBranch)
        core.info(`Ref "${prDeployAppConfigBranch}" exist in "${appConfigRepo}" and will be used for PR deploys.`)
      } else {
        core.setOutput('ref', 'main')
        core.info(`Ref "${prDeployAppConfigBranch}" does not exist in "${appConfigRepo}", using "main" for PR deploys.`)
      }

      if (await exists(tmpFile)) {
        await Deno.remove(tmpFile, { recursive: true })
      }
    } else {
      core.info(`No branch specified, using "main".`)
      core.setOutput('ref', 'main')
    }
  } catch (error: unknown) {
    handleError(error, 'checkout config branch')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
