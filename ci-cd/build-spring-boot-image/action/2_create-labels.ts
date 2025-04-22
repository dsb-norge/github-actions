import { core } from 'common/deps.ts' // Assuming core is exported here
import { getActionInput, tryParseJson } from 'common/utils/helpers.ts' // Assuming this helper exists
import { handleError } from 'common/utils/error.ts'

// Type for the parsed labels JSON object - allows basic types as values
type Labels = Record<string, string | number | boolean | null | undefined>

/**
 * Escapes single and double quotes in a string for shell/buildpack compatibility.
 * " -> \"
 * ' -> \'
 * @param value The string to escape.
 * @returns The escaped string.
 */
function escapeQuotesForBuildpack(value: string): string {
  return value.replaceAll('"', '\\"').replaceAll("'", "\\'")
}

/**
 * Main function for the GitHub Action step.
 * Formats JSON labels into space-delimited key="value" pairs for buildpacks.
 */
export function run(): void {
  core.info('Formatting labels for buildpacks...')

  try {
    const labelsJsonInput: string = getActionInput('labels-json', true)

    const parsedLabels = tryParseJson<Labels>(labelsJsonInput)
    if (
      typeof parsedLabels !== 'object' ||
      parsedLabels === null ||
      Array.isArray(parsedLabels)
    ) {
      throw new Error('Input labels-json must be a valid JSON object (key-value pairs).')
    }

    // --- Format Labels ---
    const formattedLabels: string[] = []
    for (const key in parsedLabels) {
      // Ensure it's an own property (not from prototype chain)
      if (Object.hasOwn(parsedLabels, key)) {
        const rawValue = parsedLabels[key]
        // Convert value to string before escaping. Handle null/undefined gracefully.
        const stringValue = String(rawValue ?? '') // Treat null/undefined as empty string
        const escapedValue = escapeQuotesForBuildpack(stringValue)

        // Format as "key"="escapedValue" - note the embedded quotes
        formattedLabels.push(`"${key}"="${escapedValue}"`)
      }
    }

    // --- Join Formatted Labels ---
    const finalOutput = formattedLabels.join(' ')

    // --- Log Output ---
    if (core.isDebug()) {
      core.startGroup('Formatted image labels for Paketo buildpacks')
      core.debug(finalOutput)
      core.endGroup()
    }

    core.setOutput('labels', finalOutput)
    core.info('Successfully formatted labels.')
  } catch (error) {
    handleError(error, 'formatting buildpack labels')
  }
}

// --- Conditional Execution ---
// Run the action's main function if executing in GitHub Actions environment
if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
