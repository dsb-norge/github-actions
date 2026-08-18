import { assertEquals, assertStringIncludes } from 'common/test_deps.ts'
import { resolveUnitTestScript, UnitTestScriptNotFoundError } from './unit-tests.ts'

Deno.test('resolveUnitTestScript: returns null when the project defines no scripts', () => {
  assertEquals(resolveUnitTestScript(undefined), null)
  assertEquals(resolveUnitTestScript({}), null)
})

Deno.test('resolveUnitTestScript: returns null when no script looks like unit tests', () => {
  assertEquals(resolveUnitTestScript({ build: 'vite build', lint: 'eslint .' }), null)
})

Deno.test('resolveUnitTestScript: prefers the CI script over the other candidates', () => {
  // Where a project has both, test:ci is the one written to run unattended.
  const scripts = { 'test': 'vitest run', 'test:ci': 'vitest run --reporter=junit', 'test:unit': 'vitest' }
  assertEquals(resolveUnitTestScript(scripts), 'test:ci')
})

Deno.test('resolveUnitTestScript: prefers test:unit over plain test', () => {
  assertEquals(resolveUnitTestScript({ 'test': 'vitest', 'test:unit': 'vitest run' }), 'test:unit')
})

Deno.test('resolveUnitTestScript: falls back to plain test', () => {
  assertEquals(resolveUnitTestScript({ test: 'vitest run' }), 'test')
})

Deno.test('resolveUnitTestScript: ignores the npm init placeholder test script', () => {
  // `npm init` writes this; running it would fail every build that never added tests.
  assertEquals(resolveUnitTestScript({ test: 'echo "Error: no test specified" && exit 1' }), null)
})

Deno.test('resolveUnitTestScript: honours an explicit script name', () => {
  assertEquals(resolveUnitTestScript({ 'verify': 'vitest run' }, 'verify'), 'verify')
})

Deno.test('resolveUnitTestScript: throws when the configured script does not exist', () => {
  let caught: unknown = null
  try {
    resolveUnitTestScript({ build: 'vite build' }, 'verify')
  } catch (error) {
    caught = error
  }

  assertEquals(caught instanceof UnitTestScriptNotFoundError, true)
  assertStringIncludes((caught as Error).message, "'verify'")
  // The message lists what is available, so the fix is obvious from the CI log.
  assertStringIncludes((caught as Error).message, 'build')
})

Deno.test('resolveUnitTestScript: false disables detection for a project that has a test script', () => {
  assertEquals(resolveUnitTestScript({ test: 'vitest run' }, false), null)
  assertEquals(resolveUnitTestScript({ test: 'vitest run' }, 'false'), null)
})

Deno.test('resolveUnitTestScript: true keeps auto-detection rather than naming a script', () => {
  assertEquals(resolveUnitTestScript({ 'test:unit': 'vitest run' }, 'true'), 'test:unit')
})

Deno.test('resolveUnitTestScript: an override reaches a script the candidates would not pick', () => {
  // e.g. a repo whose test:ci also runs e2e, with unit tests split out under another name.
  const scripts = { 'test:ci': 'npm run test:unit && npm run test:e2e', 'test:unit:ci': 'vitest run' }
  assertEquals(resolveUnitTestScript(scripts), 'test:ci')
  assertEquals(resolveUnitTestScript(scripts, 'test:unit:ci'), 'test:unit:ci')
})
