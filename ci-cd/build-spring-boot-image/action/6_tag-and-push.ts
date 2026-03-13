import { core } from 'common/deps.ts' // Assuming core and copy are exported here
import { executeCommand, executeCommandWithOutput, getActionInput } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'

/**
 * Main function for the GitHub Action step.
 * Tags and pushes a Docker image based on provided tags, then cleans up.
 * Outputs the image digest of the first pushed image for use in attestation.
 */
export async function run(): Promise<void> {
  core.info('Tagging, pushing, and cleaning up Docker image...')
  let localImageId = '' // Keep track for cleanup

  try {
    // --- Get Inputs ---
    const tagsInput: string = getActionInput('image-tags', true) // Newline-separated tags
    localImageId = getActionInput('local-image-id', true) // The ID to tag/remove

    // --- Process Tags ---
    const imageTags = tagsInput
      .split('\n') // Split by newline
      .map((tag) => tag.trim()) // Remove leading/trailing whitespace
      .filter((tag) => tag.length > 0) // Remove empty lines
      .filter((tag, index, self) => self.indexOf(tag) === index) // Only keep distinct tags

    if (imageTags.length === 0) {
      core.warning('No valid image tags provided after processing input. Nothing to push.')
      return // Exit gracefully
    }

    core.info(`Found ${imageTags.length} tag(s) to process: ${imageTags.join(', ')}`)

    // --- Tag and Push Each Image ---
    let digestCaptured = false
    for (const imageSpec of imageTags) {
      await executeCommand(`docker tag ${localImageId} ${imageSpec}`, `Tagging image ${localImageId} as ${imageSpec}`)

      // Use executeCommandWithOutput for push to capture digest from output
      if (!digestCaptured) {
        try {
          const result = await executeCommandWithOutput(
            ['docker', 'push', imageSpec],
            `Pushing image ${imageSpec}`,
          )
          if (result.code !== 0) {
            throw new Error(`docker push failed with exit code ${result.code}`)
          }
          // docker push output contains "digest: sha256:abc123..." on a line
          const allOutput = result.stdout + result.stderr
          const digestMatch = allOutput.match(/digest:\s*(sha256:[a-f0-9]+)/i)
          if (digestMatch) {
            core.setOutput('digest', digestMatch[1])
            core.info(`Captured image digest for attestation: ${digestMatch[1]}`)
            digestCaptured = true
          } else {
            core.warning('Could not parse digest from docker push output')
          }
        } catch (pushError) {
          // If executeCommandWithOutput fails, fall back to regular push
          core.warning(`Failed to capture digest during push: ${pushError instanceof Error ? pushError.message : String(pushError)}`)
          await executeCommand(`docker push ${imageSpec}`, `Pushing image ${imageSpec} (retry without digest capture)`)
        }
      } else {
        await executeCommand(`docker push ${imageSpec}`, `Pushing image ${imageSpec}`)
      }
    }

    core.info('All images tagged and pushed successfully.')
  } catch (error) {
    handleError(error, 'tagging or pushing Docker image')
  } finally {
    // --- Clean Up Local Image ---
    if (localImageId) {
      core.info(`Attempting cleanup of local image: ${localImageId}`)
      try {
        // Use a separate try-catch for cleanup, as cleanup failure
        // shouldn't necessarily mask a push failure.
        await executeCommand(`docker rmi ${localImageId}`, `Cleaning up local image ${localImageId}`)
        core.info(`Successfully removed local image: ${localImageId}`)
      } catch (cleanupError) {
        core.warning(`Failed to clean up local image '${localImageId}': ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`)
      }
    } else {
      core.info('Skipping cleanup as local image ID was not available.')
    }
  }
}

// --- Conditional Execution ---
// Run the action's main function if executing in GitHub Actions environment
if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
