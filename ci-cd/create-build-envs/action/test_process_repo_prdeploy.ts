import { assertEquals, assertRejects } from 'common/test_deps.ts'
import { mockCore, mockOutputs, resetMockCore } from 'common/utils/mock-core.ts'
import { setCore, setGithub } from 'common/deps.ts'
import { run } from './3_process_repo_prdeploy.ts'

setCore(mockCore)

// Utility to set environment variables for tests
function setEnvVars(envVars: { [key: string]: string }) {
  for (const key in envVars) {
    Deno.env.set(key, envVars[key])
  }
}

Deno.test('process_repo_prdeploy - Non PR event', async () => {
  resetMockCore()
  // Set environment for a non-PR event
  setEnvVars({
    'GITHUB_EVENT_NAME': 'push',
    'GITHUB_REF_NAME': 'main',
    'GITHUB_REF': 'main',
  })
  Deno.env.delete('GH_EVENT_NUMBER')

  // Mock github context
  setGithub({
    context: {
      repo: { owner: 'testowner', repo: 'testrepo' },
      ref: 'main',
      eventName: 'push',
      payload: { repository: { default_branch: 'main' } },
      issue: {},
    },
  } as any)

  const inputAppVars = {
    'application-name': 'my-app',
    'pr-deploy-additional-helm-values': JSON.stringify({ key: 'value' }),
  }
  // Override getActionInput through mockCore.getInput
  mockCore.getInput = (name: string) => {
    if (name === 'APPVARS') return JSON.stringify(inputAppVars)
    return ''
  }

  await run()
  const appVars = JSON.parse(mockOutputs['APPVARS'])
  // Expect default k8s names equal to application-name
  assertEquals(appVars['pr-deploy-k8s-application-name'], 'my-app')
  assertEquals(appVars['pr-deploy-k8s-namespace'], 'my-app')
  // Check helm values are transformed to a YAML string (rough check)
  if (typeof appVars['pr-deploy-additional-helm-values'] === 'string') {
    assertEquals(
      appVars['pr-deploy-additional-helm-values'].includes('key: value'),
      true,
    )
  }
})

Deno.test('process_repo_prdeploy - Pull Request Event', async () => {
  resetMockCore()
  // Set environment for a pull_request event
  setEnvVars({
    'GITHUB_EVENT_NAME': 'pull_request',
    'GITHUB_REF_NAME': 'feature-branch',
    'GITHUB_REF': 'main',
    'GH_EVENT_NUMBER': '42',
  })

  // Mock github context
  setGithub({
    context: {
      repo: { owner: 'testowner', repo: 'testrepo' },
      ref: 'feature-branch',
      eventName: 'pull_request',
      issue: { number: 42 },
      payload: { repository: { default_branch: 'main' } },
    },
  } as any)

  const inputAppVars = {
    'application-name': 'my-app',
    'pr-deploy-additional-helm-values': JSON.stringify({ key: 'value' }),
  }
  mockCore.getInput = (name: string) => {
    if (name === 'APPVARS') return JSON.stringify(inputAppVars)
    return ''
  }

  await run()
  const appVars = JSON.parse(mockOutputs['APPVARS'])
  // Expect PR deploy names with PR number appended
  assertEquals(appVars['pr-deploy-k8s-application-name'], 'my-app-pr-42')
  assertEquals(appVars['pr-deploy-k8s-namespace'], 'my-app-pr-42')
})

Deno.test('process_repo_prdeploy - Invalid APPVARS Input', async () => {
  resetMockCore()
  setEnvVars({
    'GITHUB_EVENT_NAME': 'push',
    'GITHUB_REF_NAME': 'main',
    'GITHUB_REF': 'main',
  })
  setGithub({
    context: {
      repo: { owner: 'testowner', repo: 'testrepo' },
      ref: 'main',
      eventName: 'push',
      payload: { repository: { default_branch: 'main' } },
      issue: {},
    },
  } as any)
  // Provide an invalid JSON string for APPVARS
  mockCore.getInput = (name: string) => {
    if (name === 'APPVARS') return '{ invalid json }'
    return ''
  }

  await assertRejects(
    async () => {
      await run()
    },
    Error,
    'Failed to parse APPVARS JSON from previous step.',
  )
})

Deno.test('process_repo_prdeploy - YAML Helm Values Input', async () => {
  resetMockCore()
  setEnvVars({
    'GITHUB_EVENT_NAME': 'push',
    'GITHUB_REF_NAME': 'main',
    'GITHUB_REF': 'main',
  })
  setGithub({
    context: {
      repo: { owner: 'testowner', repo: 'testrepo' },
      ref: 'main',
      eventName: 'push',
      payload: { repository: { default_branch: 'main' } },
      issue: {},
    },
  } as any)
  // Provide APPVARS with helm values as a YAML string
  const yamlHelm = `key: value
anotherKey: anotherValue`
  const inputAppVars = {
    'application-name': 'my-app',
    'pr-deploy-additional-helm-values': yamlHelm,
  }
  mockCore.getInput = (name: string) => {
    if (name === 'APPVARS') return JSON.stringify(inputAppVars)
    return ''
  }

  await run()
  const appVars = JSON.parse(mockOutputs['APPVARS'])
  // Verify that helm values are processed accordingly
  if (typeof appVars['pr-deploy-additional-helm-values'] === 'string') {
    assertEquals(
      appVars['pr-deploy-additional-helm-values'].includes('key: value'),
      true,
    )
    assertEquals(
      appVars['pr-deploy-additional-helm-values'].includes(
        'anotherKey: anotherValue',
      ),
      true,
    )
  }
})
