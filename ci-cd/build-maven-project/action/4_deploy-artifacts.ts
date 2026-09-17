// file: main-deploy.ts
import { core } from 'common/deps.ts'
import { executeCommand, findPomXml, getActionInput, getWorkspacePath, parseExtraEnvs, tryParseJson, tryParseYaml } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'

// --- Types ---
type DeploymentReposYaml = { // Structure for the DEPLOY_TO_REPOS_YML content
  'snapshot-repositories'?: Record<string, string>
  'release-repositories'?: Record<string, string>
}

// --- Constants ---
const MVN_DEFAULT_ARGS = '-B -Dstyle.color=always' // Common default arguments

// --- New Helper Functions ---

/**
 * Parses the deployment repositories YAML and generates Maven deploy arguments.
 * @param yamlString The YAML content as a string.
 * @param deployType 'snapshot' or 'release'.
 * @returns An array of strings, each formatted as 'id::default::url'.
 */
function parseDeploymentRepos(
  yamlString: string | undefined,
  deployType: 'snapshot' | 'release',
): string[] {
  if (!yamlString) {
    core.warning('DEPLOY_TO_REPOS_YML environment variable is not set. Cannot determine deployment repositories.')
    return []
  }

  try {
    const parsedYaml = tryParseYaml(yamlString) as DeploymentReposYaml

    if (typeof parsedYaml !== 'object' || parsedYaml === null) {
      core.warning('Failed to parse DEPLOY_TO_REPOS_YML as an object.')
      return []
    }

    const repoKey = `${deployType}-repositories` as keyof DeploymentReposYaml
    const repos = parsedYaml[repoKey]

    if (typeof repos !== 'object' || repos === null) {
      core.info(`No repositories found under '${repoKey}' key in DEPLOY_TO_REPOS_YML.`)
      return []
    }

    const deployArgs: string[] = []
    for (const id in repos) {
      if (Object.hasOwn(repos, id)) {
        const url = repos[id]
        if (typeof url === 'string') {
          // Format matches: id::default::url
          deployArgs.push(`${id}::default::${url}`)
        } else {
          core.warning(`Invalid URL found for repository ID '${id}' in '${repoKey}'. Skipping.`)
        }
      }
    }
    return deployArgs
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.warning(`Failed to parse DEPLOY_TO_REPOS_YML: ${message}`)
    return []
  }
}

// --- Main Action Function ---

/**
 * Main function for the GitHub Action step.
 */
export async function run(): Promise<void> {
  core.info('Starting Maven deployment process...')

  let proceedWithDeployment = false
  let mvnVersionCmd: string | null = null // Command to set version (if needed)
  let mvnDeployCmdBase: string | null = null // Base deploy command (without repo arg)
  let deployType: 'snapshot' | 'release' | null = null
  let safePomFilePath: string = ''

  try {
    // --- Get Inputs and Environment Variables ---
    const dsbBuildEnvsInput: string = getActionInput('build-envs', true)
    const workspacePath: string = getWorkspacePath()
    const eventName: string | undefined = Deno.env.get('GITHUB_EVENT_NAME')
    const eventAction: string | undefined = Deno.env.get('GITHUB_EVENT_ACTION') // Relevant for PRs
    const prNumber: string | undefined = Deno.env.get('GITHUB_EVENT_NUMBER') // For PR version
    const extraEnvsJson: string | undefined = Deno.env.get('EXTRA_ENVS')
    const extraEnvsFromGhJson: string | undefined = Deno.env.get('EXTRA_ENVS_FROM_GH')
    const deployReposYaml: string | undefined = Deno.env.get('DEPLOY_TO_REPOS_YML')

    // --- Parse Build Envs JSON ---
    const appVars = tryParseJson<AppVars>(dsbBuildEnvsInput)
    if (!appVars) {
      throw new Error('Failed to parse dsb-build-envs JSON.')
    }
    const appVersion = String(appVars['application-version'] || '') // Ensure string
    const appSourcePath = String(appVars['application-source-path'] || '')

    // --- Locate pom.xml ---
    const pomFilePath = await findPomXml(workspacePath, appSourcePath)
    safePomFilePath = `"${pomFilePath}"` // Quote for command line

    // --- Determine Deployment Logic based on Event ---
    core.startGroup('Determining deployment conditions')

    if (eventName === 'pull_request') {
      deployType = 'snapshot'
      core.info(`Event is pull request (Action: ${eventAction}). Deploy type: ${deployType}`)
      if (eventAction === 'closed') {
        core.info('Maven snapshot artifacts will not be deployed when closing PR.')
      } else if (String(appVars['maven-build-project-deploy-snapshot-artifacts']) !== 'true') {
        core.info('Deployment of maven snapshot artifacts not requested (maven-build-project-deploy-snapshot-artifacts is not true).')
      } else if (!prNumber) {
        core.warning('Cannot determine PR number (GITHUB_EVENT_NUMBER) for snapshot version. Skipping deployment.')
      } else {
        core.info('Will deploy maven snapshot artifacts as requested.')
        proceedWithDeployment = true
        const snapshotVersion = `pr-${prNumber}-SNAPSHOT`
        const versionCmdKey = 'maven-build-project-deploy-snapshot-version-command'
        const deployCmdKey = 'maven-build-project-deploy-snapshot-deploy-command'

        // Determine version command
        if (appVars[versionCmdKey]) {
          core.info(`Using snapshot version command from dsb-build-envs.${versionCmdKey}`)
          mvnVersionCmd = `${appVars[versionCmdKey]} -DnewVersion=${snapshotVersion}`
        } else {
          core.info('Using default snapshot version command.')
          mvnVersionCmd = `mvn ${MVN_DEFAULT_ARGS} --file ${safePomFilePath} versions:set -DnewVersion=${snapshotVersion}`
        }

        // Determine deploy command
        if (appVars[deployCmdKey]) {
          core.info(`Using snapshot deploy command from dsb-build-envs.${deployCmdKey}`)
          mvnDeployCmdBase = String(appVars[deployCmdKey])
        } else {
          core.info('Using default snapshot deploy command.')
          mvnDeployCmdBase = `mvn ${MVN_DEFAULT_ARGS} --file ${safePomFilePath} deploy -DskipTests`
        }
      }
    } else if (eventName === 'push' || eventName === 'workflow_dispatch') {
      deployType = 'release'
      core.info(`Event is ${eventName}. Deploy type: ${deployType}`)
      const isDefaultBranch = String(appVars['caller-repo-is-on-default-branch']) === 'true'
      const callingBranch = String(appVars['caller-repo-calling-branch'] || 'unknown')

      if (!isDefaultBranch) {
        core.info(`Maven release artifacts will not be deployed as current branch '${callingBranch}' is not the default branch.`)
      } else if (String(appVars['maven-build-project-deploy-release-artifacts']) !== 'true') {
        core.info('Deployment of maven release artifacts not requested (maven-build-project-deploy-release-artifacts is not true).')
      } else if (!appVersion) {
        core.warning('Cannot determine application version from dsb-build-envs. Skipping deployment.')
      } else {
        core.info('Will deploy maven release artifacts as requested.')
        proceedWithDeployment = true
        const versionCmdKey = 'maven-build-project-deploy-release-version-command'
        const deployCmdKey = 'maven-build-project-deploy-release-deploy-command'

        // Determine version command (often not needed for release)
        if (appVars[versionCmdKey]) {
          core.info(`Using release version command from dsb-build-envs.${versionCmdKey}`)
          mvnVersionCmd = `${appVars[versionCmdKey]} -DnewVersion=${appVersion}`
        } else {
          core.info('No release version command specified; assuming version is already set.')
          mvnVersionCmd = null // Explicitly null
        }

        // Determine deploy command
        if (appVars[deployCmdKey]) {
          core.info(`Using release deploy command from dsb-build-envs.${deployCmdKey}`)
          mvnDeployCmdBase = String(appVars[deployCmdKey])
        } else {
          core.info('Using default release deploy command.')
          mvnDeployCmdBase = `mvn ${MVN_DEFAULT_ARGS} --file ${safePomFilePath} deploy -DskipTests`
        }
      }
    } else {
      core.warning(`Unsupported github.event_name '${eventName}'. Deployment skipped.`)
    }
    core.endGroup()

    // --- Exit if deployment is not proceeding ---
    if (!proceedWithDeployment || !deployType || !mvnDeployCmdBase) {
      core.info('Conditions not met for deployment. Exiting.')
      return // Exit the run function gracefully
    }

    // --- Export Environment Variables ---
    const exportedKeysGeneral = parseExtraEnvs(extraEnvsJson, 'general')
    const exportedKeysGitHub = parseExtraEnvs(extraEnvsFromGhJson, 'from github')
    const exportedKeys = { ...exportedKeysGeneral, ...exportedKeysGitHub }
    core.debug(`Exported environment variables: ${JSON.stringify(exportedKeys)}`)

    // --- Set Maven Version (if required) ---
    if (mvnVersionCmd) {
      await executeCommand(mvnVersionCmd, 'Setting maven project version for deployment', exportedKeys, getWorkspacePath())
    } else {
      core.info('Skipping Maven version setting step.')
    }

    // --- Parse Deployment Repositories ---
    core.info(`Parsing deployment repositories for type: ${deployType}`)
    const deployTargets = parseDeploymentRepos(deployReposYaml, deployType)

    if (deployTargets.length === 0) {
      core.warning('No valid deployment target repositories found. Cannot deploy.')
      // Still proceed to finally block for cleanup, but don't attempt deployment.
      return
    }

    // --- Deploy to Each Repository ---
    core.info(`Deploying to ${deployTargets.length} repo(s)...`)
    for (const targetRepo of deployTargets) {
      const repoId = targetRepo.split('::default::')[0] // Extract ID for logging
      const deployArg = `-DaltDeploymentRepository=${targetRepo}`
      const finalDeployCmd = `${mvnDeployCmdBase} ${deployArg}`
      await executeCommand(finalDeployCmd, `Deploy artifacts to '${repoId}'`, exportedKeys, getWorkspacePath())
    }

    core.info('Maven deployment process completed successfully.')
  } catch (error) {
    handleError(error, 'running maven deployment')
  }
}

// --- Conditional Execution ---
if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
