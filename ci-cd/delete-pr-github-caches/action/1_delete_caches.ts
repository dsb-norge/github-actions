import { core, github } from 'common/deps.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'
import { executeCommand, executeCommandWithOutput, getActionInput, tryParseJson } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'

interface CacheItem {
  id: number
  key: string
  ref: string
}

/**
 * Main function for the GitHub Action step.
 * Deletes GitHub caches associated with a closed pull request.
 */
export async function run(): Promise<void> {
  let overallSuccess = true

  try {
    // --- Get Inputs & Context ---
    const dsbBuildEnvsInput: string = getActionInput('dsb-build-envs', true)
    const ghToken: string | undefined = Deno.env.get('GH_TOKEN')
    const eventName = github.context.eventName
    const eventAction = github.context.payload.action
    const repoFullName = github.context.repo.owner + '/' + github.context.repo.repo
    const prNumber = github.context.payload.pull_request?.number

    if (!ghToken) {
      throw new Error('GH_TOKEN environment variable not set.')
    }

    // --- Parse Build Envs ---
    const appVars = tryParseJson<AppVars>(dsbBuildEnvsInput)
    if (!appVars) {
      throw new Error('Failed to parse dsb-build-envs JSON.')
    }
    const cacheKeyPrefix = appVars['github-dependencies-cache-pr-base-key']
    if (!cacheKeyPrefix) {
      throw new Error("Missing required field 'github-dependencies-cache-pr-base-key' in dsb-build-envs.")
    }

    // --- Prerequisite Checks ---
    core.startGroup('Checking prerequisites...')
    if (eventName !== 'pull_request') {
      throw new Error(`GitHub event name is '${eventName}', this action should only be called by pull request events!`)
    }
    core.info(`GitHub event name is '${eventName}'.`)

    if (eventAction !== 'closed') {
      throw new Error(`GitHub event action is '${eventAction}', this action should only be called by a PR closing action!`)
    }
    core.info(`GitHub event action is '${eventAction}'.`)

    if (!prNumber) {
      throw new Error('Could not determine pull request number from context.')
    }

    try {
      await executeCommand('gh --version', 'Check prerequisite: GitHub CLI')
    } catch (ghError) {
      throw new Error(`GitHub CLI is not available on path, please install it! Error: ${ghError}`)
    }
    core.endGroup()

    // --- List Caches ---
    core.startGroup('Listing caches...')
    const branchRef = `refs/pull/${prNumber}/merge`
    core.info(`Working with repo '${repoFullName}'.`)
    core.info(`Fetching list cache keys starting with '${cacheKeyPrefix}' for the branch '${branchRef}' ...`)

    const jqFilter = `map(select( (.ref == "${branchRef}") and (.key | contains("${cacheKeyPrefix}")) ))`
    let cacheListJson: string
    try {
      const { stdout } = await executeCommandWithOutput(
        [
          'gh',
          'cache',
          'list',
          '--repo',
          repoFullName,
          '--json',
          'id,key,ref',
          '--jq',
          jqFilter,
        ],
        'Listing relevant caches',
        { GH_TOKEN: ghToken },
      )
      cacheListJson = stdout
    } catch (listError) {
      // Treat failure to list as potentially no caches found, but warn
      core.warning(`Failed to list caches: ${listError}. Assuming no caches to delete.`)
      cacheListJson = '[]'
    }

    const cachesToDelete = tryParseJson<CacheItem[]>(cacheListJson)
    if (!cachesToDelete) {
      throw new Error('Failed to parse cache list JSON from gh command.')
    }
    core.endGroup()

    // --- Delete Caches ---
    if (cachesToDelete.length === 0) {
      core.info('No caches found matching the criteria.')
    } else {
      core.info(`Found ${cachesToDelete.length} cache(s) to delete.`)
      const deleteResults: Record<number, boolean> = {}

      core.startGroup(`Deleting ${cachesToDelete.length} cache(s) ...`)
      for (const cache of cachesToDelete) {
        core.info(`Attempting to delete cache ID: ${cache.id} (Key: ${cache.key})`)
        try {
          // Use executeCommand and catch errors to track individual success/failure
          await executeCommand(
            `gh cache delete ${String(cache.id)} --repo ${repoFullName}`,
            `Deleting cache ${cache.id}`,
            { GH_TOKEN: ghToken },
          )
          deleteResults[cache.id] = true
          core.info(`Successfully deleted cache ID: ${cache.id}`)
        } catch (deleteError) {
          core.warning(`Failed to delete cache ID ${cache.id}: ${deleteError}`)
          deleteResults[cache.id] = false
          overallSuccess = false // Mark overall failure if any deletion fails
        }
      }
      core.endGroup()

      core.info('Deletion Summary:')
      for (const cache of cachesToDelete) {
        core.info(`  - ${deleteResults[cache.id] ? '✅ Success' : '❌ Failure'} -> ID: ${cache.id}, Key: ${cache.key}`)
      }
    }

    if (!overallSuccess) {
      core.setFailed('One or more caches failed to delete.')
    }
  } catch (error) {
    handleError(error, 'deleting PR GitHub caches')
  }
}

// --- Conditional Execution ---
if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
