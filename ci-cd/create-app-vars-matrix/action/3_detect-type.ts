import { AppVars } from 'common/interfaces/application-variables.ts'
import { core, exists } from 'common/deps.ts'
import { handleError } from 'common/utils/error.ts'
import { getActionInput, tryParseJson } from 'common/utils/helpers.ts'

// Core logic for detecting application type
export async function detectApplicationType(appVars: AppVars[]): Promise<void> {
  for (const app of appVars) {
    const appName = app['application-name']
    core.startGroup(`Detect 'application-type' for app '${appName}'`)
    if (!app['application-type']) {
      // Use default source path if not defined
      if (!app['application-source-path']) {
        app['application-source-path'] = './'
      }

      const srcPath = app['application-source-path']

      // Check if source path is a directory
      if (await exists(srcPath)) {
        if (await exists(`${srcPath}/pom.xml`)) {
          core.debug("Setting 'application-type' to 'spring-boot' since pom exists.")
          app['application-type'] = 'spring-boot'
        } else if (await exists(`${srcPath}/package.json`)) {
          core.debug("Setting 'application-type' to 'vue' since package.json exists.")
          app['application-type'] = 'vue'
        } else if (await exists(`${srcPath}/requirements.txt`)) {
          core.debug("Setting 'application-type' to 'python' since requirements.txt exists.")
          app['application-type'] = 'python'
        } else {
          throw new Error(`No known application type found in ${srcPath}.`)
        }
      } else {
        throw new Error(`The path ${srcPath} does not exist.`)
      }
    }
    core.endGroup()
  }
}

// Main function that interacts with GitHub Actions
export async function detectType() {
  try {
    // 1. Get the 'app-vars' input (which is a JSON string)
    const appVarsJson = getActionInput('APPVARS', true)

    // 2. Parse the JSON string into a JavaScript array
    const appVars = tryParseJson<AppVars[]>(appVarsJson)

    // 3. Detect application types
    await detectApplicationType(appVars!)

    // 4. Set the output
    core.setOutput('APPVARS', JSON.stringify(appVars))
  } catch (error) {
    handleError(error, 'detect application type')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  detectType()
}
