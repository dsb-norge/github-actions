import { assertEquals, assertStringIncludes } from 'common/test_deps.ts'
import { mockCore, resetMockCore } from 'common/utils/mock-core.ts'
import { join, setCore } from 'common/deps.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'
import { run } from './1_mvn-cmd.ts'

// Replace the real core with the mock
setCore(mockCore)

/** Runs the step against a temp workspace with a pom.xml, returns the determined build command. */
async function runWith(appVars: Partial<AppVars>, buildOnly?: string): Promise<string> {
  resetMockCore()
  const workspace = await Deno.makeTempDir()
  const previousWorkspace = Deno.env.get('GITHUB_WORKSPACE')
  try {
    await Deno.writeTextFile(join(workspace, 'pom.xml'), '<project/>')
    Deno.env.set('GITHUB_WORKSPACE', workspace)
    mockCore.outputs['DSB_BUILD_ENVS'] = JSON.stringify({ 'application-source-path': './', 'application-version': '1.2.3', ...appVars })
    if (buildOnly !== undefined) mockCore.outputs['BUILD_ONLY'] = buildOnly
    await run()
    return mockCore.outputs['mvn-cmd']
  } finally {
    if (previousWorkspace === undefined) Deno.env.delete('GITHUB_WORKSPACE')
    else Deno.env.set('GITHUB_WORKSPACE', previousWorkspace)
    await Deno.remove(workspace, { recursive: true })
  }
}

Deno.test('mvn-cmd - regular build uses the app goals and runs tests', async () => {
  const cmd = await runWith({ 'maven-build-project-goals': 'clean install sonar:sonar', 'maven-build-project-arguments': '-Duser.timezone=Europe/Oslo' })
  assertStringIncludes(cmd, 'clean install sonar:sonar')
  assertStringIncludes(cmd, '-Duser.timezone=Europe/Oslo')
  assertEquals(cmd.includes('-DskipTests'), false)
})

Deno.test('mvn-cmd - build-only packages without tests and ignores the app goals', async () => {
  const cmd = await runWith({ 'maven-build-project-goals': 'clean install sonar:sonar', 'maven-build-project-arguments': '-Duser.timezone=Europe/Oslo' }, 'true')
  assertEquals(cmd.endsWith(' clean package'), true)
  assertStringIncludes(cmd, '-Duser.timezone=Europe/Oslo')
  assertStringIncludes(cmd, '-DskipTests')
  assertEquals(cmd.includes('install'), false)
  assertEquals(cmd.includes('sonar'), false)
})

Deno.test('mvn-cmd - build-only keeps a full maven-build-project-command but skips tests', async () => {
  const cmd = await runWith({ 'maven-build-project-command': 'mvn -B -Pci verify' }, 'true')
  assertStringIncludes(cmd, '-Pci verify')
  assertStringIncludes(cmd, '-DskipTests')
})

Deno.test('mvn-cmd - build-only false behaves like a regular build', async () => {
  const cmd = await runWith({}, 'false')
  assertEquals(cmd.endsWith(' clean install'), true)
  assertEquals(cmd.includes('-DskipTests'), false)
})
