import { assertEquals } from 'common/test_deps.ts'
import { mockCore, resetMockCore } from 'common/utils/mock-core.ts'
import { github, setCore, setGithub } from 'common/deps.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'
import { detectChanges } from './5_detect-changes.ts'

// Replace the real core with the mock
setCore(mockCore)

// Store original Deno.Command to restore after tests
const originalCommand = Deno.Command
let mockGitOutput = ''

interface MockCommand {
  spawn: () => {
    stdout: ReadableStream<Uint8Array>
    stderr: ReadableStream<Uint8Array>
    status: Promise<Deno.CommandStatus>
  }
  output: () => Promise<{
    code: number
    stdout: Uint8Array
    stderr: Uint8Array
    success: boolean
    signal: null
  }>
  outputSync: () => never
}

function mockCommand(_command: string, options: Deno.CommandOptions): MockCommand {
  return {
    spawn: () => {
      // Create readable streams with the mock data
      const stdoutBytes = new TextEncoder().encode(mockGitOutput)
      const stderrBytes = new TextEncoder().encode('')

      return {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(stdoutBytes)
            controller.close()
          },
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.enqueue(stderrBytes)
            controller.close()
          },
        }),
        status: Promise.resolve({
          code: options.args?.includes('describe') ? 128 : 0,
          success: !options.args?.includes('describe'),
          signal: null,
        }),
      }
    },
    output: () => {
      if (options.args?.includes('diff')) {
        return Promise.resolve({
          code: 0,
          stdout: new TextEncoder().encode(mockGitOutput),
          stderr: new TextEncoder().encode(''),
          success: true,
          signal: null,
        })
      }
      if (options.args?.includes('describe')) {
        return Promise.resolve({
          code: 128,
          stdout: new TextEncoder().encode(''),
          stderr: new TextEncoder().encode('fatal: Not a valid object name sha1'),
          success: false,
          signal: null,
        })
      }
      return Promise.resolve({
        code: 0,
        stdout: new TextEncoder().encode(''),
        stderr: new TextEncoder().encode(''),
        success: true,
        signal: null,
      })
    },
    outputSync: () => {
      throw new Error('outputSync() not implemented in mock')
    },
  }
} // Apply the mock

;(Deno as unknown as { Command: unknown }).Command = mockCommand

// Helper function to set up common test mocks
function setupTestMocks(appVars: AppVars[]) {
  resetMockCore()

  // Mock inputs and outputs
  mockCore.getInput = (name: string) => {
    if (name === 'APPVARS') return JSON.stringify(appVars)
    return ''
  }
  mockCore.setOutput = (name: string, value: string) => {
    if (name === 'APPVARS') mockCore.outputs['APPVARS'] = value
  }

  // Set up mock GitHub context
  setGithub(
    {
      context: {
        eventName: 'push',
        payload: {
          before: 'sha1',
          after: 'sha2',
        },
      },
    } as unknown as typeof github.context,
  )
}

// Restore original Deno.Command after all tests
globalThis.addEventListener('unload', () => {
  ;(Deno as unknown as { Command: unknown }).Command = originalCommand
})

Deno.test({
  name: 'detectChanges - should detect changes in application source path',
  fn: async () => {
    // Setup
    mockGitOutput = 'src/app1/file.js'

    const appVars: AppVars[] = [
      {
        'application-source-path': 'src/app1',
        name: 'test-app',
        'has-changes': false,
      } as unknown as AppVars,
    ]

    setupTestMocks(appVars)

    // Act
    await detectChanges()

    // Assert
    const outputAppVars = JSON.parse(mockCore.outputs['APPVARS'] || '[]') as AppVars[]
    assertEquals(outputAppVars[0]['has-changes'], true)
  },
})

Deno.test({
  name: 'detectChanges - should detect changes via additional watch files (comma-separated string)',
  fn: async () => {
    // Setup
    mockGitOutput = 'config/app.yaml'

    const appVars: AppVars[] = [
      {
        'application-source-path': 'src/app1',
        'application-additional-watch-files': 'config/app.yaml,docs/README.md',
        name: 'test-app',
        'has-changes': false,
      } as unknown as AppVars,
    ]

    setupTestMocks(appVars)

    // Act
    await detectChanges()

    // Assert
    const outputAppVars = JSON.parse(mockCore.outputs['APPVARS'] || '[]') as AppVars[]
    assertEquals(outputAppVars[0]['has-changes'], true)
  },
})

Deno.test({
  name: 'detectChanges - should detect changes via additional watch files (string array)',
  fn: async () => {
    // Setup
    mockGitOutput = 'docs/README.md'

    const appVars: AppVars[] = [
      {
        'application-source-path': 'src/app1',
        'application-additional-watch-files': ['config/app.yaml', 'docs/README.md'],
        name: 'test-app',
        'has-changes': false,
      } as unknown as AppVars,
    ]

    setupTestMocks(appVars)

    // Act
    await detectChanges()

    // Assert
    const outputAppVars = JSON.parse(mockCore.outputs['APPVARS'] || '[]') as AppVars[]
    assertEquals(outputAppVars[0]['has-changes'], true)
  },
})

Deno.test({
  name: 'detectChanges - should not detect changes when no files changed',
  fn: async () => {
    // Setup
    mockGitOutput = 'other/unrelated.txt'

    const appVars: AppVars[] = [
      {
        'application-source-path': 'src/app1',
        name: 'test-app',
        'has-changes': false,
      } as unknown as AppVars,
    ]

    setupTestMocks(appVars)

    // Act
    await detectChanges()

    // Assert
    const outputAppVars = JSON.parse(mockCore.outputs['APPVARS'] || '[]') as AppVars[]
    assertEquals(outputAppVars[0]['has-changes'], false)
  },
})

Deno.test({
  name: "detectChanges - should not detect changes when watch files don't match",
  fn: async () => {
    // Setup
    mockGitOutput = 'other/unrelated.txt'

    const appVars: AppVars[] = [
      {
        'application-source-path': 'src/app1',
        'application-additional-watch-files': 'config/app.yaml,docs/README.md',
        name: 'test-app',
        'has-changes': false,
      } as unknown as AppVars,
    ]

    setupTestMocks(appVars)

    // Act
    await detectChanges()

    // Assert
    const outputAppVars = JSON.parse(mockCore.outputs['APPVARS'] || '[]') as AppVars[]
    assertEquals(outputAppVars[0]['has-changes'], false)
  },
})

Deno.test({
  name: 'detectChanges - should handle multiple watch files',
  fn: async () => {
    // Setup
    mockGitOutput = 'backend/config.yaml'

    const appVars: AppVars[] = [
      {
        'application-source-path': 'src/app1',
        'application-additional-watch-files': ['config/app.yaml', 'backend/config.yaml', 'docs/README.md'],
        name: 'test-app',
        'has-changes': false,
      } as unknown as AppVars,
    ]

    setupTestMocks(appVars)

    // Act
    await detectChanges()

    // Assert
    const outputAppVars = JSON.parse(mockCore.outputs['APPVARS'] || '[]') as AppVars[]
    assertEquals(outputAppVars[0]['has-changes'], true)
  },
})
