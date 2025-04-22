import { core } from 'common/deps.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'
import { handleError } from 'common/utils/error.ts'
import { getActionInput, tryParseJson } from 'common/utils/helpers.ts'

export const getVersion = (dateTime: Temporal.PlainDateTime): string => {
  const datePart = dateTime.toPlainDate().toString().replaceAll('-', '.')
  const secondsSinceMidnight = dateTime
    .withPlainTime('00:00:00')
    .until(dateTime)
    .round({ smallestUnit: 'seconds' })
    .total({ unit: 'seconds' })

  return `${datePart}.${secondsSinceMidnight}`
}

export function createAppVarsMatrix(dateOverride?: Temporal.PlainDateTime) {
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

    // 4. Generate dynamic app vars
    const now = dateOverride || Temporal.Now.plainDateTimeISO()
    let appVersion = getVersion(now)

    if (Deno.env.get('GITHUB_EVENT_NAME') === 'pull_request') {
      const pullRequestNumber = Deno.env.get('GITHUB_EVENT_NUMBER')
      appVersion = `pr-${pullRequestNumber}-${appVersion}`
    }

    // 5. Add dynamic app vars to each app
    for (const app of appVars) {
      app['application-version'] = appVersion
      app['application-build-timestamp'] = now.toZonedDateTime('UTC')
        .toInstant().toString()

      let imageName = app['application-name']
      if (Deno.env.get('GITHUB_EVENT_NAME') === 'pull_request') {
        const pullRequestNumber = Deno.env.get('GITHUB_EVENT_NUMBER')
        imageName = `${imageName}-pr-${pullRequestNumber}`
      }
      app['application-image-name'] = imageName
    }

    // 6. Log the JSON output
    if (core.isDebug()) {
      core.startGroup('JSON output returned')
      core.debug(JSON.stringify(appVars, null, 2))
      core.endGroup()
    }

    // 7. Set the outputs
    core.setOutput('APPVARS', JSON.stringify(appVars))
    core.setOutput('applications-version', appVersion)
  } catch (error: unknown) {
    handleError(error, 'create app vars matrix')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  createAppVarsMatrix()
}
