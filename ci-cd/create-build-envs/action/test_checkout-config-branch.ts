import { assertEquals, assertRejects, fail } from 'common/test_deps.ts'
import { mockCore, mockOutputs, resetMockCore } from 'common/utils/mock-core.ts'
import { setCore } from 'common/deps.ts'
import { run } from './1_checkout-config-branch.ts'

// Replace the real core with the mock
setCore(mockCore)

// Mock Deno.Command to avoid actual git commands
const mockCommandOutput = {
  success: true,
  code: 0,
  stdout: new Uint8Array(),
  stderr: new Uint8Array(),
}

const mockFailedCommandOutput = {
  success: false,
  code: 1,
  stdout: new Uint8Array(),
  stderr: new Uint8Array(),
}

// Mock Deno.remove to avoid actual file removal
let _removeCalled = false
const mockDenoRemove = () => {
  _removeCalled = true
}

Deno.test('checkout-config-branch - Successful clone', async () => {
  resetMockCore()
  _removeCalled = false
  const originalDenoCommand = Deno.Command
  const originalDenoRemove = Deno.remove

  // Mock Deno.Command
  Deno.Command = class {
    constructor() {}
    output = () => mockCommandOutput
  } as never

  // Mock Deno.remove
  Deno.remove = mockDenoRemove as never

  mockCore.getInput = (name: string) => {
    if (name === 'app-config-repo') return 'test/repo'
    if (name === 'pr-deploy-app-config-branch') return 'test-branch'
    return ''
  }

  try {
    await run()
    assertEquals(mockOutputs['ref'], 'test-branch')
  } finally {
    // Restore original Deno.Command and Deno.remove
    Deno.Command = originalDenoCommand
    Deno.remove = originalDenoRemove
  }
})

Deno.test('checkout-config-branch - Failed clone', async () => {
  resetMockCore()
  _removeCalled = false
  const originalDenoCommand = Deno.Command
  const originalDenoRemove = Deno.remove

  // Mock Deno.Command to simulate a failed clone
  Deno.Command = class {
    constructor() {}
    output = () => mockFailedCommandOutput
  } as never

  // Mock Deno.remove
  Deno.remove = mockDenoRemove as never

  mockCore.getInput = (name: string) => {
    if (name === 'app-config-repo') return 'test/repo'
    if (name === 'pr-deploy-app-config-branch') return 'test-branch'
    return ''
  }

  try {
    await run()
    assertEquals(mockOutputs['ref'], 'main')
  } finally {
    // Restore original Deno.Command and Deno.remove
    Deno.Command = originalDenoCommand
    Deno.remove = originalDenoRemove
  }
})
