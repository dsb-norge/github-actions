import { assertEquals, assertRejects } from 'common/test_deps.ts'
import { mockCore, mockOutputs, resetMockCore } from 'common/utils/mock-core.ts'
import { setCore } from 'common/deps.ts'
import { isCodeqlEnabled, run } from './6_finalize_outputs.ts'
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

Deno.test('finalize_outputs - isCodeqlEnabled defaults to enabled and accepts both forms', () => {
  assertEquals(isCodeqlEnabled(undefined), true)
  assertEquals(isCodeqlEnabled(null), true)
  assertEquals(isCodeqlEnabled(true), true)
  assertEquals(isCodeqlEnabled('true'), true)
  assertEquals(isCodeqlEnabled(false), false)
  assertEquals(isCodeqlEnabled('false'), false)
  assertEquals(isCodeqlEnabled('False'), false)
})

Deno.test('finalize_outputs - codeql-enabled is always present as a boolean in the json output', async () => {
  assertEquals((await runWithAppVars({ 'application-name': 'test-app' }))['codeql-enabled'], true)
  assertEquals((await runWithAppVars({ 'application-name': 'test-app', 'codeql-enabled': false }))['codeql-enabled'], false)
  assertEquals((await runWithAppVars({ 'application-name': 'test-app', 'codeql-enabled': 'false' }))['codeql-enabled'], false)
  assertEquals((await runWithAppVars({ 'application-name': 'test-app', 'codeql-enabled': true }))['codeql-enabled'], true)
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
