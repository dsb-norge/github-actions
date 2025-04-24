import { core, github } from 'common/deps.ts'
import { getActionInput } from 'common/utils/helpers.ts' // Assuming tryParseJson is not needed now
import { handleError } from 'common/utils/error.ts'

export async function run(): Promise<void> {
  core.info('Starting manage-pr-comments')

  try {
    // --- Get Inputs & Environment Variables ---
    const deletePrefix: string = getActionInput('delete-comments-with-prefix')
    const newCommentBody: string = getActionInput('new-comment-body')
    const githubToken: string = getActionInput('github-repo-token', true)

    // --- Get Octokit Instance and Context ---
    const octokit = github.getOctokit(githubToken)
    const context = github.context // Provides repo, owner, issue number, etc.

    // Ensure we have an issue number (relevant for PRs too)
    const issueNumber = context.issue.number
    if (!issueNumber) {
      // Check context.payload.pull_request?.number if needed, but context.issue.number usually covers PRs
      core.warning('Could not determine issue/PR number from context. Skipping comment management.')
      core.warning(`Triggering event was: ${context.eventName}`)
      core.debug(`Payload keys: ${Object.keys(context.payload)}`)
      return // Exit gracefully
    }

    const owner = context.repo.owner
    const repo = context.repo.repo

    core.info(`Operating on ${owner}/${repo}, issue/PR #${issueNumber}`)

    // --- Delete Matching Comments ---
    if (deletePrefix && deletePrefix.trim().length > 0) {
      core.info(`Attempting to delete comments starting with: "${deletePrefix}"`)

      // Use octokit.paginate for easy pagination handling
      const comments = await octokit.paginate(
        octokit.rest.issues.listComments,
        {
          owner: owner,
          repo: repo,
          issue_number: issueNumber,
          per_page: 100, // Optional: fetch max per page
        },
      )

      let deletedCount = 0
      for (const comment of comments) {
        if (comment.body && comment.body.trim().startsWith(deletePrefix)) {
          core.info(`Deleting comment -> id: ${comment.id}, body: ${comment.body.slice(0, 100)}...`)
          try {
            await octokit.rest.issues.deleteComment({
              owner: owner,
              repo: repo,
              comment_id: comment.id,
            })
            deletedCount++
          } catch (deleteError) {
            const errorMessage = deleteError instanceof Error ? deleteError.message : String(deleteError)
            core.warning(`Failed to delete comment ${comment.id}: ${errorMessage}`)
          }
        }
      }
      core.info(`Deleted ${deletedCount} matching comments.`)
    } else {
      core.info('Input "delete-comments-with-prefix" is empty or not provided. Skipping comment deletion.')
    }

    // --- Create New Comment ---
    if (newCommentBody && newCommentBody.trim().length > 0) {
      core.info('Creating new comment...')
      try {
        const { data: createdComment } = await octokit.rest.issues.createComment({
          owner: owner,
          repo: repo,
          issue_number: issueNumber,
          body: newCommentBody,
        })
        core.info(`Successfully created comment ID: ${createdComment.id}`)
        core.setOutput('created-comment-url', createdComment.html_url) // Use html_url for browser link
      } catch (e) {
        // We don't want to fail the action if comment creation fails
        core.warning(`Failed to create comment: ${e instanceof Error ? e.message : String(e)}`)
      }
    } else {
      core.info('Input "new-comment-body" is empty or not provided. Skipping comment creation.')
    }

    core.info('Manage-pr-comments step completed successfully.')
  } catch (error) {
    handleError(error, 'managing PR/issue comments')
  } finally {
    core.info('Finished manage-pr-comments step execution.')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
