import { core, dirname, expandGlob, join } from 'common/deps.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'
import { executeCommandWithOutput, findPomXml, getActionInput, getWorkspacePath, tryParseJson } from 'common/utils/helpers.ts'

/**
 * Guard against CodeQL's Kotlin extractor failing the Maven build.
 *
 * With 'build-mode: manual' the CodeQL tracer injects itself into kotlinc. When the project's
 * Kotlin version is newer than what the installed CodeQL bundle knows about, the interceptor
 * throws 'KotlinVersionTooRecentError' *before* compilation, which fails kotlin-maven-plugin and
 * thus the whole build — 'continue-on-error' on the CodeQL steps does not help, because the
 * failure surfaces in the build step.
 *
 * This step compares the project's Kotlin version against the versions the installed bundle ships
 * an extractor for, and disables Kotlin extraction (Java extraction is unaffected) when CodeQL
 * cannot handle it. Analysis re-enables itself once a CodeQL bundle with support lands.
 */

/** Env var honoured by the CodeQL Java agent, see https://github.com/github/codeql-action/blob/main/src/init-action.ts */
const DISABLE_KOTLIN_ENV: string = 'CODEQL_EXTRACTOR_JAVA_AGENT_DISABLE_KOTLIN'

/** Pinned so the plugin version is reproducible and no LATEST metadata lookup is needed. */
const MVN_HELP_PLUGIN: string = 'org.apache.maven.plugins:maven-help-plugin:3.5.2:evaluate'

/**
 * Highest Kotlin feature version supported by the CodeQL bundle, used only when the extractor jars
 * cannot be located in the bundle (unexpected layout change). Bump when convenient — a too low
 * value only means Kotlin analysis is skipped, it never breaks a build.
 */
const FALLBACK_MAX_KOTLIN_FEATURE_VERSION: string = '2.4.0'

const GLOB_EXCLUDES: string[] = ['**/target/**', '**/build/**', '**/node_modules/**']

/**
 * Parses a Kotlin version into its numeric parts, ignoring any pre-release tag ('2.1.0-Beta1').
 * @returns [major, minor, patch] or null if the version is not recognizable.
 */
export function parseKotlinVersion(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/**
 * Maps a Kotlin version onto the feature release it belongs to. Kotlin ships extractors per feature
 * release (x.y.0 and x.y.20), patches in between are handled by the same extractor: 2.4.10 belongs
 * to 2.4.0, 2.4.21 belongs to 2.4.20.
 */
export function toFeatureVersion(version: string): string | null {
  const parsed = parseKotlinVersion(version)
  if (!parsed) return null
  const [major, minor, patch] = parsed
  return `${major}.${minor}.${patch >= 20 ? 20 : 0}`
}

/** Compares two versions numerically. Returns a negative number if lhs < rhs, 0 if equal, positive if lhs > rhs. */
export function compareVersions(lhs: string, rhs: string): number {
  const left = parseKotlinVersion(lhs) ?? [0, 0, 0]
  const right = parseKotlinVersion(rhs) ?? [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] - right[i]
  }
  return 0
}

/**
 * Extracts the Kotlin version from a CodeQL extractor jar name, ie.
 * 'codeql-extractor-kotlin-standalone-2.4.0.jar' -> '2.4.0'.
 */
export function parseExtractorJarVersion(fileName: string): string | null {
  const match = /^codeql-extractor-kotlin-(?:standalone|embeddable)-(.+)\.jar$/.exec(fileName)
  return match ? match[1] : null
}

/** Reads the value of the 'kotlin.version' property from a pom.xml, if the pom declares it. */
export function extractKotlinVersionFromPom(pomXml: string): string | null {
  const match = /<kotlin\.version>\s*([^<\s]+)\s*<\/kotlin\.version>/.exec(pomXml)
  return match ? match[1] : null
}

export interface KotlinSupportDecision {
  supported: boolean
  reason: string
}

/**
 * Decides whether CodeQL can extract the given Kotlin version.
 * @param kotlinVersion Kotlin version used by the project.
 * @param supportedFeatureVersions Feature versions the installed bundle ships an extractor for. When
 *   empty the decision falls back to comparing against FALLBACK_MAX_KOTLIN_FEATURE_VERSION.
 */
export function decideKotlinSupport(kotlinVersion: string, supportedFeatureVersions: string[]): KotlinSupportDecision {
  const feature = toFeatureVersion(kotlinVersion)
  if (!feature) {
    // Unrecognizable version: keep today's behaviour rather than silently dropping analysis.
    return { supported: true, reason: `unable to parse Kotlin version '${kotlinVersion}', leaving Kotlin extraction enabled` }
  }
  if (supportedFeatureVersions.length === 0) {
    const supported = compareVersions(feature, FALLBACK_MAX_KOTLIN_FEATURE_VERSION) <= 0
    return {
      supported,
      reason: `Kotlin ${kotlinVersion} (feature release ${feature}) vs fallback limit ${FALLBACK_MAX_KOTLIN_FEATURE_VERSION} (no extractor jars found in the CodeQL bundle)`,
    }
  }
  const known = new Set(supportedFeatureVersions.map((version) => toFeatureVersion(version)).filter((version): version is string => version !== null))
  return {
    supported: known.has(feature),
    reason: `Kotlin ${kotlinVersion} (feature release ${feature}) vs CodeQL extractors for ${[...known].sort(compareVersions).join(', ')}`,
  }
}

/** Recursively collects the Kotlin versions the installed CodeQL bundle ships an extractor for. */
export async function findSupportedKotlinVersions(javaExtractorRoot: string, maxDepth: number = 5): Promise<string[]> {
  const versions: string[] = []
  const queue: { path: string; depth: number }[] = [{ path: join(javaExtractorRoot, 'tools'), depth: 0 }, { path: javaExtractorRoot, depth: 0 }]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const { path, depth } = queue.shift()!
    if (visited.has(path) || depth > maxDepth) continue
    visited.add(path)
    try {
      for await (const entry of Deno.readDir(path)) {
        if (entry.isDirectory) {
          queue.push({ path: join(path, entry.name), depth: depth + 1 })
        } else {
          const version = parseExtractorJarVersion(entry.name)
          if (version) versions.push(version)
        }
      }
    } catch (error) {
      core.debug(`Could not read '${path}': ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return [...new Set(versions)]
}

/** True if the source path contains at least one Kotlin file. */
async function hasKotlinSources(sourceDir: string): Promise<boolean> {
  for await (const _entry of expandGlob('**/*.kt', { root: sourceDir, exclude: GLOB_EXCLUDES, includeDirs: false })) {
    return true
  }
  return false
}

/**
 * Determines the Kotlin version of the project. Poms that declare 'kotlin.version' themselves answer
 * this for free, otherwise maven is asked to evaluate the property (it is typically inherited from
 * spring-boot-starter-parent).
 */
export async function detectKotlinVersion(sourceDir: string, pomFilePath: string): Promise<string | null> {
  const declared: string[] = []
  for await (const entry of expandGlob('**/pom.xml', { root: sourceDir, exclude: GLOB_EXCLUDES, includeDirs: false })) {
    const version = extractKotlinVersionFromPom(await Deno.readTextFile(entry.path))
    if (version) declared.push(version)
  }
  if (declared.length > 0) {
    const highest = declared.sort(compareVersions).at(-1)!
    core.info(`Found 'kotlin.version' declared in pom.xml: ${highest}`)
    return highest
  }

  core.info("No 'kotlin.version' declared in the project's poms, asking maven to evaluate the property...")
  try {
    const { stdout } = await executeCommandWithOutput(
      ['mvn', '-B', '-q', '-N', '--file', pomFilePath, MVN_HELP_PLUGIN, '-Dexpression=kotlin.version', '-DforceStdout'],
      'Evaluating kotlin.version',
    )
    const version = stdout.trim().split('\n').at(-1)?.trim() ?? ''
    if (parseKotlinVersion(version)) {
      core.info(`Maven evaluated 'kotlin.version' to: ${version}`)
      return version
    }
    core.info(`Maven did not resolve 'kotlin.version' (got '${version}')`)
  } catch (error) {
    core.info(`Could not evaluate 'kotlin.version' with maven: ${error instanceof Error ? error.message : String(error)}`)
  }
  return null
}

export async function run(): Promise<void> {
  try {
    // CodeQL's java extractor is only in play when the init action has run in this job.
    const javaExtractorRoot = Deno.env.get('CODEQL_EXTRACTOR_JAVA_ROOT')
    if (!javaExtractorRoot) {
      core.info('CodeQL is not active for this job, nothing to guard against.')
      return
    }
    if (Deno.env.get(DISABLE_KOTLIN_ENV)) {
      core.info(`${DISABLE_KOTLIN_ENV} is already set, leaving it untouched.`)
      return
    }

    const appVars: AppVars | null = tryParseJson<AppVars>(getActionInput('dsb-build-envs', true))
    if (!appVars) throw new Error('Failed to parse dsb-build-envs JSON.')

    const pomFilePath = await findPomXml(getWorkspacePath(), appVars['application-source-path'])
    const sourceDir = dirname(pomFilePath)

    if (!(await hasKotlinSources(sourceDir))) {
      core.info(`No Kotlin sources found below '${sourceDir}', nothing to guard against.`)
      return
    }

    const kotlinVersion = await detectKotlinVersion(sourceDir, pomFilePath)
    if (!kotlinVersion) {
      core.warning(
        "Could not determine the project's Kotlin version. Leaving CodeQL Kotlin extraction enabled — if the build fails with \"Kotlin version ... is too recent\", set 'codeql-enabled: false' for the app to opt out of CodeQL.",
      )
      return
    }

    const supportedVersions = await findSupportedKotlinVersions(javaExtractorRoot)
    const decision = decideKotlinSupport(kotlinVersion, supportedVersions)
    if (decision.supported) {
      core.info(`CodeQL supports the project's Kotlin version: ${decision.reason}`)
      return
    }

    core.exportVariable(DISABLE_KOTLIN_ENV, 'true')
    core.warning(
      `CodeQL cannot extract Kotlin ${kotlinVersion} (${decision.reason}). Kotlin extraction is disabled for this build so the CodeQL tracer does not fail kotlinc — Java code is still analyzed, and Kotlin analysis resumes once a CodeQL bundle with support for this Kotlin version is released.`,
    )
  } catch (error) {
    // Deliberately not handleError()/setFailed(): this step exists to keep CodeQL from breaking
    // builds, so it must never break one itself. Worst case we leave things as they are today.
    core.warning(`Could not determine whether CodeQL supports the project's Kotlin version, leaving Kotlin extraction enabled: ${error instanceof Error ? error.message : String(error)}`)
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
