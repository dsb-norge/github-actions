import { core, github } from 'common/deps.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'
import { executeCommandWithOutput, getActionInput, tryParseJson } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'

// Regex to validate the expected tag format
const TAG_REGEX = /^\d{4}\.\d{2}\.\d{2}\.\d+$/

/**
 * Gets the list of changed files using git commands based on the event type.
 */
async function getChangedFiles(baseSha: string | null, headSha: string | null): Promise<string[]> {
  if (!baseSha || !headSha) {
    core.warning('Could not determine base or head SHA for diff. Assuming no changes.')
    return []
  }

  const NULL_SHA = '0000000000000000000000000000000000000000'
  if (headSha === NULL_SHA) {
    core.info('Head SHA is NULL_SHA (e.g., branch deletion), no files changed.')
    return []
  }

  try {
    let files: string[] = []
    if (baseSha === NULL_SHA) {
      core.info('Base SHA is NULL_SHA (initial push). Listing all files in the head commit.')
      const { stdout } = await executeCommandWithOutput(`git ls-tree -r --name-only ${headSha}`, 'Listing files in initial commit')
      files = stdout.split('\n').filter((line) => line.length > 0)
    } else {
      core.info(`Comparing base ${baseSha} and head ${headSha}`)
      const { stdout: diffOutput } = await executeCommandWithOutput(`git diff --name-only ${baseSha} ${headSha}`, `Getting changed files between ${baseSha} and ${headSha}`)
      files = diffOutput.split('\n').filter((line) => line.length > 0)
    }
    core.info(`Detected ${files.length} changed file(s).`)
    core.debug(`Changed files: ${files.join(', ')}`)
    return files
  } catch (error) {
    core.warning(`'git diff/ls-tree' command failed: ${error instanceof Error ? error.message : String(error)}. Assuming no relevant changes.`)
    return []
  }
}

/**
 * Attempts to find the most recent tag (any format) reachable from a given commit SHA.
 */
async function getLatestReachableTag(commitSha: string | null): Promise<string | null> {
  if (!commitSha) {
    core.info('No commit SHA provided to find latest reachable tag.')
    return null
  }
  try {
    core.info(`Attempting to find most recent tag reachable from commit ${commitSha}...`)
    const { stdout } = await executeCommandWithOutput(`git describe --tags --abbrev=0 ${commitSha}`, `Describing latest tag for commit ${commitSha}`)
    const tag = stdout.trim()
    if (tag) {
      core.debug(`Found latest reachable tag: ${tag}`)
      return tag
    }
    core.info(`No tag found reachable from commit ${commitSha}.`)
    return null
  } catch (error) {
    if (error instanceof Error && (error.message.includes('No names found') || error.message.includes('no tag found'))) {
      core.info(`No tag found reachable from commit ${commitSha}.`)
    } else {
      core.warning(`'git describe' command failed unexpectedly while finding latest tag for commit ${commitSha}: ${error instanceof Error ? error.message : String(error)}`)
    }
    return null
  }
}

/**
 * Detects changes per app and finds the common previous version tag for unchanged apps.
 * Adds 'has-changes' and 'application-previous-version-tag'.
 */
export async function detectChanges() {
  core.startGroup('Detecting changes and common previous version for unchanged apps')
  let appVars: AppVars[] | null = null // Define here for access in finally

  try {
    // --- Get Inputs & Context ---
    const appVarsJson = getActionInput('APPVARS', true)
    const eventName = github.context.eventName
    const payload = github.context.payload
    const action = payload.action
    const isWorkflowDispatch = eventName === 'workflow_dispatch'

    // --- Parse Inputs ---
    appVars = tryParseJson<AppVars[]>(appVarsJson)
    if (!appVars) throw new Error('Failed to parse APPVARS JSON from previous step.')
    if (!Array.isArray(appVars)) throw new Error('APPVARS input is not a JSON array.')

    core.info(`Event name: ${eventName}`)
    core.info(`Event action: ${action ?? 'N/A'}`)
    core.info(`Workflow dispatch mode: ${isWorkflowDispatch}`)

    // --- Handle Closed PR Explicitly ---
    if (eventName === 'pull_request' && action === 'closed') {
      core.info('Pull request is closed. Skipping change detection and defaulting "has-changes" to false.')
      for (const app of appVars) {
        app['has-changes'] = false
        app['application-previous-version-tag'] = null
        core.info(`App '${app['application-name']}': has-changes=false, previous-version-tag=N/A (PR Closed)`)
      }
      core.setOutput('APPVARS', JSON.stringify(appVars))
      core.endGroup() // End main group early
      return // Exit the function
    }

    // --- Determine Base/Head SHAs and SHA for Tag Lookup ---
    let baseSha: string | null = null
    let headSha: string | null = null
    let shaForPreviousTagLookup: string | null = null

    if (eventName === 'push') {
      baseSha = payload.before
      headSha = payload.after
      shaForPreviousTagLookup = baseSha
      core.info(`Push event. Base: ${baseSha}, Head: ${headSha}. Previous tag lookup SHA: ${shaForPreviousTagLookup}`)
    } else if (eventName === 'pull_request' && payload.pull_request) {
      baseSha = payload.pull_request.base?.sha
      headSha = payload.pull_request.head?.sha
      shaForPreviousTagLookup = baseSha
      core.info(`Pull request event. Base: ${baseSha}, Head: ${headSha}. Previous tag lookup SHA: ${shaForPreviousTagLookup}`)
    } else if (isWorkflowDispatch) {
      headSha = github.context.sha
      shaForPreviousTagLookup = headSha // Look for tags on the current commit itself for dispatch
      core.info(`Workflow dispatch event. Assuming changes. Head: ${headSha}. Previous tag lookup SHA: ${shaForPreviousTagLookup}`)
    } else {
      core.warning(`Unsupported event type '${eventName}' for change detection. Assuming changes.`)
      headSha = github.context.sha // Fallback
    }

    // --- Get Changed Files (unless workflow_dispatch) ---
    let changedFiles: string[] = []
    if (!isWorkflowDispatch && baseSha && headSha) { // Only run if SHAs are valid
      changedFiles = await getChangedFiles(baseSha, headSha)
    }

    // --- First Pass: Determine 'has-changes' for each app ---
    const appChangeStatus = new Map<string, boolean>()
    const unchangedAppNames: string[] = []

    core.startGroup('Determining change status per app')
    for (const app of appVars) {
      const appName = app['application-name']
      let appHasChanges = false

      if (isWorkflowDispatch) {
        core.info(`[${appName}] Setting 'has-changes' to true due to workflow_dispatch.`)
        appHasChanges = true
      } else if (changedFiles.length === 0) {
        core.info(`[${appName}] No changed files detected for this event. Setting 'has-changes' to false.`)
        appHasChanges = false
      } else {
        const sourcePath = app['application-source-path'] || '.'
        // 1. Normalize sourcePath: remove leading/trailing slashes, handle '.'
        const normalizedSourceDir = sourcePath.replace(/^\.\/|^\/|\/$/g, '') // Remove ./, leading /, trailing /

        core.debug(`[${appName}] Checking against sourcePath: '${sourcePath}', normalized directory: '${normalizedSourceDir}'`)

        if (normalizedSourceDir === '' || normalizedSourceDir === '.') {
          // If source path effectively points to the root, any change means changes for this app
          core.info(`[${appName}] Source path points to root. Assuming changes due to detected file changes.`)
          appHasChanges = true
        } else {
          // Ensure the directory path ends with a slash for correct startsWith check
          const dirPrefix = normalizedSourceDir + '/'

          for (const file of changedFiles) {
            // 2. Normalize changed file path (just separators for consistency)
            const normalizedFile = file.replace(/\\/g, '/')
            core.debug(`[${appName}] Comparing file '${normalizedFile}' with directory prefix '${dirPrefix}'`)

            // 3. Check if the normalized file path starts with the directory prefix
            if (normalizedFile.startsWith(dirPrefix)) {
              core.info(`[${appName}] Change detected: File '${normalizedFile}' is within directory '${normalizedSourceDir}'.`)
              appHasChanges = true
              break // Found a change for this app, no need to check further files
            }
          }
        }
        if (!appHasChanges) {
          core.info(`[${appName}] No relevant changes detected within directory '${normalizedSourceDir}'.`)
        }
      }
      appChangeStatus.set(appName, appHasChanges)
      if (!appHasChanges) {
        unchangedAppNames.push(appName)
      }
      core.info(`[${appName}] Change status determined: has-changes=${appHasChanges}`)
    }
    core.endGroup()

    // --- Second Pass: Find Common Previous Tag for Unchanged Apps ---
    let commonPreviousVersionTag: string | null = null
    if (unchangedAppNames.length > 0 && shaForPreviousTagLookup) {
      core.startGroup(`Finding common previous tag for ${unchangedAppNames.length} unchanged app(s)`)

      // We only need to run git describe once for the lookup SHA
      const latestReachableTag = await getLatestReachableTag(shaForPreviousTagLookup)

      if (latestReachableTag && TAG_REGEX.test(latestReachableTag)) {
        core.info(`Found latest reachable tag matching format: ${latestReachableTag}. Using this as the common previous tag.`)
        commonPreviousVersionTag = latestReachableTag
      } else if (latestReachableTag) {
        core.warning(`Latest reachable tag '${latestReachableTag}' does not match format ${TAG_REGEX}. Cannot determine common previous tag.`)
      } else {
        core.info(`No reachable tag found from SHA ${shaForPreviousTagLookup}. Cannot determine common previous tag.`)
      }
      core.endGroup()
    } else if (unchangedAppNames.length > 0 && !shaForPreviousTagLookup) {
      core.warning('Cannot determine previous tag because the base SHA for lookup is missing.')
    } else {
      core.info('No unchanged apps or workflow dispatch, skipping previous tag lookup.')
    }

    // --- Third Pass: Assign final flags to appVars ---
    core.startGroup('Assigning final flags to app variables')
    for (const app of appVars) {
      const appName = app['application-name']
      const hasChanges = appChangeStatus.get(appName) ?? true // Default to true if somehow missing

      app['has-changes'] = hasChanges
      // Assign the common tag only if the app hasn't changed
      app['application-previous-version-tag'] = !hasChanges ? commonPreviousVersionTag : null

      core.info(`App '${appName}': has-changes=${app['has-changes']}, previous-version-tag=${app['application-previous-version-tag'] ?? 'N/A'}`)
    }
    core.endGroup()

    // --- Set Output ---
    core.setOutput('APPVARS', JSON.stringify(appVars))
    core.info('Change detection and previous version lookup complete. Updated AppVars.')
  } catch (error) {
    handleError(error, 'detect changes and common previous version')
    if (appVars) {
      core.setOutput('APPVARS', JSON.stringify(appVars))
    } else {
      core.setOutput('APPVARS', '[]')
    }
  } finally {
    core.endGroup() // End main group
  }
}

// Ensure the script runs when executed directly by the action runner
if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  detectChanges()
}
