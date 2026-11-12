import { assertEquals, assertRejects } from 'common/test_deps.ts'
import { mockCore, mockOutputs, resetMockCore } from 'common/utils/mock-core.ts'
import { setCore } from 'common/deps.ts'
import { isEnabledUnlessOptedOut, isOptedIn, run } from './6_finalize_outputs.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'

// Replace the real core with the mock
setCore(mockCore)

async function runWithAppVars(appVars: AppVars): Promise<AppVars> {
  return (await runWithAppVarsBothOutputs(appVars)).json
}

/** The full 'json' output, and the non-secret JSON file the later jobs read through the build-envs artifact. */
async function runWithAppVarsBothOutputs(appVars: AppVars): Promise<{ json: AppVars; withoutSecrets: AppVars }> {
  resetMockCore()
  const workspace = await Deno.makeTempDir()
  Deno.env.set('GITHUB_WORKSPACE', workspace)
  mockCore.outputs['APPVARS'] = JSON.stringify(appVars)
  try {
    await run()
    return {
      json: JSON.parse(mockOutputs['json']) as AppVars,
      withoutSecrets: JSON.parse(await Deno.readTextFile(mockOutputs['json-without-secrets-path'])) as AppVars,
    }
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

Deno.test('finalize_outputs - isOptedIn defaults to off and accepts both forms', () => {
  assertEquals(isOptedIn(undefined), false)
  assertEquals(isOptedIn(null), false)
  assertEquals(isOptedIn(''), false)
  assertEquals(isOptedIn(false), false)
  assertEquals(isOptedIn('false'), false)
  assertEquals(isOptedIn('yes'), false)
  assertEquals(isOptedIn(true), true)
  assertEquals(isOptedIn('true'), true)
  assertEquals(isOptedIn('True'), true)
})

Deno.test('finalize_outputs - static-deploy-skip is always present as a boolean, also for the deploy-to-static job', async () => {
  // The deploy-to-static job only sees the non-secret JSON, through the build-envs artifact.
  const defaults = await runWithAppVarsBothOutputs({ 'application-name': 'test-app' })
  assertEquals(defaults.json['static-deploy-skip'], false)
  assertEquals(defaults.withoutSecrets['static-deploy-skip'], false)

  for (const value of [true, 'true']) {
    const skipped = await runWithAppVarsBothOutputs({ 'application-name': 'test-app', 'static-deploy-skip': value })
    assertEquals(skipped.json['static-deploy-skip'], true)
    assertEquals(skipped.withoutSecrets['static-deploy-skip'], true)
  }
})

Deno.test('finalize_outputs - pr-image-build is always present as a boolean, also for the pr-images job', async () => {
  // The pr-images job only sees the non-secret JSON, through the build-envs artifact.
  const defaults = await runWithAppVarsBothOutputs({ 'application-name': 'test-app' })
  assertEquals(defaults.json['pr-image-build'], false)
  assertEquals(defaults.withoutSecrets['pr-image-build'], false)

  for (const value of [true, 'true']) {
    const built = await runWithAppVarsBothOutputs({ 'application-name': 'test-app', 'pr-image-build': value })
    assertEquals(built.json['pr-image-build'], true)
    assertEquals(built.withoutSecrets['pr-image-build'], true)
  }
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
