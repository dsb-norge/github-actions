import { assertEquals, fail } from 'common/test_deps.ts'
import { getAppMeta } from './4_get-app-meta.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'
import { setCore } from 'common/deps.ts'
import { mockCore, setAppVars } from 'common/utils/mock-core.ts'

// Replace the real core with the mock
setCore(mockCore)

Deno.test('get-app-meta - spring-boot metadata extraction', async () => {
  setAppVars([
    {
      'application-name': 'my-spring-app',
      'application-source-path': './testdata/spring-boot-app',
      'application-type': 'spring-boot',
    } as AppVars,
  ])

  await getAppMeta()

  const outputAppVars = mockCore.getOutputAppVars()

  assertEquals(
    outputAppVars[0]['application-description'],
    "DSB's spring boot test application for Kubernetes.",
  )
  assertEquals(outputAppVars[0]['java-version'], '21')
})

Deno.test('get-app-meta - vue metadata extraction', async () => {
  setAppVars([
    {
      'application-name': 'my-vue-app',
      'application-source-path': './testdata/vue-app',
      'application-type': 'vue',
    } as AppVars,
  ])

  await getAppMeta()

  const outputAppVars = mockCore.getOutputAppVars()

  assertEquals(
    outputAppVars[0]['application-description'],
    'Frontend app for testapplication',
  )
  assertEquals(outputAppVars[0]['nodejs-version'], '20')
})

Deno.test('get-app-meta - no source path defined, use default', async () => {
  setAppVars([
    {
      'application-name': 'my-default-app',
      'application-type': 'vue',
    } as AppVars,
  ])

  try {
    await getAppMeta()
    fail('Expected an error to be thrown')
  } catch {
    // Expected to throw an error
  }
})

Deno.test('get-app-meta - source path does not exist', async () => {
  setAppVars([
    {
      'application-name': 'my-missing-app',
      'application-source-path': './testdata/missing-app',
      'application-type': 'vue',
    } as AppVars,
  ])

  try {
    await getAppMeta()
    fail('Expected an error to be thrown')
  } catch {
    // Expected to throw an error
  }
})

Deno.test('get-app-meta - source file is empty', async () => {
  setAppVars([
    {
      'application-name': 'my-empty-app',
      'application-source-path': './testdata/empty-app/package.json',
      'application-type': 'vue',
    } as AppVars,
  ])

  try {
    await getAppMeta()
    fail('Expected an error to be thrown')
  } catch {
    // Expected to throw an error
  }
})

Deno.test('get-app-meta - unknown application type', async () => {
  setAppVars([
    {
      'application-name': 'my-unknown-app',
      'application-source-path': './testdata/unknown-app',
      'application-type': 'unknown',
    } as AppVars,
  ])

  try {
    await getAppMeta()
    fail('Expected an error to be thrown')
  } catch {
    // Expected to throw an error
  }
})

Deno.test('get-app-meta - missing java version', async () => {
  setAppVars([
    {
      'application-name': 'my-missing-java-app',
      'application-source-path': './testdata/missing-java-app',
      'application-type': 'spring-boot',
    } as AppVars,
  ])

  try {
    await getAppMeta()
    fail('Expected an error to be thrown')
  } catch {
    // Expected to throw an error
  }
})

Deno.test('get-app-meta - APPVARS is an empty array', async () => {
  setAppVars([])

  try {
    await getAppMeta()
    fail('Expected an error to be thrown')
  } catch {
    // Expected to throw an error
  }
})
