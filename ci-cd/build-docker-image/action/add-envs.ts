import { basename, core, exists, join, resolve } from 'common/deps.ts'
import { getActionInput, tryParseJson } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'

/**
 * Locates the Dockerfile based on application source path.
 * Checks for 'Dockerfile' case-insensitively.
 * @param workspacePath The GitHub workspace path.
 * @param appSourcePath The application source path from appVars.
 * @returns The resolved path to the Dockerfile.
 * @throws If Dockerfile cannot be found.
 */
async function findDockerfile(
  workspacePath: string,
  appSourcePath: string | undefined,
): Promise<string> {
  const sourceDir = appSourcePath || '.' // Default to current dir if empty/missing
  const basePath = resolve(workspacePath, sourceDir)
  let dockerfilePath: string | null = null
  const dockerfileName = 'Dockerfile' // Standard name

  core.debug(`Checking for Dockerfile based on sourceDir: ${sourceDir}`)
  core.debug(`Resolved base path: ${basePath}`)

  // List all files and folders in the basePath
  for await (const entry of Deno.readDir(basePath)) {
    core.debug(`Found entry: ${entry.name} (${entry.isFile ? 'File' : 'Directory'})`)
  }

  // Check if basePath itself is the Dockerfile (case insensitive check on basename)
  if (
    (await exists(basePath, { isFile: true })) &&
    basename(basePath).toLowerCase() === dockerfileName.toLowerCase()
  ) {
    dockerfilePath = basePath
    core.debug(`Found Dockerfile directly at: ${dockerfilePath}`)
  } else {
    // If not, check for Dockerfile inside the basePath directory
    const dockerfileInDir = join(basePath, dockerfileName)
    core.debug(`Checking for Dockerfile inside directory: ${dockerfileInDir}`)
    if (await exists(dockerfileInDir, { isFile: true })) {
      dockerfilePath = dockerfileInDir
      core.debug(`Found Dockerfile inside directory: ${dockerfilePath}`)
    }
  }

  if (!dockerfilePath) {
    throw new Error(`Cannot locate Dockerfile. Checked '${basePath}' and '${join(basePath, dockerfileName)}'`)
  }
  core.info(`Located Dockerfile at: ${dockerfilePath}`)
  return dockerfilePath
}

/**
 * Main function for the GitHub Action step.
 * Adds standard DSB ENV variables to the located Dockerfile.
 */
export async function run(): Promise<void> {
  core.info('Adding standard DSB ENV variables to Dockerfile...')

  try {
    // --- Get Inputs and Environment Variables ---
    const dsbBuildEnvsInput: string = getActionInput('dsb-build-envs', true)
    const workspacePath: string = Deno.env.get('GITHUB_WORKSPACE') || '.'

    // --- Parse Build Envs JSON ---
    const appVars = tryParseJson<AppVars>(dsbBuildEnvsInput)
    if (!appVars) {
      throw new Error('Failed to parse dsb-build-envs JSON.')
    }

    // --- Extract Required Values ---
    // Ensure required values exist and are treated as strings
    const buildTime = String(appVars['application-build-timestamp'] || '')
    const version = String(appVars['application-version'] || '')
    const source = String(appVars['application-source'] || '')
    const revision = String(appVars['application-source-revision'] || '')
    const appSourcePath = String(appVars['application-source-path'] || '') // Used for locating Dockerfile

    // Basic validation - could add more checks if needed
    if (!version) {
      throw new Error("Required field 'application-version' not found or empty in dsb-build-envs.")
    }
    if (!buildTime) {
      core.warning("Field 'application-build-timestamp' not found or empty in dsb-build-envs.")
    }
    // Add similar checks for source/revision if they are strictly required

    // --- Locate Dockerfile ---
    const dockerfilePath = await findDockerfile(workspacePath, appSourcePath)

    // --- Construct ENV Block ---
    // Using template literal for readability. Trim removes leading/trailing whitespace
    // from the block itself, then we add required newlines.
    const envBlock = `
ENV DSB_BUILDTIME=${buildTime}
ENV DSB_VERSION=${version}
ENV DSB_SOURCE=${source}
ENV DSB_REVISION=${revision}
`.trim() // Trim whitespace around the block

    // --- Append to Dockerfile ---
    // Ensure there's a newline before appending the block, and one after.
    // Deno.writeFile handles file append, but findDockerfile already ensures it exists.
    const contentToAppend = '\n' + envBlock + '\n'
    const encoder = new TextEncoder()
    await Deno.writeFile(dockerfilePath, encoder.encode(contentToAppend), { append: true })
    core.info(`Appended DSB ENV variables to ${dockerfilePath}`)

    // --- Log Modified Content ---
    core.startGroup('Modified Dockerfile content')
    try {
      const modifiedContent = await Deno.readTextFile(dockerfilePath)
      core.info(modifiedContent) // core.info handles multi-line logging
    } catch (readError) {
      core.warning(`Failed to re-read Dockerfile for logging: ${readError instanceof Error ? readError.message : String(readError)}`)
    }
    core.endGroup()

    core.info('Successfully added ENV variables to Dockerfile.')
  } catch (error) {
    // Catch errors from JSON parsing, file finding, writing, etc.
    handleError(error, 'adding ENV variables to Dockerfile')
  }
}

// --- Conditional Execution ---
// Run the action's main function if executing in GitHub Actions environment
if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
