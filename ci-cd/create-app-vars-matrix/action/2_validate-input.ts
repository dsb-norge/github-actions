import { core } from 'common/deps.ts'
import { handleError } from 'common/utils/error.ts'
import { getActionInput, tryParseJson } from 'common/utils/helpers.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'

export function validateInput() {
  try {
    // 1. Get the 'APPVARS' input (which is a JSON string)
    const appVarsJson = getActionInput('APPVARS', true)

    // 2. Log the JSON input
    if (core.isDebug()) {
      core.startGroup('JSON input received')
      core.debug(appVarsJson)
      core.endGroup()
    }

    // 3. Parse the JSON string into a JavaScript object
    const appVars = tryParseJson<AppVars[]>(appVarsJson)

    // 4. Validate that appVars is an array
    if (!Array.isArray(appVars)) {
      throw new Error("The 'APPVARS' input must be a JSON array.")
    } else {
      core.info('[OK] The specification is an array.')
    }

    // 5. Validate that the array is not empty
    if (appVars.length === 0) {
      throw new Error("The 'APPVARS' input must not be an empty array.")
    } else {
      core.info('[OK] The specification is not an empty array.')
    }

    core.setOutput('APPVARS', JSON.stringify(appVars))
  } catch (error) {
    handleError(error, 'validate input')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  validateInput()
}
