import { core } from 'common/deps.ts' // Assuming core is exported here
import { getActionInput, tryParseJson } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'

// Define a type for the output object keys and string values
type OutputEnvVars = Record<string, string>

/**
 * Main function for the GitHub Action step.
 * Constructs a JSON object containing environment variables for Maven/Paketo.
 */
export function run(): void {
  core.info('Constructing JSON object with extra envs for Maven...')

  try {
    // --- Get Inputs ---
    const labelsRawInput: string = getActionInput('labels-raw', true)
    const dsbBuildEnvsInput: string = getActionInput('dsb-build-envs', true)

    // --- Parse Build Envs JSON ---
    const appVars = tryParseJson<AppVars>(dsbBuildEnvsInput)
    if (!appVars) {
      throw new Error('Failed to parse dsb-build-envs JSON.')
    }

    // --- Extract Required Values from Build Envs ---
    // Ensure required values exist and are treated as strings
    const buildTime = String(appVars['application-build-timestamp'] ?? '')
    const version = String(appVars['application-version'] ?? '')
    const source = String(appVars['application-source'] ?? '')
    const revision = String(appVars['application-source-revision'] ?? '')

    // Validate essential fields
    if (!version) {
      // Fail the action if a critical piece of info is missing
      throw new Error("Required field 'application-version' not found or empty in dsb-build-envs.")
    }
    // Add warnings for potentially missing non-critical fields if desired
    if (!buildTime) core.warning("Field 'application-build-timestamp' not found or empty in dsb-build-envs.")
    if (!source) core.warning("Field 'application-source' not found or empty in dsb-build-envs.")
    if (!revision) core.warning("Field 'application-source-revision' not found or empty in dsb-build-envs.")

    const outputObject: OutputEnvVars = {}

    // Add Paketo image labels (passed directly as input)
    // https://github.com/paketo-buildpacks/environment-variables
    // Key: BP_IMAGE_LABELS
    // Value: The space-delimited, escaped string from the previous step
    outputObject['BP_IMAGE_LABELS'] = labelsRawInput

    // Add Paketo environment variables (prefixed with BPE_)
    // Key: BPE_DSB_BUILDTIME, Value: application-build-timestamp
    outputObject['BPE_DSB_BUILDTIME'] = buildTime
    // Key: BPE_DSB_VERSION, Value: application-version
    outputObject['BPE_DSB_VERSION'] = version
    // Key: BPE_DSB_SOURCE, Value: application-source
    outputObject['BPE_DSB_SOURCE'] = source
    // Key: BPE_DSB_REVISION, Value: application-source-revision
    outputObject['BPE_DSB_REVISION'] = revision

    // --- Log Output ---
    if (core.isDebug()) {
      core.startGroup('Constructed Extra Maven Env JSON')
      core.info(JSON.stringify(outputObject, null, 2))
      core.endGroup()
    }

    core.setOutput('json', JSON.stringify(outputObject))
    core.info('Successfully constructed JSON object.')
  } catch (error) {
    handleError(error, 'constructing extra Maven env JSON')
  }
}

// --- Conditional Execution ---
// Run the action's main function if executing in GitHub Actions environment
if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
