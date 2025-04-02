import { core } from 'common/deps.ts'
import { handleError } from 'common/utils/error.ts'
import { getActionInput, tryParseJson } from 'common/utils/helpers.ts'
import { isValidEntry } from './isValidEntry.ts'

function parseRequiredKeys(raw: string): string[] {
  return raw.split('\n').map((key) => key.trim())
    .filter((key) => key.length > 0)
    .filter((key, index, self) => self.indexOf(key) === index) // Distinct keys
}

export function validateEnvVarsArray() {
  try {
    const jsonConfigString = getActionInput('JSON_CONFIG', false)
    const requiredRaw = getActionInput('REQUIRED_KEYS', true)

    if (!jsonConfigString) {
      core.info("'dsb-build-envs-array' not supplied, nothing to check.")
      return
    }

    const configArray = tryParseJson<unknown[]>(jsonConfigString)

    if (!configArray) {
      throw new Error("Failed to parse 'dsb-build-envs-array' JSON.")
    }

    if (!Array.isArray(configArray)) {
      throw new Error("The provided 'dsb-build-envs-array' JSON is not an array.")
    }

    const requiredKeys = parseRequiredKeys(requiredRaw)

    if (core.isDebug()) {
      core.debug(`Required keys:\n${requiredKeys.map((key) => `- ${key}`).join('\n')}`)
      configArray.forEach((obj, index) => {
        if (typeof obj === 'object' && obj !== null) {
          const appName = (obj as Record<string, unknown>)['application-name'] || `<unknown index: ${index}>`
          const keys = Object.keys(obj as Record<string, unknown>)
          core.debug(`Config for ${appName}:\n${keys.map((key) => `- ${key}`).join('\n')}`)
        }
      })
    }

    const errors: string[] = []

    for (const obj of configArray) {
      if (typeof obj !== 'object' || obj === null) {
        errors.push("Each item in 'dsb-build-envs-array' must be a valid JSON object.")
        continue
      }
      const appName = (obj as Record<string, unknown>)['application-name'] || '<unknown>'
      errors.push(...isValidEntry(obj as Record<string, unknown>, `dsb-build-envs-array (${appName})`, requiredKeys))
    }

    if (errors.length > 0) {
      core.error(`The following errors were found:\n${errors.join('\n')}`)
      core.setFailed('One or more required build envs are missing or empty in the array.')
    } else {
      core.info(`All ${requiredKeys.length} required build envs are present and valid in the array.`)
    }
  } catch (error) {
    handleError(error, 'validate environment variables array')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  validateEnvVarsArray()
}
