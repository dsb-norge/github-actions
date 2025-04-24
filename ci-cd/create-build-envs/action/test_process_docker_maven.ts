import { assertEquals } from 'common/test_deps.ts'
import { mockCore, mockOutputs, resetMockCore } from 'common/utils/mock-core.ts'
import { setCore, setGithub } from 'common/deps.ts'
import { run } from './4_process_docker_maven.ts'
import { ContextFileReader } from 'common/utils/helpers.ts'

// Replace the real core with the mock
setCore(mockCore)

// Utility to set environment variables for tests
function setEnvVars(envVars: { [key: string]: string }) {
  for (const key in envVars) {
    Deno.env.set(key, envVars[key])
  }
}

Deno.test('process_docker_maven - Non PR event defaults and Maven injection', async () => {
  resetMockCore()
  // Set non-PR event environment
  setEnvVars({
    'GITHUB_EVENT_NAME': 'push',
    'GITHUB_REPOSITORY': 'testowner/testrepo',
  })
  // Clear any PR-specific env
  Deno.env.delete('GH_EVENT_NUMBER')

  // Mock github context
  setGithub({
    context: {
      repo: { owner: 'testowner', repo: 'testrepo' },
      eventName: 'push',
    },
  } as any)

  // APPVARS with Maven user settings that include placeholder and without docker prune keys
  const inputAppVars = {
    // No docker-image-prune values provided so defaults should kick in
    'maven-user-settings-repositories-yml': 'repo: {{ github.repository }}',
  }
  mockCore.getInput = (name: string) => {
    if (name === 'APPVARS') return JSON.stringify(inputAppVars)
    return ''
  }

  await run()
  const appVars = JSON.parse(mockOutputs['APPVARS'])
  // Non PR: expect defaults for docker-image-prune to be set
  assertEquals(appVars['docker-image-prune-keep-min-images'], '10')
  assertEquals(appVars['docker-image-prune-keep-num-days'], '180')
  // Verify Maven injection: resulting YAML should include the repository value
  if (typeof appVars['maven-user-settings-repositories-yml'] === 'string') {
    const result = appVars['maven-user-settings-repositories-yml']
    // A simple check for injected repository
    assertEquals(result.includes('testowner/testrepo'), true)
  }
})

Deno.test('process_docker_maven - PR event defaults', async () => {
  resetMockCore()
  // Set PR event environment
  setEnvVars({
    'GITHUB_EVENT_NAME': 'pull_request',
    'GITHUB_REPOSITORY': 'testowner/testrepo',
  })
  // Provide a GH event number
  Deno.env.set('GH_EVENT_NUMBER', '99')

  // Mock github context
  setGithub({
    context: {
      repo: { owner: 'testowner', repo: 'testrepo' },
      eventName: 'pull_request',
    },
  } as any)

  // Provide minimal APPVARS (non-empty) to avoid parse failure.
  const inputAppVars = { 'application-name': 'test-app' }
  mockCore.getInput = (name: string) => {
    if (name === 'APPVARS') return JSON.stringify(inputAppVars)
    return ''
  }

  await run()
  const appVars = JSON.parse(mockOutputs['APPVARS'])
  // PR event: default values for prune should be different
  assertEquals(appVars['docker-image-prune-keep-min-images'], '5')
  assertEquals(appVars['docker-image-prune-keep-num-days'], '0')
})

Deno.test('process_docker_maven - Maven extra envs from github', async () => {
  resetMockCore()
  // Set non-PR environment for consistency
  setEnvVars({
    'GITHUB_EVENT_NAME': 'push',
    'GITHUB_REPOSITORY': 'testowner/testrepo',
  })

  // Mock github context
  setGithub({
    context: {
      repo: { owner: 'testowner', repo: 'testrepo' },
      eventName: 'push',
      event_name: 'push',
    },
  } as any)

  // Override ContextFileReader functions for testing, including GITHUB_CONTEXT_FILE
  ContextFileReader.getContextFilePath = (envVarName: string) => envVarName
  ContextFileReader.readFile = async <T>(
    filePath: string,
  ): Promise<T | null> => {
    if (filePath === 'GITHUB_CONTEXT_FILE') {
      return { event_name: 'push' } as unknown as T
    } else if (filePath === 'SECRETS_CONTEXT_FILE') {
      return { secret_key: 'secret_value' } as unknown as T
    } else if (filePath === 'VARS_CONTEXT_FILE') {
      return { var_key: 'var_value' } as unknown as T
    }
    return {} as T
  }

  // Provide APPVARS with maven-extra-envs-from-github-yml
  const mavenExtraEnvsYml = `
from-github-context:
  ENV_VAR_FROM_GITHUB: event_name
from-secrets:
  ENV_VAR_FROM_SECRETS: secret_key
from-variables:
  ENV_VAR_FROM_VARS: var_key
`
  const inputAppVars = {
    'maven-extra-envs-from-github-yml': mavenExtraEnvsYml,
  }
  mockCore.getInput = (name: string) => {
    if (name === 'APPVARS') return JSON.stringify(inputAppVars)
    return ''
  }

  await run()
  const appVars = JSON.parse(mockOutputs['APPVARS'])
  // Verify that maven-extra-envs-from-github has been created and the source key removed
  const mavenEnvs = appVars['maven-extra-envs-from-github']
  assertEquals(mavenEnvs['ENV_VAR_FROM_GITHUB'], 'push') // Now injected from github context
  assertEquals(mavenEnvs['ENV_VAR_FROM_SECRETS'], 'secret_value')
  assertEquals(mavenEnvs['ENV_VAR_FROM_VARS'], 'var_value')
  // Confirm the extra YAML key is removed from output
  if ('maven-extra-envs-from-github-yml' in appVars) {
    throw new Error(
      'Source key maven-extra-envs-from-github-yml was not removed',
    )
  }
})
