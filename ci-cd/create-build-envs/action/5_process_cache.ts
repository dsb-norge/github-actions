import { core, dirname, exists, join } from 'common/deps.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'
import { calculateFileMd5, getAbsolutePath, getActionInput, getRelativePath, getWorkspacePath, logMultiline, tryParseJson } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'

/**
 * Processes dependency caching variables.
 *
 * This function handles caching by:
 *   - Checking if caching is enabled via `github-dependencies-cache-enabled`.
 *   - Determining the cache type (either `maven` or `npm`) based on the `application-type` value.
 *   - Locating a dependency lock file (such as `pom.xml` or `package-lock.json`) from the application source path.
 *   - Generating a unique cache key based on a hash of the lock file (or a fallback string if the file is missing).
 *   - Creating a set of restore keys with fallbacks tailored for pull request versus non-pull request events.
 *   - Setting default cache paths if not provided.
 *   - Updating the `AppVars` object with generated cache keys and paths, which are then output for subsequent steps.
 *
 * This detailed mechanism ensures that caching is optimally configured to accelerate dependency installation.
 *
 * @returns {Promise<void>} A promise that resolves when cache configuration processing is complete.
 */
export async function run() {
  try {
    core.startGroup('Process Cache Variables')

    // --- Input ---
    const appVarsJsonString = getActionInput('APPVARS', true)
    if (!appVarsJsonString) throw new Error('INPUT_APPVARS environment variable not set.')
    const appVars: AppVars = tryParseJson<AppVars>(appVarsJsonString)!
    if (Object.keys(appVars).length === 0) {
      throw new Error('Failed to parse APPVARS JSON from previous step.')
    }

    const githubEventName = Deno.env.get('GITHUB_EVENT_NAME') ?? ''
    const ghEventNumberStr: string | undefined = Deno.env.get('GH_EVENT_NUMBER')
    const ghEventNumber: number | undefined = ghEventNumberStr ? parseInt(ghEventNumberStr, 10) : undefined

    // --- Process github-dependencies-cache-* ---
    const cacheEnabledInput = appVars['github-dependencies-cache-enabled']
    const cacheEnabled = String(cacheEnabledInput).toLowerCase() === 'true'

    if (!cacheEnabled) {
      core.info('GitHub Actions dependency caching is disabled.')
      // Ensure cache keys are removed if disabled
      delete appVars['github-dependencies-cache-key']
      delete appVars['github-dependencies-cache-restore-keys']
      delete appVars['github-dependencies-cache-pr-base-key']
    } else {
      core.info('Processing GitHub Actions dependency cache variables...')

      const appType = appVars['application-type']
      let cacheType: 'maven' | 'npm' | null = null
      const mavenTypes = ['spring-boot', 'maven-library']
      const npmTypes = ['vue']

      if (appType && mavenTypes.includes(appType)) {
        cacheType = 'maven'
      } else if (appType && npmTypes.includes(appType)) {
        cacheType = 'npm'
      } else {
        core.warning(`Unsupported application-type for caching: ${appType}. Skipping cache key generation.`)
        delete appVars['github-dependencies-cache-key']
        delete appVars['github-dependencies-cache-restore-keys']
        delete appVars['github-dependencies-cache-pr-base-key']
      }

      if (cacheType) {
        core.info(`Application type '${appType}' maps to cache type '${cacheType}'.`)

        // Determine Cache Path
        if (!appVars['github-dependencies-cache-path']) {
          core.info("'github-dependencies-cache-path' not set, using default.")
          if (cacheType === 'maven') {
            appVars['github-dependencies-cache-path'] = join('${HOME}', '.m2', 'repository')
          } else if (cacheType === 'npm') {
            appVars['github-dependencies-cache-path'] = join('${HOME}', '.npm')
          }
        }
        logMultiline('Using cache path', appVars['github-dependencies-cache-path'])

        // Determine file pattern for hash calculation
        let lockFilePath: string | null = null
        const sourcePathInput = appVars['application-source-path']
        const workspace = getWorkspacePath()
        let searchBasePath = workspace

        if (sourcePathInput) {
          const potentialPath = getAbsolutePath(sourcePathInput)
          try {
            const stats = await Deno.stat(potentialPath)
            if (stats.isFile) {
              searchBasePath = dirname(potentialPath)
              core.info(`'application-source-path' is a file, using its directory: ${getRelativePath(searchBasePath)}`)
            } else if (stats.isDirectory) {
              searchBasePath = potentialPath
              core.info(`'application-source-path' is a directory: ${getRelativePath(searchBasePath)}`)
            }
          } catch (error: unknown) {
            if (error instanceof Deno.errors.NotFound) {
              core.warning(`'application-source-path' (${sourcePathInput}) not found. Searching from workspace root.`)
            } else {
              const message = error instanceof Error ? error.message : String(error)
              core.warning(`Error checking 'application-source-path': ${message}. Searching from workspace root.`)
            }
          }
        } else {
          core.info("'application-source-path' not defined, searching from workspace root.")
        }

        if (cacheType === 'maven') {
          const pomPath = join(searchBasePath, 'pom.xml')
          if (await exists(pomPath, { isFile: true })) {
            lockFilePath = pomPath
            core.info(`Found lock file: ${getRelativePath(lockFilePath)}`)
          } else {
            core.warning(`pom.xml not found directly in ${getRelativePath(searchBasePath)}. Cache key hash will be based on 'no-lockfile'.`)
          }
        } else if (cacheType === 'npm') {
          const lockPath = join(searchBasePath, 'package-lock.json')
          if (await exists(lockPath, { isFile: true })) {
            lockFilePath = lockPath
            core.info(`Found lock file: ${getRelativePath(lockFilePath)}`)
          } else {
            core.warning(`package-lock.json not found directly in ${getRelativePath(searchBasePath)}. Cache key hash will be based on 'no-lockfile'.`)
          }
        }

        // Calculate Cache Keys
        let cacheKeyHash = 'no-lockfile'
        if (lockFilePath) {
          const hash = await calculateFileMd5(lockFilePath)
          if (hash) {
            cacheKeyHash = hash.substring(0, 8)
            core.info(`Calculated hash from ${getRelativePath(lockFilePath)}: ${cacheKeyHash}`)
          } else {
            core.warning(`Failed to calculate hash for ${getRelativePath(lockFilePath)}. Using 'hash-error'.`)
            cacheKeyHash = 'hash-error'
          }
        } else {
          core.info(`No specific lock file found. Using '${cacheKeyHash}' for hash part of cache key.`)
        }

        const runnerOS = Deno.env.get('RUNNER_OS')?.toLowerCase() ?? 'unknownos'
        const date = new Date()
        const month = date.toLocaleString('en-US', { month: 'short' }).toLowerCase()
        const year = date.getFullYear().toString().slice(-2)

        const cacheKeyMinimum = `${runnerOS}-${cacheType}-`
        const cacheKeyBaseFallback = `${cacheKeyMinimum}${month}-${year}-`
        const cacheKeyBase = `${cacheKeyBaseFallback}${cacheKeyHash}`

        const prNum = (githubEventName === 'pull_request' && ghEventNumber) ? ghEventNumber : 'no-pr'
        const cacheKeyPrFallback = `${cacheKeyMinimum}pr${prNum}-`
        const cacheKeyPr = `${cacheKeyPrFallback}${cacheKeyHash}`

        let primaryCacheKey: string
        let restoreKeys: string[]

        if (githubEventName === 'pull_request') {
          core.info('Running from pull request event, using PR cache key.')
          primaryCacheKey = cacheKeyPr
          restoreKeys = [
            cacheKeyPr,
            cacheKeyPrFallback,
            cacheKeyBase,
            cacheKeyBaseFallback,
            cacheKeyMinimum,
          ]
        } else {
          core.info('Running from non-pull request event, using base cache key.')
          primaryCacheKey = cacheKeyBase
          restoreKeys = [
            cacheKeyBase,
            cacheKeyBaseFallback,
            cacheKeyMinimum,
          ]
        }

        appVars['github-dependencies-cache-key'] = primaryCacheKey
        appVars['github-dependencies-cache-restore-keys'] = restoreKeys.join('\n')
        appVars['github-dependencies-cache-pr-base-key'] = cacheKeyPrFallback

        logMultiline('Cache Key', appVars['github-dependencies-cache-key'])
        logMultiline('Cache Restore Keys', appVars['github-dependencies-cache-restore-keys'])
        logMultiline('Cache PR Base Key', appVars['github-dependencies-cache-pr-base-key'])
      }
    }

    // --- Output ---
    const updatedAppVarsJsonString = JSON.stringify(appVars)
    core.setOutput('APPVARS', updatedAppVarsJsonString)
    core.endGroup()
  } catch (error) {
    handleError(error, 'Process Cache Variables')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
