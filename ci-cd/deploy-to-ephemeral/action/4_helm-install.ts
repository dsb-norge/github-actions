import { core } from 'common/deps.ts'
import { executeCommand, getActionInput, tryParseJson } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'

const PREVIEW_CHART_PATH = './_pr-deploy/preview/'

export async function run(): Promise<void> {
  core.info('Starting Helm install/upgrade...')
  try {
    const dsbBuildEnvsInput: string = getActionInput('dsb-build-envs', true)
    const helmValuesParam: string = getActionInput('helm-commandline-parameter')

    const appVars: AppVars | null = tryParseJson<AppVars>(dsbBuildEnvsInput)
    if (!appVars) {
      throw new Error('Failed to parse dsb-build-envs JSON.')
    }

    const applicationName = appVars['pr-deploy-k8s-application-name']
    if (!applicationName) {
      throw new Error('Kubernetes application name is not defined in the environment variables.')
    }
    const namespace = appVars['pr-deploy-k8s-namespace']
    if (!namespace) {
      throw new Error('Kubernetes namespace is not defined in the environment variables.')
    }

    // Compose Helm command
    const helmCmdArgs: string[] = [
      'upgrade',
      '--install',
      '--atomic',
      '--create-namespace',
      '--namespace',
      namespace,
      '--set',
      `application=${appVars['application-name']}`,
      '--set',
      `gitTargetRevision=${appVars['pr-deploy-app-config-branch']}`,

      // Override values in sub-charts using dot notation: subchartName.key=value
      '--set',
      `parameters.dsb-spring-boot\\\.image=${appVars['application-image-id']}`, // Override image in dsb-spring-boot sub-chart
      '--set',
      `parameters.dsb-spring-boot\\\.tag=${appVars['application-version']}`, // Override tag in dsb-spring-boot sub-chart
      '--set',
      `parameters.dsb-nginx-frontend\\\.image=${appVars['application-image-id']}`, // Override image in dsb-nginx-frontend sub-chart
      '--set',
      `parameters.dsb-nginx-frontend\\\.tag=${appVars['application-version']}`, // Override tag in dsb-nginx-frontend sub-chart
      '--set',
      `parameters.dsb-spring-boot-job\\\.image=${appVars['application-image-id']}`, // Override image in dsb-spring-boot-job sub-chart
      '--set',
      `parameters.dsb-spring-boot-job\\\.tag=${appVars['application-version']}`, // Override tag in dsb-spring-boot-job sub-chart
    ]
    if (helmValuesParam && helmValuesParam.trim().length > 0) {
      core.info(`Processing helm values parameter: ${helmValuesParam}`)
      const parts = helmValuesParam.trim().split(/\s+/, 2)
      if (parts.length === 2 && parts[0] === '--values') {
        helmCmdArgs.push(parts[0], parts[1])
        core.info(`Added Helm values file: ${parts[1]}`)
      } else {
        core.warning(`Could not parse helm values parameter string: "${helmValuesParam}". Expected format: --values <filepath>`)
      }
    } else {
      core.info('No additional Helm values parameter provided.')
    }
    helmCmdArgs.push(applicationName)
    helmCmdArgs.push(PREVIEW_CHART_PATH)

    const commandString = `helm ${helmCmdArgs.join(' ')}`
    await executeCommand(commandString, 'helm upgrade --install')

    core.info('Helm install/upgrade completed.')
  } catch (error) {
    handleError(error, 'helm-install')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
