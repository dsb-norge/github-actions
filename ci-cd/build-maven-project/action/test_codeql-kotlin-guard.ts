import { assertEquals, assertStringIncludes } from 'common/test_deps.ts'
import { mockCore, mockExportedVars, mockWarningLogs, resetMockCore } from 'common/utils/mock-core.ts'
import { setCore } from 'common/deps.ts'
import { compareVersions, decideKotlinSupport, extractKotlinPluginVersionFromPom, extractKotlinVersionFromPom, findSupportedKotlinVersions, parseExtractorJarVersion, parseKotlinVersion, run, toFeatureVersion } from './2_codeql-kotlin-guard.ts'
import { join } from 'common/deps.ts'

// Replace the real core with the mock
setCore(mockCore)

const CODEQL_2_27_0_VERSIONS = ['1.8.0', '2.3.0', '2.3.20', '2.4.0']

Deno.test('codeql-kotlin-guard - parseKotlinVersion handles plain and tagged versions', () => {
  assertEquals(parseKotlinVersion('2.4.20'), [2, 4, 20])
  assertEquals(parseKotlinVersion(' 2.4.10 '), [2, 4, 10])
  assertEquals(parseKotlinVersion('2.1.0-Beta1'), [2, 1, 0])
  assertEquals(parseKotlinVersion('2.4'), null)
  assertEquals(parseKotlinVersion('${kotlin.version}'), null)
  assertEquals(parseKotlinVersion('null object or invalid expression'), null)
})

Deno.test('codeql-kotlin-guard - toFeatureVersion buckets patches onto their feature release', () => {
  assertEquals(toFeatureVersion('2.4.0'), '2.4.0')
  assertEquals(toFeatureVersion('2.4.10'), '2.4.0')
  assertEquals(toFeatureVersion('2.4.20'), '2.4.20')
  assertEquals(toFeatureVersion('2.4.21'), '2.4.20')
  assertEquals(toFeatureVersion('2.2.20-Beta2'), '2.2.20')
  assertEquals(toFeatureVersion('not-a-version'), null)
})

Deno.test('codeql-kotlin-guard - compareVersions orders numerically, not lexically', () => {
  assertEquals(compareVersions('2.4.10', '2.4.9') > 0, true)
  assertEquals(compareVersions('2.4.0', '2.4.20') < 0, true)
  assertEquals(compareVersions('2.4.20', '2.4.20') === 0, true)
  assertEquals(['2.4.20', '2.3.0', '2.4.0'].sort(compareVersions), ['2.3.0', '2.4.0', '2.4.20'])
})

Deno.test('codeql-kotlin-guard - parseExtractorJarVersion reads the version off extractor jars', () => {
  assertEquals(parseExtractorJarVersion('codeql-extractor-kotlin-standalone-2.4.0.jar'), '2.4.0')
  assertEquals(parseExtractorJarVersion('codeql-extractor-kotlin-embeddable-2.2.20-Beta2.jar'), '2.2.20-Beta2')
  assertEquals(parseExtractorJarVersion('codeql-extractor-java.jar'), null)
  assertEquals(parseExtractorJarVersion('kotlin-stdlib-2.4.20.jar'), null)
})

Deno.test('codeql-kotlin-guard - extractKotlinVersionFromPom reads the kotlin.version property', () => {
  assertEquals(extractKotlinVersionFromPom('<properties>\n  <kotlin.version>2.4.20</kotlin.version>\n</properties>'), '2.4.20')
  assertEquals(extractKotlinVersionFromPom('<kotlin.version> 2.4.10 </kotlin.version>'), '2.4.10')
  assertEquals(extractKotlinVersionFromPom('<properties><java.version>25</java.version></properties>'), null)
})

Deno.test('codeql-kotlin-guard - extractKotlinPluginVersionFromPom reads a directly pinned plugin version', () => {
  const pinned = `<build><plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-surefire-plugin</artifactId>
        <version>3.5.6</version>
      </plugin>
      <plugin>
        <groupId>org.jetbrains.kotlin</groupId>
        <artifactId>kotlin-maven-plugin</artifactId>
        <version>2.4.20</version>
      </plugin>
    </plugins></build>`
  assertEquals(extractKotlinPluginVersionFromPom(pinned), '2.4.20')

  // Unresolved property placeholders are left to maven
  assertEquals(extractKotlinPluginVersionFromPom('<plugin><artifactId>kotlin-maven-plugin</artifactId><version>${kotlin.version}</version></plugin>'), null)

  // No version at all (inherited from a parent) is left to maven too
  assertEquals(extractKotlinPluginVersionFromPom('<plugin><artifactId>kotlin-maven-plugin</artifactId></plugin>'), null)

  // The version belonging to another plugin is never picked up
  assertEquals(extractKotlinPluginVersionFromPom('<plugin><artifactId>maven-compiler-plugin</artifactId><version>3.14.0</version></plugin>'), null)
})

Deno.test('codeql-kotlin-guard - decideKotlinSupport against the versions a bundle ships', () => {
  // The case that broke sambas: CodeQL 2.27.0 has no extractor for the 2.4.20 feature release.
  const tooRecent = decideKotlinSupport('2.4.20', CODEQL_2_27_0_VERSIONS)
  assertEquals(tooRecent.supported, false)
  assertStringIncludes(tooRecent.reason, '2.4.20')

  // Patch releases of a supported feature release are fine.
  assertEquals(decideKotlinSupport('2.4.10', CODEQL_2_27_0_VERSIONS).supported, true)
  assertEquals(decideKotlinSupport('2.4.0', CODEQL_2_27_0_VERSIONS).supported, true)
  assertEquals(decideKotlinSupport('2.3.21', CODEQL_2_27_0_VERSIONS).supported, true)

  // A future Kotlin feature release is unsupported until the bundle ships an extractor for it.
  assertEquals(decideKotlinSupport('2.5.0', CODEQL_2_27_0_VERSIONS).supported, false)

  // Extractor jar names carry pre-release tags, the project version is bucketed onto them.
  assertEquals(decideKotlinSupport('2.2.21', ['2.2.20-Beta2']).supported, true)
})

Deno.test('codeql-kotlin-guard - decideKotlinSupport falls back to the hardcoded limit', () => {
  assertEquals(decideKotlinSupport('2.4.10', []).supported, true)
  const decision = decideKotlinSupport('2.4.20', [])
  assertEquals(decision.supported, false)
  assertStringIncludes(decision.reason, 'fallback limit')
})

Deno.test('codeql-kotlin-guard - decideKotlinSupport keeps extraction enabled for unparsable versions', () => {
  const decision = decideKotlinSupport('${kotlin.version}', CODEQL_2_27_0_VERSIONS)
  assertEquals(decision.supported, true)
  assertStringIncludes(decision.reason, 'unable to parse')
})

Deno.test('codeql-kotlin-guard - findSupportedKotlinVersions walks the extractor root', async () => {
  const root = await Deno.makeTempDir()
  try {
    const toolsDir = join(root, 'tools', 'kotlin-extractor')
    await Deno.mkdir(toolsDir, { recursive: true })
    await Deno.writeTextFile(join(toolsDir, 'codeql-extractor-kotlin-standalone-2.4.0.jar'), '')
    await Deno.writeTextFile(join(toolsDir, 'codeql-extractor-kotlin-embeddable-2.4.0.jar'), '')
    await Deno.writeTextFile(join(toolsDir, 'codeql-extractor-kotlin-standalone-2.3.20.jar'), '')
    await Deno.writeTextFile(join(toolsDir, 'codeql-extractor-java.jar'), '')

    const versions = await findSupportedKotlinVersions(root)
    assertEquals(versions.sort(compareVersions), ['2.3.20', '2.4.0'])
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('codeql-kotlin-guard - findSupportedKotlinVersions returns empty for a missing root', async () => {
  assertEquals(await findSupportedKotlinVersions('/no/such/codeql/dist'), [])
})

Deno.test('codeql-kotlin-guard - run() is a no-op when CodeQL is not active', async () => {
  resetMockCore()
  Deno.env.delete('CODEQL_EXTRACTOR_JAVA_ROOT')

  await run()

  assertEquals(Object.keys(mockExportedVars).length, 0)
  assertEquals(mockWarningLogs.length, 0)
})

Deno.test('codeql-kotlin-guard - run() disables Kotlin extraction for a too recent Kotlin version', async () => {
  resetMockCore()
  const workspace = await Deno.makeTempDir()
  const codeqlRoot = await Deno.makeTempDir()
  try {
    // A minimal Kotlin project declaring a Kotlin version CodeQL has no extractor for
    await Deno.mkdir(join(workspace, 'backend', 'src'), { recursive: true })
    await Deno.writeTextFile(join(workspace, 'backend', 'pom.xml'), '<project><properties><kotlin.version>2.4.20</kotlin.version></properties></project>')
    await Deno.writeTextFile(join(workspace, 'backend', 'src', 'Main.kt'), 'fun main() {}')

    const toolsDir = join(codeqlRoot, 'tools', 'kotlin-extractor')
    await Deno.mkdir(toolsDir, { recursive: true })
    await Deno.writeTextFile(join(toolsDir, 'codeql-extractor-kotlin-standalone-2.4.0.jar'), '')

    Deno.env.set('CODEQL_EXTRACTOR_JAVA_ROOT', codeqlRoot)
    Deno.env.delete('CODEQL_EXTRACTOR_JAVA_AGENT_DISABLE_KOTLIN')
    Deno.env.set('GITHUB_WORKSPACE', workspace)
    mockCore.outputs['DSB_BUILD_ENVS'] = JSON.stringify({ 'application-source-path': 'backend' })

    await run()

    assertEquals(mockExportedVars['CODEQL_EXTRACTOR_JAVA_AGENT_DISABLE_KOTLIN'], 'true')
    assertStringIncludes(mockWarningLogs.join('\n'), 'Kotlin 2.4.20')
  } finally {
    Deno.env.delete('CODEQL_EXTRACTOR_JAVA_ROOT')
    await Deno.remove(workspace, { recursive: true })
    await Deno.remove(codeqlRoot, { recursive: true })
  }
})

Deno.test('codeql-kotlin-guard - run() catches a Kotlin version pinned on the plugin, without kotlin.version', async () => {
  resetMockCore()
  const workspace = await Deno.makeTempDir()
  const codeqlRoot = await Deno.makeTempDir()
  try {
    await Deno.mkdir(join(workspace, 'src'), { recursive: true })
    await Deno.writeTextFile(
      join(workspace, 'pom.xml'),
      '<project><build><plugins><plugin><artifactId>kotlin-maven-plugin</artifactId><version>2.4.20</version></plugin></plugins></build></project>',
    )
    await Deno.writeTextFile(join(workspace, 'src', 'Main.kt'), 'fun main() {}')

    const toolsDir = join(codeqlRoot, 'tools', 'kotlin-extractor')
    await Deno.mkdir(toolsDir, { recursive: true })
    await Deno.writeTextFile(join(toolsDir, 'codeql-extractor-kotlin-standalone-2.4.0.jar'), '')

    Deno.env.set('CODEQL_EXTRACTOR_JAVA_ROOT', codeqlRoot)
    Deno.env.delete('CODEQL_EXTRACTOR_JAVA_AGENT_DISABLE_KOTLIN')
    Deno.env.set('GITHUB_WORKSPACE', workspace)
    mockCore.outputs['DSB_BUILD_ENVS'] = JSON.stringify({ 'application-source-path': '.' })

    await run()

    assertEquals(mockExportedVars['CODEQL_EXTRACTOR_JAVA_AGENT_DISABLE_KOTLIN'], 'true')
  } finally {
    Deno.env.delete('CODEQL_EXTRACTOR_JAVA_ROOT')
    await Deno.remove(workspace, { recursive: true })
    await Deno.remove(codeqlRoot, { recursive: true })
  }
})

Deno.test('codeql-kotlin-guard - run() leaves a supported Kotlin version alone', async () => {
  resetMockCore()
  const workspace = await Deno.makeTempDir()
  const codeqlRoot = await Deno.makeTempDir()
  try {
    await Deno.mkdir(join(workspace, 'src'), { recursive: true })
    await Deno.writeTextFile(join(workspace, 'pom.xml'), '<project><properties><kotlin.version>2.4.10</kotlin.version></properties></project>')
    await Deno.writeTextFile(join(workspace, 'src', 'Main.kt'), 'fun main() {}')

    const toolsDir = join(codeqlRoot, 'tools', 'kotlin-extractor')
    await Deno.mkdir(toolsDir, { recursive: true })
    await Deno.writeTextFile(join(toolsDir, 'codeql-extractor-kotlin-standalone-2.4.0.jar'), '')

    Deno.env.set('CODEQL_EXTRACTOR_JAVA_ROOT', codeqlRoot)
    Deno.env.delete('CODEQL_EXTRACTOR_JAVA_AGENT_DISABLE_KOTLIN')
    Deno.env.set('GITHUB_WORKSPACE', workspace)
    mockCore.outputs['DSB_BUILD_ENVS'] = JSON.stringify({ 'application-source-path': '.' })

    await run()

    assertEquals(Object.keys(mockExportedVars).length, 0)
    assertEquals(mockWarningLogs.length, 0)
  } finally {
    Deno.env.delete('CODEQL_EXTRACTOR_JAVA_ROOT')
    await Deno.remove(workspace, { recursive: true })
    await Deno.remove(codeqlRoot, { recursive: true })
  }
})

Deno.test('codeql-kotlin-guard - run() skips projects without Kotlin sources', async () => {
  resetMockCore()
  const workspace = await Deno.makeTempDir()
  try {
    await Deno.writeTextFile(join(workspace, 'pom.xml'), '<project></project>')
    Deno.env.set('CODEQL_EXTRACTOR_JAVA_ROOT', '/no/such/codeql/dist')
    Deno.env.delete('CODEQL_EXTRACTOR_JAVA_AGENT_DISABLE_KOTLIN')
    Deno.env.set('GITHUB_WORKSPACE', workspace)
    mockCore.outputs['DSB_BUILD_ENVS'] = JSON.stringify({ 'application-source-path': '.' })

    await run()

    assertEquals(Object.keys(mockExportedVars).length, 0)
    assertEquals(mockWarningLogs.length, 0)
  } finally {
    Deno.env.delete('CODEQL_EXTRACTOR_JAVA_ROOT')
    await Deno.remove(workspace, { recursive: true })
  }
})
