import { assert, assertEquals, assertRejects, fail } from 'common/test_deps.ts'
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

Deno.test('get-app-meta - python metadata extraction fails on circular dependency-group include', async () => {
  setAppVars([
    {
      'application-name': 'my-python-app-cycle',
      'application-source-path': './testdata/python-app-cycle',
      'application-type': 'python',
    } as AppVars,
  ])

  await assertRejects(
    () => getAppMeta(),
    Error,
    'Circular dependency-group include detected',
  )
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

Deno.test('get-app-meta - python optional and dependency-groups metadata extraction', async () => {
  setAppVars([
    {
      'application-name': 'my-python-app',
      'application-source-path': './testdata/python-app',
      'application-type': 'python',
    } as AppVars,
  ])

  await getAppMeta()

  const outputAppVars = mockCore.getOutputAppVars()
  const dependencies = outputAppVars[0]['application-dependencies'] ?? []

  assertEquals(outputAppVars[0]['application-description'], 'Python test application')
  assertEquals(outputAppVars[0]['python-version'], '>=3.12')
  assert(dependencies.some((dependency) => dependency.name === 'fastapi' && dependency.operator === '>=' && dependency.version === '0.111.0'))
  assert(dependencies.some((dependency) => dependency.name === 'fastapi' && dependency.operator === '<' && dependency.version === '1.0.0'))
  assert(dependencies.some((dependency) => dependency.name === 'ruff' && dependency.group === 'dev' && dependency.operator === '==' && dependency.version === '0.6.9'))
  assert(dependencies.some((dependency) => dependency.name === 'ruff' && dependency.group === 'lint' && dependency.operator === '>=' && dependency.version === '0.6.0'))
  assert(dependencies.some((dependency) => dependency.name === 'ruff' && dependency.group === 'test' && dependency.operator === '>=' && dependency.version === '0.6.0'))
  assert(dependencies.some((dependency) => dependency.name === 'pytest' && dependency.group === 'test' && dependency.operator === '>=' && dependency.version === '8.3.0'))
})
