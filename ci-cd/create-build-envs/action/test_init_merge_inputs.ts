import { assertEquals, assertRejects } from 'common/test_deps.ts'
import { mockCore, mockOutputs, resetMockCore } from 'common/utils/mock-core.ts'
import { setCore } from 'common/deps.ts'
import { run } from './2_init_merge_inputs.ts'
import { ContextFileReader } from 'common/utils/helpers.ts'

// Replace the real core with the mock
setCore(mockCore)

function initContextFileReader<T>(
  pathToReturn?: string,
  fileReturn?: T,
) {
  ContextFileReader.getContextFilePath = (_envVarName: string) => {
    return pathToReturn ? pathToReturn : null
  }
  ContextFileReader.readFile = async <T>(
    _filePath: string,
  ): Promise<T | null> => {
    return fileReturn as T ?? null
  }
}

// Track which secrets were masked
let maskedSecrets: string[] = []

Deno.test('init_merge_inputs - Happy Day with test_input_happy_day.json', async () => {
  resetMockCore()
  maskedSecrets = []
  initContextFileReader('/some/path/to/context.json', {})

  // Override setSecret to track masked values
  mockCore.setSecret = (value: string) => {
    if (value) maskedSecrets.push(value)
  }

  // Read the happy day JSON
  const happyDayJsonString = Deno.readTextFileSync(
    './testdata/test_input_happy_day.json',
  )
  const happyDayJson = JSON.parse(happyDayJsonString)

  // Mock inputs
  mockCore.getInput = (name: string) => {
    const normalizedName = name.toLowerCase().replace(/_/g, '-')
    if (normalizedName === 'app-vars') {
      return JSON.stringify(happyDayJson['app-vars'])
    } else if (normalizedName in happyDayJson) {
      return happyDayJson[normalizedName]
    } else if (normalizedName in happyDayJson['app-vars']) {
      return happyDayJson['app-vars'][normalizedName] as string
    }
    return ''
  }

  await run()
  const appVars = JSON.parse(mockOutputs['APPVARS'])

  // Assert values from happy day JSON
  assertEquals(
    appVars['application-name'],
    happyDayJson['app-vars']['application-name'],
  )
  assertEquals(
    appVars['application-description'],
    happyDayJson['app-vars']['application-description'],
  )
  assertEquals(
    appVars['application-version'],
    happyDayJson['app-vars']['application-version'],
  )
})

Deno.test('init_merge_inputs - Protected Variables Override', async () => {
  resetMockCore()
  maskedSecrets = []
  initContextFileReader('/some/path/to/context.json', {})

  // Override setSecret to track masked values
  mockCore.setSecret = (value: string) => {
    if (value) maskedSecrets.push(value)
  }

  // Include a protected env value from PROTECTED_ENVS set
  const testToken = 'test-protected-token'

  mockCore.getInput = (name: string) => {
    const normalizedName = name.toLowerCase().replace(/_/g, '-')
    switch (normalizedName) {
      case 'app-vars':
        return JSON.stringify({
          'github-repo-token': 'initial-token',
          'acr-password': 'initial-password',
          'non-protected': 'keep-me',
        })
      case 'github-repo-token':
        return testToken
      case 'non-protected':
        return 'should-not-override'
      case 'java-version':
        return 'add-me'
      default:
        return ''
    }
  }

  await run()
  const appVars = JSON.parse(mockOutputs['APPVARS'])

  // Protected env should override existing value
  assertEquals(appVars['github-repo-token'], testToken)

  // Protected env with empty value should not override
  assertEquals(appVars['acr-password'], 'initial-password')

  // Non-protected existing value should not be overridden
  assertEquals(appVars['non-protected'], 'keep-me')

  // New value should be added
  assertEquals(appVars['java-version'], 'add-me')

  // Verify secret was properly masked
  assertEquals(maskedSecrets.includes(testToken), true)
})

Deno.test('init_merge_inputs - Empty, Null, Undefined Values', async () => {
  resetMockCore()
  initContextFileReader('/some/path/to/context.json', {})

  mockCore.getInput = (name: string) => {
    const normalizedName = name.toLowerCase().replace(/_/g, '-')
    switch (normalizedName) {
      case 'app-vars':
        return JSON.stringify({
          'pr-deploy-aks-cluster-name': '',
          'application-vendor': null,
          'undefined-value': undefined,
          'docker-image-prune-keep-num-days': 0,
        })
      case 'pr-deploy-aks-cluster-name':
        return 'should-override-empty'
      case 'application-vendor':
        return 'should-override-null'
      case 'docker-image-registry':
        return 'should-override-undefined'
      case 'docker-image-prune-keep-num-days':
        return 'should-not-override-zero'
      default:
        return ''
    }
  }

  await run()
  const appVars = JSON.parse(mockOutputs['APPVARS'])

  // Empty string should be overridden
  assertEquals(appVars['pr-deploy-aks-cluster-name'], 'should-override-empty')

  // Null should be overridden
  assertEquals(appVars['application-vendor'], 'should-override-null')

  // Undefined should be overridden
  assertEquals(appVars['docker-image-registry'], 'should-override-undefined')

  // Zero is not empty so should not be overridden
  assertEquals(appVars['docker-image-prune-keep-num-days'], 0)
})

Deno.test('init_merge_inputs - Context Files', async () => {
  resetMockCore()
  maskedSecrets = []

  // Mock both context files
  const mockSecrets = {
    'secret-key': 'secret-value',
    'another-secret': 'sensitive-data',
  }
  const mockGithubContext = { event_name: 'push', repository: 'test/repo' }
  const mockVarsContext = { 'env-var': 'env-value' }

  let requestedFile = ''
  ContextFileReader.getContextFilePath = (envVarName: string) => {
    requestedFile = envVarName
    return '/some/path/to/context.json'
  }

  ContextFileReader.readFile = async <T>(
    _filePath: string,
  ): Promise<T | null> => {
    switch (requestedFile) {
      case 'SECRETS_CONTEXT_FILE':
        return mockSecrets as unknown as T
      case 'GITHUB_CONTEXT_FILE':
        return mockGithubContext as unknown as T
      case 'VARS_CONTEXT_FILE':
        return mockVarsContext as unknown as T
      default:
        return null
    }
  }

  // Override setSecret to track masked values
  mockCore.setSecret = (value: string) => {
    if (value) maskedSecrets.push(value)
  }

  mockCore.getInput = (name: string) => {
    const normalizedName = name.toLowerCase().replace(/_/g, '-')
    if (normalizedName === 'app-vars') {
      return JSON.stringify({ 'application-name': 'test-app' })
    }
    return ''
  }

  await run()

  // Verify secrets were properly masked
  assertEquals(maskedSecrets.includes('secret-value'), true)
  assertEquals(maskedSecrets.includes('sensitive-data'), true)
})

Deno.test('init_merge_inputs - Invalid JSON Handling', async () => {
  resetMockCore()
  initContextFileReader('/some/path/to/context.json', {})

  // Provide invalid JSON for app-vars so that tryParseJson returns null and run() fails.
  mockCore.getInput = (name: string) => {
    const normalizedName = name.toLowerCase().replace(/_/g, '-')
    if (normalizedName === 'app-vars') {
      return '{ invalid json }'
    }
    if (normalizedName === 'application-name') {
      return 'fallback-name'
    }
    return ''
  }

  await assertRejects(
    async () => {
      await run()
    },
    Error,
    'Failed to initialize and merge inputs', // The error message from handleError should contain this context.
  )
})

Deno.test('init_merge_inputs - All Empty Inputs', async () => {
  resetMockCore()
  initContextFileReader('/some/path/to/context.json', {})

  // Ensure app-vars is at least a valid JSON object (empty object) rather than an empty string.
  mockCore.getInput = (name: string) => {
    const normalizedName = name.toLowerCase().replace(/_/g, '-')
    if (normalizedName === 'app-vars') {
      return '{}' // Changed from '' to a valid empty JSON string.
    }
    return ''
  }

  await run()
  const appVars = JSON.parse(mockOutputs['APPVARS'])

  // Should result in an empty object with no errors
  assertEquals(Object.keys(appVars).length, 0)
})

Deno.test('init_merge_inputs - Error Handling', async () => {
  resetMockCore()

  // Mock a failure in readContextFromFile
  ContextFileReader.getContextFilePath = () => {
    throw new Error('Context file error')
  }

  mockCore.getInput = (name: string) => {
    const normalizedName = name.toLowerCase().replace(/_/g, '-')
    if (normalizedName === 'app-vars') {
      return JSON.stringify({ 'application-name': 'test-app' })
    }
    return ''
  }

  await assertRejects(
    async () => {
      await run()
    },
    Error,
    'Context file error',
  )
})
