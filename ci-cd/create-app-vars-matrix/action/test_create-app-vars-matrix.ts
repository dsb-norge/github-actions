import { assertEquals, fail } from 'common/test_deps.ts'
import { setCore } from 'common/deps.ts'
import * as convert from './1_convert.ts'
import * as validateInput from './2_validate-input.ts'
import * as detectType from './3_detect-type.ts'
import * as getAppMetaSrc from './4_get-app-meta.ts'
import * as createAppVarsMatrixSrc from './7_create-app-vars-matrix.ts'
import * as makeMatrixCompatibleSrc from './8_make-matrix-compatible.ts'
import * as validateResultSrc from './6_validate-result.ts'
import { mockCore } from 'common/utils/mock-core.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'

// Replace the real core with the mock
setCore(mockCore)

Deno.test('IT - create-app-vars-matrix - Happy Day', async () => {
  const staticDate = new Temporal.PlainDateTime(2024, 1, 1, 12, 0)
  mockCore.yamlPath = 'test_input_happy_day.yml'

  // Call the main function of each module
  try {
    convert.main()
    validateInput.validateInput()
    await detectType.detectType()
    await getAppMetaSrc.getAppMeta()
    validateResultSrc.validateResult()
    createAppVarsMatrixSrc.createAppVarsMatrix(staticDate)
    makeMatrixCompatibleSrc.makeMatrixCompatible()
  } catch (error) {
    console.error('Error during test:', error)
  }

  // Read the expected JSON output
  let expectedJson: AppVars[] = []
  try {
    expectedJson = JSON.parse(Deno.readTextFileSync(
      './testdata/results/happy_day.json',
    ))
  } catch (error) {
    console.error('Error reading expected JSON file:', error)
  }

  // Assert that the output matches the expected JSON
  const actualJson = mockCore.getOutputAppVars()
  assertEquals(actualJson, expectedJson)
})

Deno.test('IT - create-app-vars-matrix - Minimal', async () => {
  const staticDate = new Temporal.PlainDateTime(2024, 1, 1, 12, 0)
  mockCore.yamlPath = 'test_input_minimal.yml'

  // Call the main function of each module
  try {
    convert.main()
    validateInput.validateInput()
    await detectType.detectType()
    await getAppMetaSrc.getAppMeta()
    validateResultSrc.validateResult()
    createAppVarsMatrixSrc.createAppVarsMatrix(staticDate)
    makeMatrixCompatibleSrc.makeMatrixCompatible()
  } catch (error) {
    console.error('Error during test:', error)
  }

  // Read the expected JSON output
  let expectedJson: AppVars[] = []
  try {
    expectedJson = JSON.parse(Deno.readTextFileSync(
      './testdata/results/minimal.json',
    ))
  } catch (error) {
    console.error('Error reading expected JSON file:', error)
  }

  // Assert that the output matches the expected JSON
  const actualJson = mockCore.getOutputAppVars()
  assertEquals(actualJson, expectedJson)
})

Deno.test('IT - create-app-vars-matrix - Failing src dir', async () => {
  const staticDate = new Temporal.PlainDateTime(2024, 1, 1, 12, 0)
  mockCore.yamlPath = 'test_input_fail_src_dir.yml'

  // Call the main function of each module
  try {
    convert.main()
    validateInput.validateInput()
    await detectType.detectType()
    await getAppMetaSrc.getAppMeta()
    validateResultSrc.validateResult()
    createAppVarsMatrixSrc.createAppVarsMatrix(staticDate)
    makeMatrixCompatibleSrc.makeMatrixCompatible()
    fail('Expected error not thrown')
  } catch {
    // Expected error
  }
})
