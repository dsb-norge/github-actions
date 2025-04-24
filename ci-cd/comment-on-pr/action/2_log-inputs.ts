import { core, github } from 'common/deps.ts'
import { getActionInput } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'

export function run(): void {
  core.info('Starting input logging step...')

  try {
    // --- Get Inputs ---
    const commentText: string = getActionInput('pr-comment-text')
    const deletePrefix: string = getActionInput('delete-comments-starting-with')

    // --- Get Context Info ---
    const context = github.context
    const issueNumber = context.issue.number // Gets PR number for pull_request events

    // --- Log Information ---
    if (issueNumber) {
      core.info(`Logging inputs for PR/Issue #${issueNumber}`)
    } else {
      // This might happen if the event isn't an issue/PR event, though the previous
      // validation step should ideally prevent this script from running in that case.
      core.warning('Could not determine PR/Issue number from context. Logging inputs without it.')
      core.warning(`Triggering event was: ${context.eventName}`)
    }

    // Log the comment body using a group for better readability, especially if multi-line
    core.startGroup('Input: Comment Body (pr-comment-text)')
    core.info(commentText) // core.info handles multi-line strings correctly
    core.endGroup()

    // Log information about comment deletion
    core.info('Input: Delete Comments Prefix (delete-comments-starting-with)')
    if (deletePrefix && deletePrefix.trim().length > 0) {
      core.info(`-> Comments starting with '${deletePrefix}' WILL be removed from the PR.`)
    } else {
      core.info('-> No comments will be removed (prefix is empty or not provided).')
    }

    core.info('Input logging finished successfully.')
  } catch (error) {
    handleError(error, 'logging action inputs')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
