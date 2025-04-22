import { core, crypto } from 'common/deps.ts'
import { determineMavenCommand, findPomXml, getActionInput, tryParseJson } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'

// --- Default Maven Settings ---
const MVN_VERSION_ARGUMENTS_DEFAULT: string = '-B'
const MVN_VERSION_GOALS_DEFAULT: string = 'versions:set' // Default for versioning step
const MVN_BUILD_ARGUMENTS_DEFAULT: string = '-B -DskipTests' // Default for build-image step
const MVN_BUILD_GOALS_DEFAULT: string = 'spring-boot:build-image' // Default for build-image step

// --- Helper Functions ---
/**
 * Generates a short random alphanumeric tag.
 * @param length The desired length of the tag (default: 8).
 * @returns A random string.
 */
function generateRandomTag(length: number = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  const randomValues = new Uint8Array(length)
  crypto.getRandomValues(randomValues)
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length]
  }
  return result
}

/**
 * Main function for the GitHub Action step.
 * Defines Maven commands for version setting and Spring Boot build-image.
 */
export async function run(): Promise<void> {
  core.info('Defining Maven commands for Spring Boot build-image...')

  try {
    // --- Get Inputs and Environment Variables ---
    const dsbBuildEnvsInput: string = getActionInput('dsb-build-envs', true)
    const workspacePath: string = Deno.env.get('GITHUB_WORKSPACE') || '.'

    // --- Parse Build Envs JSON ---
    const appVars = tryParseJson<AppVars>(dsbBuildEnvsInput)
    if (!appVars) {
      throw new Error('Failed to parse dsb-build-envs JSON.')
    }
    const appSourcePath = String(appVars['application-source-path'] || '')

    // --- Generate Local Image ID ---
    const localImageTag = generateRandomTag()
    const localImageId = `local-spring-boot-image:${localImageTag}`
    core.info(`Generated local image ID: ${localImageId}`)

    // --- Locate pom.xml ---
    const pomFilePath = await findPomXml(workspacePath, appSourcePath)
    const safePomFilePath = `"${pomFilePath}"` // Quote for command line

    // --- Determine Maven Version Command ---
    core.startGroup('Determining Maven Version Command (for build-image)')
    const mvnVersionCmd = determineMavenCommand(
      undefined,
      appVars,
      safePomFilePath,
      MVN_VERSION_GOALS_DEFAULT,
      MVN_VERSION_ARGUMENTS_DEFAULT,
      'spring-boot-build-image-version-command',
      'spring-boot-build-image-version-goals',
      'spring-boot-build-image-version-arguments',
    )
    core.setOutput('mvn-version-cmd', mvnVersionCmd)
    core.endGroup()

    // --- Determine Maven Build-Image Command ---
    core.startGroup('Determining Maven Build-Image Command')
    const mvnBuildCmdBase = determineMavenCommand(
      undefined,
      appVars,
      safePomFilePath,
      MVN_BUILD_GOALS_DEFAULT,
      MVN_BUILD_ARGUMENTS_DEFAULT,
      'spring-boot-build-image-command',
      'spring-boot-build-image-goals',
      'spring-boot-build-image-arguments',
    )

    // Always add the local image name argument
    const imageRefArgument = `-Dspring-boot.build-image.imageName=${localImageId}`
    const mvnBuildCmdFinal = `${mvnBuildCmdBase} ${imageRefArgument}`

    core.info(`Determined Maven build-image command: '${mvnBuildCmdFinal}'`)
    core.setOutput('mvn-cmd', mvnBuildCmdFinal)
    core.setOutput('local-image-id', localImageId) // Also output the generated ID
    core.endGroup()

    core.info('Successfully defined Maven commands for build-image.')
  } catch (error) {
    handleError(error, 'defining build-image Maven commands')
  }
}

// --- Conditional Execution ---
// Run the action's main function if executing in GitHub Actions environment
if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
