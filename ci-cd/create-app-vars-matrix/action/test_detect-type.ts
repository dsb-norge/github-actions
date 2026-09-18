import { assertEquals, fail } from 'common/test_deps.ts'
import { detectApplicationType } from './3_detect-type.ts' // Import the core logic
import { AppVars } from 'common/interfaces/application-variables.ts'

Deno.test('detect-type - detects spring-boot', async () => {
  const appVars: AppVars[] = [
    {
      'application-name': 'my-app',
      'application-source-path': './testdata/spring-boot-app', // Create a test directory with a pom.xml
    } as AppVars,
  ]

  await detectApplicationType(appVars) // Call the core logic

  assertEquals(appVars[0]['application-type'], 'spring-boot')
})

Deno.test('detect-type - detects vue', async () => {
  const appVars: AppVars[] = [
    {
      'application-name': 'my-vue-app',
      'application-source-path': './testdata/vue-app', // Create a test directory with a package.json
    } as AppVars,
  ]

  await detectApplicationType(appVars)

  assertEquals(appVars[0]['application-type'], 'vue')
})

Deno.test('detect-type - detects deno from deno.json', async () => {
  const appVars: AppVars[] = [
    {
      'application-name': 'my-deno-app',
      'application-source-path': './testdata/deno-app', // Test directory with a deno.json
    } as AppVars,
  ]

  await detectApplicationType(appVars)

  assertEquals(appVars[0]['application-type'], 'deno')
})

Deno.test('detect-type - detects deno from deno.jsonc', async () => {
  const appVars: AppVars[] = [
    {
      'application-name': 'my-deno-jsonc-app',
      'application-source-path': './testdata/deno-app-jsonc', // Test directory with a deno.jsonc
    } as AppVars,
  ]

  await detectApplicationType(appVars)

  assertEquals(appVars[0]['application-type'], 'deno')
})

Deno.test('detect-type - no type detected', async () => {
  const appVars: AppVars[] = [
    {
      'application-name': 'my-unknown-app',
      'application-source-path': './testdata/unknown-app', // Create a test directory with neither
    } as AppVars,
  ]

  try {
    await detectApplicationType(appVars)
    fail('Expected an error to be thrown')
  } catch {
    // Expected to throw an error
  }
})
