import { core } from 'common/deps.ts' // Assuming core, copy, yaml.parse are exported
import { executeCommand, getActionInput, tryParseJson, tryParseYaml } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'

/**
 * Main function for the GitHub Action step.
 * Pulls Docker images specified in dsb-build-envs YAML.
 */
export async function run(): Promise<void> {
  core.info('Pulling Docker images specified in dsb-build-envs...')
  const imagePullResults = new Map<string, number>() // Map<imageName, exitCode>
  let totalExitCodeSum = 0

  try {
    // --- Get Inputs ---
    const dsbBuildEnvsInput: string = getActionInput('dsb-build-envs', true)
    const yamlKey = 'spring-boot-build-image-pull-images-pre-build-yml'
    const appVars = tryParseJson<AppVars>(dsbBuildEnvsInput)
    if (!appVars) {
      core.warning('Failed to parse dsb-build-envs JSON. Cannot check for image list.')
    }

    // --- Get and Validate YAML Input ---
    const pullImagesRawYaml = appVars?.[yamlKey]

    if ((typeof pullImagesRawYaml !== 'string' || !pullImagesRawYaml.trim()) && (!Array.isArray(pullImagesRawYaml) || pullImagesRawYaml.length === 0)) {
      core.info(`Key '${yamlKey}' not found or empty in dsb-build-envs. Nothing to pull.`)
      return // Graceful exit, nothing to do
    }

    if (core.isDebug()) {
      core.startGroup(`Raw YAML input from '${yamlKey}'`)
      const yamlString = Array.isArray(pullImagesRawYaml) ? pullImagesRawYaml.join('\n') : pullImagesRawYaml
      core.debug(yamlString)
      core.endGroup()
    }

    // --- Parse YAML and Get Unique Images ---
    let imagesToPull: string[] = []
    try {
      // Standard YAML parsers ignore comments by default
      const parsedYaml = Array.isArray(pullImagesRawYaml) ? pullImagesRawYaml : tryParseYaml(pullImagesRawYaml)

      if (!Array.isArray(parsedYaml)) {
        throw new Error('Expected YAML content to be an array of image names.')
      }

      // Filter out non-string or empty values and get unique images
      const uniqueImages = new Set(
        parsedYaml
          .map(String) // Convert all elements to string
          .filter((img) => typeof img === 'string' && img.trim()), // Keep only non-empty strings
      )
      imagesToPull = Array.from(uniqueImages)

      if (imagesToPull.length === 0) {
        core.info('YAML parsed, but no valid image names found after filtering.')
        return // Graceful exit
      }
      core.info(`Found ${imagesToPull.length} unique image(s) to pull.`)
    } catch (parseError) {
      throw new Error(`Failed to parse YAML from '${yamlKey}': ${parseError instanceof Error ? parseError.message : String(parseError)}`)
    }

    // --- Pull Images ---
    for (const imageName of imagesToPull) {
      const exitCode = await executeCommand(`docker pull ${imageName}`, `Executing: docker pull ${imageName}`)
      imagePullResults.set(imageName, exitCode)
    }

    // --- Log Summary ---
    core.info('--- Pull Results Summary ---')
    totalExitCodeSum = 0
    let failures = 0
    for (const [imageName, exitCode] of imagePullResults.entries()) {
      const status = exitCode === 0 ? '✅ Success' : '❌ Failure'
      core.info(`  ${status} (Code: ${exitCode}) -> ${imageName}`)
      totalExitCodeSum += exitCode
      if (exitCode !== 0) {
        failures++
      }
    }
    core.info('--------------------------')

    // --- Set Final Status ---
    if (totalExitCodeSum !== 0) {
      core.setFailed(`Pull operation failed for ${failures} image(s). Check logs for details.`)
    } else {
      core.info('All specified Docker images pulled successfully.')
    }
  } catch (error) {
    handleError(error, 'pulling Docker images')
  }
}

// --- Conditional Execution ---
if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
