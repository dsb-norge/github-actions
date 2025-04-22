import { AppVars } from 'common/interfaces/application-variables.ts'
import { core } from 'common/deps.ts'
import { handleError } from 'common/utils/error.ts'
import { GithubMatrix } from 'common/interfaces/github-matrix.ts'
import { getActionInput, tryParseJson } from 'common/utils/helpers.ts'

export function makeMatrixCompatible() {
  try {
    // 1. Get the 'app-vars' input (which is a JSON string)
    const appVarsJson = getActionInput('APPVARS', true)

    // 2. Log the JSON input
    if (core.isDebug()) {
      core.startGroup('JSON input received')
      core.debug(appVarsJson)
      core.endGroup()
    }

    // 3. Parse the JSON string into a JavaScript array
    const appVars: AppVars[] = tryParseJson<AppVars[]>(appVarsJson)!

    // 4. Reshape the JSON to conform to GitHub matrix format
    const matrix: GithubMatrix = {
      'application-name': appVars.map((app) => app['application-name']),
      'include': appVars.map((app) => ({
        'application-name': app['application-name'],
        'app-vars': app,
      })),
    }

    // 5. Log the JSON output
    if (core.isDebug()) {
      core.startGroup('app vars JSON re-formatted for Github matrix job')
      core.debug(JSON.stringify(matrix, null, 2))
      core.endGroup()
    }

    // 6. Set the output
    core.setOutput('APPVARS', JSON.stringify(matrix))
  } catch (error) {
    handleError(error, 'make matrix compatible')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  makeMatrixCompatible()
}
