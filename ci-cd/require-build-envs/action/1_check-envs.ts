import { core } from 'common/deps.ts'
import { handleError } from 'common/utils/error.ts'
import { getActionInput, tryParseJson } from 'common/utils/helpers.ts'
import { isValidEntry } from './isValidEntry.ts'

function parseRequiredKeys(raw: string): string[] {
  return raw.split('\n').map((key) => key.trim())
    .filter((key) => key.length > 0)
    .filter((key, index, self) => self.indexOf(key) === index) // Distinct keys
}

export function validateEnvVars() {
  try {
    const jsonConfigString = getActionInput('JSON_CONFIG', false)
    const requiredRaw = getActionInput('REQUIRED_KEYS', true)

    if (!jsonConfigString) {
      core.info("'dsb-build-envs' not supplied, nothing to check.")
      return
    }

    const config = tryParseJson<Record<string, unknown>>(jsonConfigString)

    if (!config) {
      throw new Error("Failed to parse 'dsb-build-envs' JSON.")
    }

    const requiredKeys = parseRequiredKeys(requiredRaw)

    if (core.isDebug()) {
      core.debug(`Required keys:\n${requiredKeys.map((key) => `- ${key}`).join('\n')}`)
      core.debug(`Config:\n${Object.keys(config).map((key) => `- ${key}: ${typeof config[key]}`).join('\n')}`)
    }

    const errors: string[] = isValidEntry(config, 'dsb-build-envs', requiredKeys)

    if (errors.length > 0) {
      core.error(`The following errors were found:\n${errors.join('\n')}`)
      core.setFailed('One or more required build envs are missing or empty.')
    } else {
      core.info(`All ${requiredKeys.length} required build envs are present and valid.`)
    }
  } catch (error) {
    handleError(error, 'validate environment variables')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  validateEnvVars()
}
