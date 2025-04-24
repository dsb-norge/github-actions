import { core } from 'common/deps.ts'
import { getAbsolutePath, getActionInput, tryParseJson } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'

// Function to expand environment variables in a string
// Handles $VAR and ${VAR} formats. Does not handle defaults like ${VAR:-default}.
// Only replaces variables that are actually set in the environment.
export function expandEnvVars(input: string): string {
  core.debug(`Expanding env vars in: ${input}`)
  // Replace ${VAR} format
  let expanded = input.replace(/\${([^}]+)}/g, (match: string, varName: string) => {
    const value = Deno.env.get(varName)
    core.debug(`Found \${${varName}}, value: ${value ?? 'undefined'}`)
    return value !== undefined ? value : match // Return original match if undefined
  })
  // Replace $VAR format (using lookahead)
  // Matches $ followed by a valid variable name, not followed by a word character.
  expanded = expanded.replace(/\$([a-zA-Z_]\w*)(?!\w)/g, (match: string, varName: string) => {
    const value = Deno.env.get(varName)
    core.debug(`Found $${varName}, value: ${value ?? 'undefined'}`)
    return value !== undefined ? value : match // Return original match if undefined
  })
  core.debug(`Expanded result: ${expanded}`)
  return expanded
}

export function run(): void {
  core.info('Starting: Resolve Cache Path')

  try {
    // --- Get Inputs & Env Vars ---
    const dsbBuildEnvsInput = getActionInput('dsb-build-envs', true)
    const appVars = tryParseJson<AppVars>(dsbBuildEnvsInput)
    if (!appVars) {
      throw new Error("Input 'dsb-build-envs' could not be parsed as JSON.")
    }

    const cachePathInput = appVars['github-dependencies-cache-path']
    if (typeof cachePathInput !== 'string') { // Added type check
      throw new Error("Required field 'github-dependencies-cache-path' not found or not a string in 'dsb-build-envs'.")
    }
    core.debug(`Raw cache path: ${cachePathInput}`)

    // --- Expand Environment Variables ---
    const expandedPath = expandEnvVars(cachePathInput)
    core.debug(`Expanded cache path: ${expandedPath}`)

    // --- Resolve Absolute Path ---
    // getAbsolutePath resolves relative to GITHUB_WORKSPACE by default
    const absolutePath = getAbsolutePath(expandedPath)
    core.info(`Resolved absolute cache path: ${absolutePath}`)

    // --- Set Outputs ---
    core.setOutput('cache-abs-path', absolutePath)

    core.info('Step completed: Resolve Cache Path')
  } catch (error) {
    handleError(error, 'Error in Resolve Cache Path')
  }
}

// Standard execution guard
if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
