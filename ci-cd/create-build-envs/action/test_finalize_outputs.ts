import { assertEquals, assertRejects } from 'common/test_deps.ts'
import { mockCore, mockOutputs, resetMockCore } from 'common/utils/mock-core.ts'
import { setCore } from 'common/deps.ts'
import { isEnabledUnlessOptedOut, run } from './6_finalize_outputs.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'

// Replace the real core with the mock
setCore(mockCore)

async function runWithAppVars(appVars: AppVars): Promise<AppVars> {
  resetMockCore()
  const workspace = await Deno.makeTempDir()
  Deno.env.set('GITHUB_WORKSPACE', workspace)
  mockCore.outputs['APPVARS'] = JSON.stringify(appVars)
  try {
    await run()
    return JSON.parse(mockOutputs['json']) as AppVars
  } finally {
    await Deno.remove(workspace, { recursive: true })
  }
}

Deno.test('finalize_outputs - isEnabledUnlessOptedOut defaults to enabled and accepts both forms', () => {
  assertEquals(isEnabledUnlessOptedOut(undefined), true)
  assertEquals(isEnabledUnlessOptedOut(null), true)
  assertEquals(isEnabledUnlessOptedOut(true), true)
  assertEquals(isEnabledUnlessOptedOut('true'), true)
  assertEquals(isEnabledUnlessOptedOut(false), false)
  assertEquals(isEnabledUnlessOptedOut('false'), false)
  assertEquals(isEnabledUnlessOptedOut('False'), false)
})

Deno.test('finalize_outputs - codeql-enabled is always present as a boolean in the json output', async () => {
  assertEquals((await runWithAppVars({ 'application-name': 'test-app' }))['codeql-enabled'], true)
  assertEquals((await runWithAppVars({ 'application-name': 'test-app', 'codeql-enabled': false }))['codeql-enabled'], false)
  assertEquals((await runWithAppVars({ 'application-name': 'test-app', 'codeql-enabled': 'false' }))['codeql-enabled'], false)
  assertEquals((await runWithAppVars({ 'application-name': 'test-app', 'codeql-enabled': true }))['codeql-enabled'], true)
})

Deno.test('finalize_outputs - detekt-enabled and coverage-enabled default to true and can be opted out independently', async () => {
  const defaults = await runWithAppVars({ 'application-name': 'test-app' })
  assertEquals(defaults['detekt-enabled'], true)
  assertEquals(defaults['coverage-enabled'], true)

  const optedOut = await runWithAppVars({ 'application-name': 'test-app', 'detekt-enabled': 'false', 'coverage-enabled': false })
  assertEquals(optedOut['detekt-enabled'], false)
  assertEquals(optedOut['coverage-enabled'], false)
  assertEquals(optedOut['codeql-enabled'], true)
})

Deno.test('finalize_outputs - an appVars object without keys is still rejected', async () => {
  resetMockCore()
  mockCore.outputs['APPVARS'] = '{}'

  await assertRejects(
    async () => {
      await run()
    },
    Error,
    'Failed to parse APPVARS JSON from previous step.',
  )
})
