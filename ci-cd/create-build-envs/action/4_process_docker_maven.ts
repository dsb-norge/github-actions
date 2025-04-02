import { core, github } from 'common/deps.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'
import { getActionInput, logMultiline, readContextFromFile, stringifyYaml, tryParseJson, tryParseYaml } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'

/**
 * Processes Docker and Maven-related variables.
 *
 * This function carries out multiple tasks:
 *   - Configures Docker image pruning parameters based on the event type (e.g. pull request vs non-pull request).
 *   - Processes Maven user settings (supplied as YAML) by injecting the GitHub repository value, then validating and stringifying the result.
 *   - Reads additional Maven environment variables from context files (from GitHub, secrets, and vars contexts) per a predefined YAML specification,
 *     populating a consolidated map that is then added to `AppVars`.
 *   - Processes Maven deployment settings similarly by injecting the GitHub repository into provided YAML configurations.
 *   - Updates the `AppVars` with all processed Docker and Maven settings for use in later steps.
 *
 * This step ensures that both Docker pruning and all Maven settings are correctly adapted to the current repository context.
 *
 * @returns {Promise<void>} A promise that resolves when the Docker and Maven processing is complete.
 */
export async function run() {
  try {
    core.startGroup('Process Docker and Maven Variables')

    // --- Input ---
    const appVarsJsonString = getActionInput('APPVARS', true)
    const githubToken = getActionInput('github-repo-token') ?? Deno.env.get('GITHUB_TOKEN') ?? ''

    const appVars: AppVars = tryParseJson<AppVars>(appVarsJsonString)!
    if (Object.keys(appVars).length === 0) {
      throw new Error('Failed to parse APPVARS JSON from previous step.')
    }

    // Use @actions/github for context
    const context = github.context
    const githubRepository = context.repo ? `${context.repo.owner}/${context.repo.repo}` : Deno.env.get('GITHUB_REPOSITORY') || ''
    const githubEventName = context.eventName || Deno.env.get('GITHUB_EVENT_NAME') || ''

    // Retain reading secrets/vars context files for now (used for maven-extra-envs)
    const secretsContext = await readContextFromFile<Record<string, string>>('SECRETS_CONTEXT_FILE') ?? {}
    const varsContext = await readContextFromFile<Record<string, string>>('VARS_CONTEXT_FILE') ?? {}

    // --- Process docker-image-prune-* ---
    core.startGroup("Processing 'docker-image-prune-*' variables")
    if (githubEventName === 'pull_request') {
      core.info('PR event detected, setting default prune values.')
      if (appVars['docker-image-prune-keep-min-images'] === undefined) {
        appVars['docker-image-prune-keep-min-images'] = '5'
      }
      if (appVars['docker-image-prune-keep-num-days'] === undefined) {
        appVars['docker-image-prune-keep-num-days'] = '0'
      }
    } else {
      core.info('Non-PR event, using input/appVar values for prune settings.')
      if (appVars['docker-image-prune-keep-min-images'] === undefined) {
        // Use value merged in step 1 if available
        appVars['docker-image-prune-keep-min-images'] = appVars['docker-image-prune-keep-min-images'] ?? '10' // Default if still undefined
      }
      if (appVars['docker-image-prune-keep-num-days'] === undefined) {
        appVars['docker-image-prune-keep-num-days'] = appVars['docker-image-prune-keep-num-days'] ?? '180' // Default if still undefined
      }
    }
    logMultiline("Resulting 'docker-image-prune-keep-min-images'", String(appVars['docker-image-prune-keep-min-images'] ?? ''))
    logMultiline("Resulting 'docker-image-prune-keep-num-days'", String(appVars['docker-image-prune-keep-num-days'] ?? ''))
    core.endGroup() // End docker-image-prune-*

    // --- Process maven-* ---
    core.startGroup("Processing 'maven-*' variables")

    // Process 'maven-user-settings-repositories-yml'
    const mvnSettingsYml: string | undefined = appVars['maven-user-settings-repositories-yml'] // Already merged in step 2
    if (mvnSettingsYml) {
      core.info("Processing 'maven-user-settings-repositories-yml' from app vars.")
    } else {
      core.info("'maven-user-settings-repositories-yml' not found in app vars.")
    }

    if (mvnSettingsYml && githubRepository) {
      core.info("Validating 'maven-user-settings-repositories-yml' and injecting repo...")
      try {
        const injectedYml = mvnSettingsYml.replaceAll('{{ github.repository }}', githubRepository)
        const parsedYaml = tryParseYaml<unknown>(injectedYml)
        if (parsedYaml) {
          appVars['maven-user-settings-repositories-yml'] = stringifyYaml(parsedYaml)
        } else {
          core.warning("Could not parse 'maven-user-settings-repositories-yml' after injection. Using raw injected value.")
          appVars['maven-user-settings-repositories-yml'] = injectedYml
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        core.warning(`Error processing 'maven-user-settings-repositories-yml': ${message}`)
        // Keep potentially modified value if error occurred during stringify/parse
        appVars['maven-user-settings-repositories-yml'] = mvnSettingsYml
      }
    } else if (mvnSettingsYml) {
      core.warning("Cannot inject repository into 'maven-user-settings-repositories-yml' as GITHUB_REPOSITORY is unknown.")
      // Keep original value
    }
    logMultiline("Resulting 'maven-user-settings-repositories-yml'", appVars['maven-user-settings-repositories-yml'])

    // Process 'maven-extra-envs-from-github-yml'
    core.startGroup("Create 'maven-extra-envs-from-github' from 'maven-extra-envs-from-github-yml'")
    const mvnExtraEnvsYml: string | undefined = appVars['maven-extra-envs-from-github-yml'] // Already merged in step 1
    const populatedMavenEnvs: Record<string, string> = {}
    if (mvnExtraEnvsYml) {
      core.info("Processing 'maven-extra-envs-from-github-yml' from app vars.")
      const envsSpec = tryParseYaml<Record<string, Record<string, string>>>(mvnExtraEnvsYml)
      if (envsSpec) {
        // Populate from github context
        if (envsSpec['from-github-context']) {
          core.info("Populating from 'github' context...")
          for (const [envVar, contextKey] of Object.entries(envsSpec['from-github-context'])) {
            let value: string | undefined
            if (contextKey === 'token') {
              value = githubToken
            } else {
              // deno-lint-ignore no-explicit-any
              value = (context as any)[contextKey]
            }
            if (value !== undefined && value !== null) {
              populatedMavenEnvs[envVar] = String(value)
              core.info(`  Set env '${envVar}' from github.${contextKey}`)
            } else {
              core.warning(`Field '${contextKey}' not found in 'github' context for maven env '${envVar}'!`)
            }
          }
        }
        // Populate from secrets context
        if (envsSpec['from-secrets']) {
          core.info("Populating from 'secrets' context...")
          for (const [envVar, secretKey] of Object.entries(envsSpec['from-secrets'])) {
            const value = secretsContext[secretKey]
            if (value !== undefined && value !== null) {
              populatedMavenEnvs[envVar] = value
              core.info(`  Set env '${envVar}' from secrets.${secretKey}`)
            } else {
              core.warning(`Secret '${secretKey}' not found in 'secrets' context for maven env '${envVar}'!`)
            }
          }
        }
        // Populate from variables context
        if (envsSpec['from-variables']) {
          core.info("Populating from 'variables' context...")
          for (const [envVar, varKey] of Object.entries(envsSpec['from-variables'])) {
            const value = varsContext[varKey]
            if (value !== undefined && value !== null) {
              populatedMavenEnvs[envVar] = value
              core.info(`  Set env '${envVar}' from variables.${varKey}`)
            } else {
              core.warning(`Variable '${varKey}' not found in 'variables' context for maven env '${envVar}'!`)
            }
          }
        }
        appVars['maven-extra-envs-from-github'] = populatedMavenEnvs
        logMultiline("Resulting 'maven-extra-envs-from-github' JSON", JSON.stringify(populatedMavenEnvs, null, 2))
      } else {
        core.warning("Could not parse 'maven-extra-envs-from-github-yml'. Skipping population.")
      }
    } else {
      core.info("'maven-extra-envs-from-github-yml' not provided. Skipping population.")
    }
    delete appVars['maven-extra-envs-from-github-yml'] // Clean up the source key
    core.info("Removed 'maven-extra-envs-from-github-yml' from output.")
    core.endGroup() // End maven-extra-envs

    // Process 'maven-build-project-deploy-to-repositories-yml'
    const mvnDeployYml: string | undefined = appVars['maven-build-project-deploy-to-repositories-yml'] // Already merged
    if (mvnDeployYml) {
      core.info("Processing 'maven-build-project-deploy-to-repositories-yml' from app vars.")
    } else {
      core.info("'maven-build-project-deploy-to-repositories-yml' not found in app vars.")
    }

    if (mvnDeployYml && githubRepository) {
      core.info("Validating 'maven-build-project-deploy-to-repositories-yml' and injecting repo...")
      try {
        const injectedYml = mvnDeployYml.replaceAll('{{ github.repository }}', githubRepository)
        const parsedYaml = tryParseYaml<unknown>(injectedYml)
        if (parsedYaml) {
          appVars['maven-build-project-deploy-to-repositories-yml'] = stringifyYaml(parsedYaml).trim()
        } else {
          core.warning("Could not parse 'maven-build-project-deploy-to-repositories-yml' after injection. Using raw injected value.")
          appVars['maven-build-project-deploy-to-repositories-yml'] = injectedYml.trim()
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        core.warning(`Error processing 'maven-build-project-deploy-to-repositories-yml': ${message}`)
        appVars['maven-build-project-deploy-to-repositories-yml'] = mvnDeployYml.trim()
      }
    } else if (mvnDeployYml) {
      core.warning("Cannot inject repository into 'maven-build-project-deploy-to-repositories-yml' as GITHUB_REPOSITORY is unknown.")
      // Keep original value
    }
    logMultiline("Resulting 'maven-build-project-deploy-to-repositories-yml'", appVars['maven-build-project-deploy-to-repositories-yml'])

    core.endGroup() // End maven-*

    // --- Output ---
    const updatedAppVarsJsonString = JSON.stringify(appVars)
    core.setOutput('APPVARS', updatedAppVarsJsonString)
    core.endGroup()
  } catch (error) {
    handleError(error, 'Process Docker and Maven Variables')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
