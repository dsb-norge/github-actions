import { core } from 'common/deps.ts'
import { determineMavenCommand, findPomXml, getActionInput, tryParseJson } from 'common/utils/helpers.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'
import { handleError } from 'common/utils/error.ts'

// --- Default Maven Settings ---
const MVN_VERSION_ARGUMENTS_DEFAULT: string = '-B'
const MVN_VERSION_GOALS_DEFAULT: string = 'versions:set'
const MVN_ARGUMENTS_DEFAULT: string = '-B'
const MVN_GOALS_DEFAULT: string = 'clean install org.sonarsource.scanner.maven:sonar-maven-plugin:sonar'

/**
 * Main function for the GitHub Action.
 */
export async function run(): Promise<void> {
  core.info('Determining Maven commands...')

  try {
    // --- Get Inputs ---
    const dsbBuildEnvsInput: string = getActionInput('dsb-build-envs', true)
    const mvnVersionCmdInput: string = getActionInput('mvn-version-cmd')
    const mvnCmdInput: string = getActionInput('mvn-cmd')
    const workspacePath: string = Deno.env.get('GITHUB_WORKSPACE') || '.'

    // --- Parse Build Envs JSON ---
    const appVars: AppVars | null = tryParseJson<AppVars>(dsbBuildEnvsInput)
    if (!appVars) {
      throw new Error('Failed to parse dsb-build-envs JSON.')
    }

    // --- Extract Required Values from Build Envs ---
    const appSourcePath = appVars['application-source-path']
    const appVersion = appVars['application-version']

    if (!appVersion) {
      throw new Error("Required field 'application-version' not found in dsb-build-envs")
    }
    core.info(`Using application version: '${appVersion}'`)

    const pomFilePath = await findPomXml(workspacePath, appSourcePath)
    // Quote the path for safe command line usage
    const safePomFilePath = `"${pomFilePath}"`

    // --- Determine Maven Version Command ---
    core.startGroup(`Determining Maven Version Command`)
    const newVersionArg: string = `-DnewVersion=${appVersion}`
    const mvnVersionCmd = determineMavenCommand(
      mvnVersionCmdInput,
      appVars,
      safePomFilePath,
      MVN_VERSION_GOALS_DEFAULT,
      MVN_VERSION_ARGUMENTS_DEFAULT,
      'maven-build-project-version-command',
      'maven-build-project-version-goals',
      'maven-build-project-version-arguments',
    ) + ` ${newVersionArg}`
    core.info(`Determined command: '${mvnVersionCmd}'`)
    core.setOutput('mvn-version-cmd', mvnVersionCmd)
    core.endGroup()

    const skipBuildTests: boolean = typeof appVars['skip-build-tests'] === 'boolean' ? appVars['skip-build-tests'] : appVars['skip-build-tests'] === 'true'

    // --- Determine Maven Build Command ---
    core.startGroup('Determining Maven Build Command')
    const mvnCmd = determineMavenCommand(
      mvnCmdInput,
      appVars,
      safePomFilePath,
      MVN_GOALS_DEFAULT,
      MVN_ARGUMENTS_DEFAULT,
      'maven-build-project-command',
      'maven-build-project-goals',
      'maven-build-project-arguments',
      skipBuildTests,
    )
    core.info(`Determined command: '${mvnCmd}'`)
    core.setOutput('mvn-cmd', mvnCmd)
    core.endGroup()

    core.info('Successfully determined Maven commands.')
  } catch (error) {
    handleError(error, 'determining maven commands')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
