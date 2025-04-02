import { core } from 'common/deps.ts'
import { getActionInput, tryParseJson } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'

const VALUES_FILE = './_pr-deploy/pr-deploy-additional-helm-values.yml'

export async function run(): Promise<void> {
  core.info('Processing additional Helm values...')
  try {
    const dsbBuildEnvsInput: string = getActionInput('dsb-build-envs', true)
    const appVars: AppVars | null = tryParseJson<AppVars>(dsbBuildEnvsInput)
    if (!appVars) {
      throw new Error('Failed to parse dsb-build-envs JSON.')
    }

    const additionalHelmValues: string = appVars['pr-deploy-additional-helm-values'] ?? ''
    core.info(`Writing additional Helm values to file: ${VALUES_FILE}`)

    await Deno.writeTextFile(VALUES_FILE, additionalHelmValues)

    let commandlineParameter = ''
    if (additionalHelmValues.trim().length > 0) {
      commandlineParameter = `--values ${VALUES_FILE}`
    }

    core.setOutput('commandline-parameter', commandlineParameter)
    core.info('Helm values step completed.')
  } catch (error) {
    handleError(error, 'helm-values')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
