import { core } from 'common/deps.ts'
import { executeCommand, executeCommandWithOutput, getActionInput, logMultiline, tryParseJson } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'

// Interface based on required fields mentioned in action.yml
interface PruneInputVars {
  'docker-image-registry': string
  'docker-image-repo': string
  'application-image-name': string
  'docker-image-prune-keep-min-images': string
  'docker-image-prune-keep-num-days': string
  'acr-service-principal'?: string
}

// Helper to run az acr manifest list-metadata and capture TSV output
async function queryAcrMetadata(
  registry: string,
  repoName: string,
  query: string,
): Promise<string[]> {
  try {
    const { code, stdout, stderr } = await executeCommandWithOutput(
      [
        'az',
        'acr',
        'manifest',
        'list-metadata',
        '--registry',
        registry,
        '--name',
        repoName,
        '--query',
        query,
        '--output',
        'tsv',
      ],
      `Querying ACR metadata: ${query}`,
    )
    if (code !== 0) {
      throw new Error(`az acr manifest list-metadata failed: ${stderr}`)
    }
    // Split TSV output into an array, filter empty lines
    return stdout.trim().split(/\r?\n/).filter(Boolean)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    // If query returns empty, az cli might exit with non-zero code or empty stdout
    if (errorMessage.includes('not found') || errorMessage?.trim() === '') {
      core.info('Query returned no results.')
      return []
    }
    throw error // Re-throw other errors
  }
}

export async function run(): Promise<void> {
  core.info('Starting: Prune images from ACR')

  try {
    // --- Get Inputs & Env Vars ---
    const dsbBuildEnvsInput = getActionInput('dsb-build-envs', true)
    // Use a specific interface matching the required inputs for this action
    const appVars = tryParseJson<PruneInputVars>(dsbBuildEnvsInput)
    if (!appVars) {
      throw new Error("Input 'dsb-build-envs' is null or undefined.")
    }

    const requiredKeys: (keyof PruneInputVars)[] = [
      'docker-image-registry',
      'docker-image-repo',
      'application-image-name',
      'docker-image-prune-keep-min-images',
      'docker-image-prune-keep-num-days',
    ]

    // Validate that all required keys are present and not null/undefined in the parsed object
    const missingFields = requiredKeys.filter(
      (key) => appVars[key] === null || typeof appVars[key] === 'undefined' || appVars[key].toString().trim().length === 0, // Check for null or undefined
    )

    if (missingFields.length > 0) {
      throw new Error(
        "Input 'dsb-build-envs' is missing required fields for pruning:\n" +
          missingFields.join(',\n'),
      )
    }

    const {
      'docker-image-registry': dockerImageRegistry,
      'docker-image-repo': dockerImageRepo,
      'application-image-name': applicationImageName,
      'docker-image-prune-keep-min-images': dockerImagePruneKeepMinImages,
      'docker-image-prune-keep-num-days': dockerImagePruneKeepNumDays,
    } = appVars

    const imageRepo = `${dockerImageRepo}/${applicationImageName}`
    const keepMin = Number(dockerImagePruneKeepMinImages)
    const keepDays = Number(dockerImagePruneKeepNumDays)

    // Validate conversion results
    if (isNaN(keepMin) || isNaN(keepDays)) {
      throw new Error("Failed to convert 'docker-image-prune-keep-min-images' or 'docker-image-prune-keep-num-days' to numbers.")
    }

    core.info(`Pruning repo '${imageRepo}'`)
    core.info(`Keeping a minimum of ${keepMin} images.`)
    core.info(`Deleting images older than ${keepDays} days.`)

    // --- Calculate Date and Construct Queries ---
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - keepDays)
    const queryDate = cutoffDate.toISOString() // Format: YYYY-MM-DDTHH:mm:ss.sssZ

    const baseQuery = `reverse(sort_by([*], &createdTime)) | [${keepMin}:] | [?createdTime < '${queryDate}']`
    const tagsQuery = `${baseQuery}.tags[]`
    const digestQuery = `${baseQuery}.digest` // Get array of digests

    core.info(`Query for finding candidate digests: '${digestQuery}'`)

    // --- Query ACR for Tags and Digests ---
    const deleteTags = await queryAcrMetadata(
      dockerImageRegistry,
      imageRepo,
      tagsQuery,
    )
    const deleteDigests = await queryAcrMetadata(
      dockerImageRegistry,
      imageRepo,
      digestQuery,
    )

    // --- Delete Images ---
    if (!deleteDigests || deleteDigests.length === 0) {
      core.info('No images to be deleted based on the criteria.')
    } else {
      logMultiline(
        'Tags associated with digests to be deleted:',
        deleteTags.join('\n'),
      )
      core.startGroup('Log from deletion:')
      for (const digest of deleteDigests) {
        if (!digest) continue // Skip empty lines if any
        const imageId = `${imageRepo}@${digest}`
        core.info(`Deleting image '${imageId}'`)
        try {
          await executeCommand(
            `az acr repository delete --name ${dockerImageRegistry} --image "${imageId}" --yes`,
            `Deleting ${imageId}`,
          )
        } catch (deleteError) {
          const errorMessage = deleteError instanceof Error ? deleteError.message : String(deleteError)
          core.error(`Failed to delete image ${imageId}: ${errorMessage}`)
        }
      }
      core.endGroup()
    }

    // --- Logout (Optional but good practice if logged in via SP) ---
    // Only clear account if service principal was potentially used
    if (appVars['acr-service-principal']) {
      core.info('Logging out of Azure CLI.')
      try {
        await executeCommand('az account clear', 'Logging out')
      } catch (logoutError) {
        const errorMessage = logoutError instanceof Error ? logoutError.message : String(logoutError)
        core.warning(`az account clear failed: ${errorMessage}`)
      }
    }

    core.info('Step completed: Prune images from ACR')
  } catch (error) {
    handleError(error, 'Error in Prune images from ACR')
  }
}

// Standard execution guard
if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
