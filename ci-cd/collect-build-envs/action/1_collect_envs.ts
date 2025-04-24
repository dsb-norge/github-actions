import { core, join } from 'common/deps.ts'
import { handleError } from 'common/utils/error.ts'
import { logMultiline, tryParseJson } from 'common/utils/helpers.ts'

/**
 * Reads all JSON files from a directory, parses them, and merges them into a single array.
 * @param dirPath The path to the directory containing JSON files.
 * @returns A promise that resolves to an array of parsed JSON objects.
 */
async function mergeJsonFiles(dirPath: string): Promise<unknown[]> {
  const mergedData: unknown[] = []
  core.info(`Reading JSON files from directory: ${dirPath}`)

  try {
    for await (const dirEntry of Deno.readDir(dirPath)) {
      if (dirEntry.isFile && dirEntry.name.endsWith('.json')) {
        const filePath = join(dirPath, dirEntry.name)
        core.debug(`Reading file: ${filePath}`)
        try {
          const fileContent = await Deno.readTextFile(filePath)
          const jsonData = tryParseJson<unknown>(fileContent)
          if (jsonData !== null) {
            mergedData.push(jsonData)
            core.debug(`Successfully parsed and added: ${dirEntry.name}`)
          } else {
            core.warning(`Failed to parse JSON from file: ${filePath}. Skipping.`)
          }
        } catch (readError) {
          core.warning(`Failed to read file ${filePath}: ${readError instanceof Error ? readError.message : String(readError)}. Skipping.`)
        }
      }
    }
  } catch (dirError) {
    if (dirError instanceof Deno.errors.NotFound) {
      core.warning(`Directory not found: ${dirPath}. No JSON files to merge.`)
      // Return empty array if directory doesn't exist
      return []
    }
    // Re-throw other directory reading errors
    throw dirError
  }

  core.info(`Found and merged ${mergedData.length} JSON file(s).`)
  return mergedData
}

/**
 * Main function for the GitHub Action step.
 * Collects build environment JSON files downloaded as artifacts and merges them into a single JSON array output.
 */
export async function run(): Promise<void> {
  core.startGroup('Collecting and Merging Build Envs Artifacts')
  try {
    // --- Get Environment Variables ---
    const downloadPath = Deno.env.get('DOWNLOAD_PATH')
    if (!downloadPath) {
      throw new Error('DOWNLOAD_PATH environment variable not set. Cannot locate downloaded artifacts.')
    }

    // --- Merge JSON Files ---
    const mergedArray = await mergeJsonFiles(downloadPath)

    // --- Set Output ---
    const outputJsonString = JSON.stringify(mergedArray)
    logMultiline('Output JSON array', outputJsonString)
    core.setOutput('json', outputJsonString)

    core.info('Successfully collected and merged build envs.')
  } catch (error) {
    handleError(error, 'collecting build envs artifacts')
  } finally {
    core.endGroup()
  }
}

// --- Conditional Execution ---
if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
