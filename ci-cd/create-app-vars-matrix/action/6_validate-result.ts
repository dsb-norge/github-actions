import { AppVars } from 'common/interfaces/application-variables.ts'
import { core } from 'common/deps.ts'
import { handleError } from 'common/utils/error.ts'
import { ApplicationTypes } from 'common/interfaces/application-type.ts'
import { getActionInput, tryParseJson } from 'common/utils/helpers.ts'

export function validateResult() {
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

    // 4. Define required fields and allowed values
    const requiredFields = [
      'application-name',
      'application-description',
      'application-type',
    ]

    // 5. Validate each app in the array
    for (const app of appVars) {
      const appName = app['application-name']
      core.startGroup(`Validating app '${appName}'`)

      // Check for missing or empty required fields
      for (const field of requiredFields) {
        if (!app[field]) {
          throw new Error(`Missing property '${field}' in application specification for app '${appName}'!`)
        }
        if (typeof app[field] === 'string' && app[field].trim() === '') {
          throw new Error(`Property '${field}' is empty in application specification for app '${appName}'!`)
        }
      }

      // Check for allowed values of application-type
      if (!ApplicationTypes.includes(app['application-type']!)) {
        throw new Error(`Property 'application-type' has unknown value in application specification for app '${appName}'!`)
      }
      // If application-type is 'maven-library' or 'spring-boot', we check if 'java-version' is defined
      if (
        (app['application-type'] === 'maven-library' ||
          app['application-type'] === 'spring-boot') &&
        !app['java-version']
      ) {
        throw new Error(`Property 'java-version' is required for application-type '${app['application-type']}' in app '${appName}'!`)
      }
      // If application-type is 'vue', we check if 'nodejs-version' is defined
      if (app['application-type'] === 'vue' && !app['nodejs-version']) {
        throw new Error(`Property 'nodejs-version' is required for application-type '${app['application-type']}' in app '${appName}'!`)
      }

      core.info(`[OK] App '${appName}' is valid.`)
      core.endGroup()
    }

    core.info('[OK] All required fields were found in the specification.')

    // 6. Set the output
    core.setOutput('APPVARS', JSON.stringify(appVars))
  } catch (error) {
    handleError(error, 'validate result')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  validateResult()
}
