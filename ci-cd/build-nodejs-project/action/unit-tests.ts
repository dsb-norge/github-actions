/**
 * Which npm script, if any, runs a project's unit tests.
 *
 * Detection rather than configuration: most repos have no unit tests yet, and requiring every
 * one of them to opt in would mean the ones that do add tests silently never run them in CI.
 */

/**
 * Checked in order; the first one the project defines wins.
 *
 * The CI-specific script comes first: where a project has both, that is the one meant to run
 * unattended — single-run rather than watch mode, and usually emitting a report. A bare
 * 'test:unit' in a vitest project is frequently watch mode, which would hang the runner.
 */
export const UNIT_TEST_SCRIPT_CANDIDATES = ['test:ci', 'test:unit', 'test'] as const

/** `npm init` writes this as the `test` script — defining it is not the same as having tests. */
const NPM_PLACEHOLDER_TEST = /no test specified/i

export class UnitTestScriptNotFoundError extends Error {}

/**
 * @param scripts The `scripts` block of the project's package.json.
 * @param override `nodejs-unit-test-script`: a script name to use instead of the detected one,
 *   or `false` to skip unit tests for a project that has a test script CI should not run.
 * @returns The npm script name to run, or null when the project has no unit tests.
 * @throws UnitTestScriptNotFoundError if an explicitly configured script does not exist,
 *   since silently skipping tests someone asked for is worse than failing the build.
 */
export function resolveUnitTestScript(
  scripts: Record<string, string> | undefined | null,
  override?: string | boolean | null,
): string | null {
  if (override === false || override === 'false') return null

  const defined = scripts ?? {}

  if (typeof override === 'string' && override.trim() !== '' && override !== 'true') {
    const name = override.trim()
    if (!(name in defined)) {
      throw new UnitTestScriptNotFoundError(
        `'nodejs-unit-test-script' is set to '${name}' but package.json defines no such script. ` +
          `Available scripts: ${Object.keys(defined).join(', ') || '(none)'}`,
      )
    }
    return name
  }

  return UNIT_TEST_SCRIPT_CANDIDATES.find((name) => {
    const body = defined[name]
    return typeof body === 'string' && !NPM_PLACEHOLDER_TEST.test(body)
  }) ?? null
}
