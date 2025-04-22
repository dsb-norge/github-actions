import { assertEquals, assertStringIncludes } from 'common/test_deps.ts'
import { mockCore, mockOutputs, resetMockCore } from 'common/utils/mock-core.ts'
import { setCore } from 'common/deps.ts'
import { run } from './5_process_cache.ts'
import { FileUtils } from 'common/utils/helpers.ts'
import { join } from 'common/deps.ts'

// Replace the real core with the mock
setCore(mockCore)

FileUtils.getHashOfFile = async (_: string) => {
  // Simulate a hash function that always returns the same value
  return 'deadbeef'
}

// Utility function to set environment variables
function setEnvVars(envs: { [key: string]: string }) {
  for (const key in envs) {
    Deno.env.set(key, envs[key])
  }
}

// Save original Deno.stat and provide helpers to override & restore
const originalStat = Deno.stat
function overrideStat(simulated: (path: string) => Promise<{ isFile: boolean; isDirectory: boolean }>) {
  Deno.stat = simulated as typeof Deno.stat
}
function restoreStat() {
  Deno.stat = originalStat
}

// Helper to load test JSON input from testdata folder
function loadTestJson(filename: string): string {
  return Deno.readTextFileSync(`./testdata/${filename}`)
}

Deno.test('process_cache - Vue app with package-lock.json', async () => {
  resetMockCore()
  setEnvVars({
    'GITHUB_EVENT_NAME': 'push',
    'RUNNER_OS': 'Linux',
  })
  // Simulate that package-lock.json exists under /frontend
  overrideStat(async (path: string) => {
    if (path.includes('package-lock.json')) {
      return { isFile: true, isDirectory: false }
    }
    if (path.includes('/frontend')) {
      return { isFile: false, isDirectory: true }
    }
    throw new Deno.errors.NotFound()
  })

  // Load and modify input JSON for Vue app test
  const inputJson = loadTestJson('test_cache_src_path_pkg_vue_app.json')
  const input = JSON.parse(inputJson)
  input['app-vars']['github-dependencies-cache-enabled'] = 'true'
  mockCore.getInput = (name: string) => {
    if (name === 'APPVARS') return JSON.stringify(input['app-vars'])
    return ''
  }

  await run()
  const appVars = JSON.parse(mockOutputs['APPVARS'])
  // Expect cache type "npm" and hash "deadbeef"
  assertStringIncludes(appVars['github-dependencies-cache-key'], 'linux-npm-')
  assertStringIncludes(appVars['github-dependencies-cache-key'], 'deadbeef')
  restoreStat()
})

Deno.test('process_cache - Spring Boot app with pom.xml', async () => {
  resetMockCore()
  setEnvVars({
    'GITHUB_EVENT_NAME': 'push',
    'RUNNER_OS': 'Linux',
  })
  overrideStat(async (path: string) => {
    if (path.includes('pom.xml')) {
      return { isFile: true, isDirectory: false }
    }
    if (path.includes('/backend')) {
      return { isFile: false, isDirectory: true }
    }
    throw new Deno.errors.NotFound()
  })
  const inputJson = loadTestJson('test_cache_src_path_pom_sb_app.json')
  const input = JSON.parse(inputJson)
  input['app-vars']['github-dependencies-cache-enabled'] = 'true'
  mockCore.getInput = (name: string) => {
    if (name === 'APPVARS') return JSON.stringify(input['app-vars'])
    return ''
  }
  await run()
  const appVars = JSON.parse(mockOutputs['APPVARS'])
  // Assert expected cache key contains "linux-maven-" and the fixed hash:
  assertStringIncludes(appVars['github-dependencies-cache-key'], 'linux-maven-')
  assertStringIncludes(appVars['github-dependencies-cache-key'], 'deadbeef')
  // Assert restore keys is a non-empty string and contains candidate keys split by \n
  assertEquals(typeof appVars['github-dependencies-cache-restore-keys'], 'string')
  const restoreKeys = appVars['github-dependencies-cache-restore-keys'].split('\n')
  // Expect at least three candidate keys
  assertEquals(restoreKeys.length >= 3, true)
  // Assert that the pr-base key is defined (for non-PR events it may be a fallback)
  assertEquals(typeof appVars['github-dependencies-cache-pr-base-key'], 'string')
  restoreStat()
})

Deno.test('process_cache - Non-existing source path', async () => {
  resetMockCore()
  setEnvVars({
    'GITHUB_EVENT_NAME': 'push',
    'RUNNER_OS': 'Linux',
  })
  // Simulate that any file check throws not found.
  overrideStat(async (_: string) => {
    throw new Deno.errors.NotFound()
  })
  const inputJson = loadTestJson('test_cache_src_path_na_vue_app.json')
  const input = JSON.parse(inputJson)
  input['app-vars']['github-dependencies-cache-enabled'] = 'true'
  mockCore.getInput = (name: string) => {
    if (name === 'APPVARS') return JSON.stringify(input['app-vars'])
    return ''
  }
  await run()
  const appVars = JSON.parse(mockOutputs['APPVARS'])
  // Expect fallback hash "no-lockfile"
  assertStringIncludes(appVars['github-dependencies-cache-key'], 'no-lockfile')
  // Additionally assert that restore keys and pr-base key are defined as empty or non-empty strings
  assertEquals(typeof appVars['github-dependencies-cache-restore-keys'], 'string')
  assertEquals(typeof appVars['github-dependencies-cache-pr-base-key'], 'string')
  restoreStat()
})

Deno.test('process_cache - Custom cache path', async () => {
  resetMockCore()
  setEnvVars({
    'GITHUB_EVENT_NAME': 'push',
    'RUNNER_OS': 'Linux',
    'HOME': '/home/test',
  })
  overrideStat(async (path: string) => {
    if (path.includes('pom.xml')) {
      return { isFile: true, isDirectory: false }
    }
    if (path.includes('/backend')) {
      return { isFile: false, isDirectory: true }
    }
    throw new Deno.errors.NotFound()
  })
  const inputJson = loadTestJson('test_cache_custom_cache_path.json')
  mockCore.getInput = (name: string) => {
    if (name === 'APPVARS') return JSON.stringify(JSON.parse(inputJson)['app-vars'])
    return ''
  }
  await run()
  const appVars = JSON.parse(mockOutputs['APPVARS'])
  // Assert that the custom cache path is exactly as provided in input.
  assertEquals(appVars['github-dependencies-cache-path'], '${MY_ENV}/custom/${HOME}/loc')
  restoreStat()
})

Deno.test('process_cache - Caching disabled', async () => {
  resetMockCore()
  setEnvVars({ 'GITHUB_EVENT_NAME': 'push' })
  const inputJson = loadTestJson('test_cache_disabled.json')
  mockCore.getInput = (name: string) => {
    if (name === 'APPVARS') return JSON.stringify(JSON.parse(inputJson)['app-vars'])
    return ''
  }
  await run()
  const appVars = JSON.parse(mockOutputs['APPVARS'])
  // Expect cache keys to be removed when caching is disabled.
  assertEquals(appVars['github-dependencies-cache-key'], undefined)
  assertEquals(appVars['github-dependencies-cache-restore-keys'], undefined)
})

Deno.test('process_cache - PR event cache keys', async () => {
  resetMockCore()
  setEnvVars({
    'GITHUB_EVENT_NAME': 'pull_request',
    'GH_EVENT_NUMBER': '123',
    'RUNNER_OS': 'Linux',
  })
  overrideStat(async (path: string) => {
    if (path.includes('pom.xml')) {
      return { isFile: true, isDirectory: false }
    }
    if (path.includes('/backend')) {
      return { isFile: false, isDirectory: true }
    }
    throw new Deno.errors.NotFound()
  })
  const inputJson = loadTestJson('test_cache_src_path_pom_sb_app.json')
  const input = JSON.parse(inputJson)
  // Enable caching for this test
  input['app-vars']['github-dependencies-cache-enabled'] = 'true'
  mockCore.getInput = (name: string) => {
    if (name === 'APPVARS') return JSON.stringify(input['app-vars'])
    return ''
  }
  await run()
  const appVars = JSON.parse(mockOutputs['APPVARS'])
  // In a PR event, the cache key should include a section reflecting the PR number ("pr123")
  assertStringIncludes(appVars['github-dependencies-cache-key'], 'pr123')
  restoreStat()
})

// Additional tests for JSON files not previously used:

// Test for directory vue app (source path is a directory)
Deno.test('process_cache - Directory vue app (no package-lock)', async () => {
  resetMockCore()
  setEnvVars({
    'GITHUB_EVENT_NAME': 'push',
    'RUNNER_OS': 'Linux',
  })
  const inputJson = loadTestJson('test_cache_src_path_dir_vue_app.json')
  const input = JSON.parse(inputJson)
  input['app-vars']['github-dependencies-cache-enabled'] = 'true'
  // Simulate that "/frontend" is a directory and no package-lock.json exists
  overrideStat(async (_: string) => {
    throw new Deno.errors.NotFound()
  })
  mockCore.getInput = (name: string) => {
    if (name === 'APPVARS') return JSON.stringify(input['app-vars'])
    return ''
  }
  await run()
  const appVars = JSON.parse(mockOutputs['APPVARS'])
  // Expect fallback hash "no-lockfile" because no lockfile is found
  assertStringIncludes(appVars['github-dependencies-cache-key'], 'no-lockfile')
  restoreStat()
})

// Test for vue app with no source path provided
Deno.test('process_cache - No source path vue app', async () => {
  resetMockCore()
  setEnvVars({
    'GITHUB_EVENT_NAME': 'push',
    'RUNNER_OS': 'Linux',
  })
  const inputJson = loadTestJson('test_cache_no_src_path_vue_app.json')
  const input = JSON.parse(inputJson)
  input['app-vars']['github-dependencies-cache-enabled'] = 'true'
  // Simulate that getAbsolutePath falls back to workspace and no lockfile is found
  overrideStat(async (_: string) => {
    throw new Deno.errors.NotFound()
  })
  mockCore.getInput = (name: string) => {
    if (name === 'APPVARS') return JSON.stringify(input['app-vars'])
    return ''
  }
  await run()
  const appVars = JSON.parse(mockOutputs['APPVARS'])
  assertStringIncludes(appVars['github-dependencies-cache-key'], 'no-lockfile')
  restoreStat()
})

// Test for spring-boot app with no source path provided
Deno.test('process_cache - No source path sb app', async () => {
  resetMockCore()
  setEnvVars({
    'GITHUB_EVENT_NAME': 'push',
    'RUNNER_OS': 'Linux',
  })
  const inputJson = loadTestJson('test_cache_no_src_path_sb_app.json')
  const input = JSON.parse(inputJson)
  input['app-vars']['github-dependencies-cache-enabled'] = 'true'
  overrideStat(async (_: string) => {
    throw new Deno.errors.NotFound()
  })
  mockCore.getInput = (name: string) => {
    if (name === 'APPVARS') return JSON.stringify(input['app-vars'])
    return ''
  }
  await run()
  const appVars = JSON.parse(mockOutputs['APPVARS'])
  assertStringIncludes(appVars['github-dependencies-cache-key'], 'no-lockfile')
  restoreStat()
})

// Test for Non-PR app using test_cache_non_pr.json
Deno.test('process_cache - Non PR app', async () => {
  resetMockCore()
  setEnvVars({
    'GITHUB_EVENT_NAME': 'push',
    'RUNNER_OS': 'Linux',
  })
  const inputJson = loadTestJson('test_cache_non_pr.json')
  const input = JSON.parse(inputJson)
  input['app-vars']['github-dependencies-cache-enabled'] = 'true'
  // For a spring-boot app, simulate that pom.xml exists under /backend
  overrideStat(async (path: string) => {
    if (path.includes('pom.xml')) return { isFile: true, isDirectory: false }
    if (path.includes('/backend')) return { isFile: false, isDirectory: true }
    throw new Deno.errors.NotFound()
  })
  mockCore.getInput = (name: string) => {
    if (name === 'APPVARS') return JSON.stringify(input['app-vars'])
    return ''
  }
  await run()
  const appVars = JSON.parse(mockOutputs['APPVARS'])
  // Expect a base cache key (no PR prefix) for non-PR events
  assertStringIncludes(appVars['github-dependencies-cache-key'], 'linux-maven-')
  restoreStat()
})

// Test for PR app using test_cache_pr.json
Deno.test('process_cache - PR app', async () => {
  resetMockCore()
  setEnvVars({
    'GITHUB_EVENT_NAME': 'pull_request',
    'GH_EVENT_NUMBER': '999',
    'RUNNER_OS': 'Linux',
  })
  const inputJson = loadTestJson('test_cache_pr.json')
  const input = JSON.parse(inputJson)
  input['app-vars']['github-dependencies-cache-enabled'] = 'true'
  // Simulate that pom.xml exists under /backend
  overrideStat(async (path: string) => {
    if (path.includes('pom.xml')) return { isFile: true, isDirectory: false }
    if (path.includes('/backend')) return { isFile: false, isDirectory: true }
    throw new Deno.errors.NotFound()
  })
  mockCore.getInput = (name: string) => {
    if (name === 'APPVARS') return JSON.stringify(input['app-vars'])
    return ''
  }
  await run()
  const appVars = JSON.parse(mockOutputs['APPVARS'])
  // Expect PR-specific cache key that includes "pr999"
  assertStringIncludes(appVars['github-dependencies-cache-key'], 'pr999')
  restoreStat()
})

// Test for Vue app with pom.xml source (test_cache_src_path_pom_vue_app.json)
Deno.test('process_cache - Pom for vue app', async () => {
  resetMockCore()
  setEnvVars({
    'GITHUB_EVENT_NAME': 'push',
    'RUNNER_OS': 'Linux',
  })
  const inputJson = loadTestJson('test_cache_src_path_pom_vue_app.json')
  const input = JSON.parse(inputJson)
  input['app-vars']['github-dependencies-cache-enabled'] = 'true'
  // Simulate that pom.xml exists in /backend
  overrideStat(async (path: string) => {
    if (path.includes('pom.xml')) return { isFile: true, isDirectory: false }
    if (path.includes('/backend')) return { isFile: false, isDirectory: true }
    throw new Deno.errors.NotFound()
  })
  mockCore.getInput = (name: string) => {
    if (name === 'APPVARS') return JSON.stringify(input['app-vars'])
    return ''
  }
  await run()
  const appVars = JSON.parse(mockOutputs['APPVARS'])
  // For a vue app, cache type is determined by app-type; expect "linux-npm-"
  assertStringIncludes(appVars['github-dependencies-cache-key'], 'linux-npm-')
  restoreStat()
})

// Test for default cache path for Vue app
Deno.test('process_cache - Default cache path for Vue app', async () => {
  resetMockCore()
  setEnvVars({
    'GITHUB_EVENT_NAME': 'push',
    'RUNNER_OS': 'Linux',
  })
  // Load input for a vue app without an explicit cache path.
  const inputJson = loadTestJson('test_cache_src_path_pkg_vue_app.json')
  const input = JSON.parse(inputJson)
  // Ensure no cache path is present.
  delete input['app-vars']['github-dependencies-cache-path']
  input['app-vars']['github-dependencies-cache-enabled'] = 'true'
  mockCore.getInput = (name: string) => {
    if (name === 'APPVARS') return JSON.stringify(input['app-vars'])
    return ''
  }

  await run()
  const appVars = JSON.parse(mockOutputs['APPVARS'])
  // For a vue app, the default cache path should be join('${HOME}', '.npm')
  assertEquals(appVars['github-dependencies-cache-path'], join('${HOME}', '.npm'))
})

// Test for default cache path for Spring Boot app
Deno.test('process_cache - Default cache path for Spring Boot app', async () => {
  resetMockCore()
  setEnvVars({
    'GITHUB_EVENT_NAME': 'push',
    'RUNNER_OS': 'Linux',
  })
  // Load input for a spring-boot app without an explicit cache path.
  const inputJson = loadTestJson('test_cache_src_path_pom_sb_app.json')
  const input = JSON.parse(inputJson)
  delete input['app-vars']['github-dependencies-cache-path']
  input['app-vars']['github-dependencies-cache-enabled'] = 'true'
  mockCore.getInput = (name: string) => {
    if (name === 'APPVARS') return JSON.stringify(input['app-vars'])
    return ''
  }

  await run()
  const appVars = JSON.parse(mockOutputs['APPVARS'])
  // For a maven app, the default cache path should be join('${HOME}', '.m2', 'repository')
  assertEquals(appVars['github-dependencies-cache-path'], join('${HOME}', '.m2', 'repository'))
})
