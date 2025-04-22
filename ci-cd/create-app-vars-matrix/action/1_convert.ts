import { core } from 'common/deps.ts'
import { handleError } from 'common/utils/error.ts'
import { getActionInput, tryParseYaml } from 'common/utils/helpers.ts'

export function main() {
  try {
    core.debug('Starting YAML conversion...')
    // 1. Get the 'apps' input
    const appsYaml = getActionInput('apps', true)

    // 2. Log the YAML input
    if (core.isDebug()) {
      core.startGroup('YAML specification given')
      core.debug(appsYaml)
      core.endGroup()
    }

    // 3. Convert YAML to JSON
    const appsJson = tryParseYaml<unknown>(appsYaml)

    // 4. Log the JSON output
    if (core.isDebug()) {
      core.startGroup('Specification as JSON')
      core.debug(JSON.stringify(appsJson, null, 2)) // Pretty print
      core.endGroup()
    }

    // 5. Set the output
    core.setOutput('APPVARS', JSON.stringify(appsJson))
  } catch (error: unknown) {
    handleError(error, 'convert yaml to JSON')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  main()
}
