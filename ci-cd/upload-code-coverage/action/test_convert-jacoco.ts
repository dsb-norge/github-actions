import { assert, assertEquals, assertStringIncludes } from 'common/test_deps.ts'
import { mockCore, mockOutputs, mockWarningLogs, resetMockCore } from 'common/utils/mock-core.ts'
import { ensureDir, join, parseXML, setCore } from 'common/deps.ts'
import { buildSourceIndex, CoverageMap, detectLanguage, mergeJacocoReport, moduleDirOfReport, resolveSourcePath, run, SourceIndex, toCobertura } from './1_convert-jacoco.ts'

// Replace the real core with the mock
setCore(mockCore)

const JACOCO_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><!DOCTYPE report PUBLIC "-//JACOCO//DTD Report 1.1//EN" "report.dtd">'

function jacocoReport(packages: string): string {
  return `${JACOCO_HEADER}<report name="app"><sessioninfo id="s" start="1" dump="2"/>${packages}<counter type="LINE" missed="0" covered="0"/></report>`
}

const UNIT_REPORT = jacocoReport(`
  <package name="no/dsb/app">
    <class name="no/dsb/app/App" sourcefilename="App.kt"/>
    <sourcefile name="App.kt">
      <line nr="3" mi="0" ci="4" mb="0" cb="0"/>
      <line nr="5" mi="2" ci="0" mb="2" cb="0"/>
      <line nr="7" mi="0" ci="3" mb="1" cb="1"/>
      <counter type="LINE" missed="1" covered="2"/>
    </sourcefile>
    <sourcefile name="Util.java">
      <line nr="10" mi="3" ci="0" mb="0" cb="0"/>
    </sourcefile>
  </package>`)

// The integration tests cover line 5 that the unit tests missed.
const IT_REPORT = jacocoReport(`
  <package name="no/dsb/app">
    <sourcefile name="App.kt">
      <line nr="5" mi="0" ci="2" mb="1" cb="1"/>
    </sourcefile>
  </package>`)

async function withWorkspace(test: (workspace: string) => Promise<void>): Promise<void> {
  const workspace = await Deno.makeTempDir()
  try {
    await test(workspace)
  } finally {
    await Deno.remove(workspace, { recursive: true })
  }
}

async function writeFile(workspace: string, path: string, content: string = ''): Promise<void> {
  const full = join(workspace, path)
  await ensureDir(full.substring(0, full.lastIndexOf('/')))
  await Deno.writeTextFile(full, content)
}

function lineOf(coverage: CoverageMap, path: string, nr: number) {
  return coverage.get(path)?.get(nr)
}

Deno.test('convert-jacoco - moduleDirOfReport takes everything before target', () => {
  assertEquals(moduleDirOfReport('backend/target/site/jacoco/jacoco.xml'), 'backend')
  assertEquals(moduleDirOfReport('backend/core/target/site/jacoco-it/jacoco.xml'), 'backend/core')
  assertEquals(moduleDirOfReport('target/site/jacoco/jacoco.xml'), '.')
})

Deno.test('convert-jacoco - resolveSourcePath matches on package directory and prefers the reporting module', () => {
  const index: SourceIndex = new Map([
    ['App.kt', ['backend/a/src/main/kotlin/no/dsb/app/App.kt', 'backend/b/src/main/kotlin/no/dsb/app/App.kt', 'backend/a/src/main/kotlin/no/dsb/other/App.kt']],
    ['Flat.kt', ['backend/a/src/main/kotlin/Flat.kt']],
    ['Twice.kt', ['x/src/main/kotlin/Twice.kt', 'y/src/main/kotlin/Twice.kt']],
  ])
  assertEquals(resolveSourcePath(index, 'no/dsb/app', 'App.kt', 'backend/b'), 'backend/b/src/main/kotlin/no/dsb/app/App.kt')
  assertEquals(resolveSourcePath(index, 'no/dsb/other', 'App.kt', 'backend/b'), 'backend/a/src/main/kotlin/no/dsb/other/App.kt')
  // Ambiguous and outside both modules: left out rather than guessed.
  assertEquals(resolveSourcePath(index, 'no/dsb/app', 'App.kt', 'backend/c'), null)
  // Kotlin file whose directory does not match its package: unique name is enough.
  assertEquals(resolveSourcePath(index, 'no/dsb/app', 'Flat.kt', 'backend/a'), 'backend/a/src/main/kotlin/Flat.kt')
  assertEquals(resolveSourcePath(index, 'no/dsb/app', 'Twice.kt', 'z'), null)
  assertEquals(resolveSourcePath(index, 'no/dsb/app', 'Missing.kt', 'backend/a'), null)
})

Deno.test('convert-jacoco - mergeJacocoReport merges reports keeping the best coverage per line', () => {
  const index: SourceIndex = new Map([
    ['App.kt', ['backend/src/main/kotlin/no/dsb/app/App.kt']],
    ['Util.java', ['backend/src/main/java/no/dsb/app/Util.java']],
  ])
  const coverage: CoverageMap = new Map()
  assertEquals(mergeJacocoReport(UNIT_REPORT, 'backend/target/site/jacoco/jacoco.xml', index, coverage), 0)
  assertEquals(mergeJacocoReport(IT_REPORT, 'backend/target/site/jacoco-it/jacoco.xml', index, coverage), 0)

  const app = 'backend/src/main/kotlin/no/dsb/app/App.kt'
  assertEquals(lineOf(coverage, app, 3), { hits: 4, branchesTotal: 0, branchesCovered: 0 })
  assertEquals(lineOf(coverage, app, 5), { hits: 2, branchesTotal: 2, branchesCovered: 1 })
  assertEquals(lineOf(coverage, app, 7), { hits: 3, branchesTotal: 2, branchesCovered: 1 })
  assertEquals(lineOf(coverage, 'backend/src/main/java/no/dsb/app/Util.java', 10), { hits: 0, branchesTotal: 0, branchesCovered: 0 })
})

Deno.test('convert-jacoco - mergeJacocoReport handles groups, counts unresolved files and rejects non-reports', () => {
  const grouped = jacocoReport(`<group name="core"><package name="no/dsb/core"><sourcefile name="Core.kt"><line nr="1" mi="0" ci="1" mb="0" cb="0"/></sourcefile><sourcefile name="Gone.kt"><line nr="1" mi="1" ci="0" mb="0" cb="0"/></sourcefile></package></group>`)
  const index: SourceIndex = new Map([['Core.kt', ['core/src/main/kotlin/no/dsb/core/Core.kt']]])
  const coverage: CoverageMap = new Map()
  assertEquals(mergeJacocoReport(grouped, 'aggregate/target/site/jacoco-aggregate/jacoco.xml', index, coverage), 1)
  assertEquals(lineOf(coverage, 'core/src/main/kotlin/no/dsb/core/Core.kt', 1)?.hits, 1)

  assertEquals(mergeJacocoReport('<?xml version="1.0"?><project/>', 'target/jacoco-config.xml', index, coverage), null)
})

Deno.test('convert-jacoco - toCobertura writes repo-relative filenames, rates and branch conditions', () => {
  const coverage: CoverageMap = new Map([
    ['backend/src/main/kotlin/no/dsb/app/App.kt', new Map([[3, { hits: 4, branchesTotal: 0, branchesCovered: 0 }], [5, { hits: 0, branchesTotal: 2, branchesCovered: 1 }]])],
  ])
  const xml = toCobertura(coverage, 1700000000)
  assertStringIncludes(xml, '<coverage line-rate="0.5000" branch-rate="0.5000" lines-covered="1" lines-valid="2" branches-covered="1" branches-valid="2"')
  assertStringIncludes(xml, '<package name="backend.src.main.kotlin.no.dsb.app"')
  assertStringIncludes(xml, '<class name="App" filename="backend/src/main/kotlin/no/dsb/app/App.kt" line-rate="0.5000" branch-rate="0.5000"')
  assertStringIncludes(xml, '<line number="3" hits="4" branch="false"/>')
  assertStringIncludes(xml, '<line number="5" hits="0" branch="true" condition-coverage="50% (1/2)"/>')

  // Well-formed and readable back as Cobertura.
  const doc = new parseXML({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(xml)
  assertEquals(doc.coverage.packages.package.classes.class.filename, 'backend/src/main/kotlin/no/dsb/app/App.kt')
})

Deno.test('convert-jacoco - detectLanguage picks the language with the most lines', () => {
  const line = { hits: 1, branchesTotal: 0, branchesCovered: 0 }
  assertEquals(detectLanguage(new Map([['a/A.kt', new Map([[1, line]])], ['a/B.java', new Map([[1, line], [2, line]])]])), 'Java')
  assertEquals(detectLanguage(new Map([['a/A.kt', new Map([[1, line]])]])), 'Kotlin')
})

Deno.test('convert-jacoco - run converts all reports of the app into one Cobertura file', async () => {
  await withWorkspace(async (workspace) => {
    await writeFile(workspace, 'backend/src/main/kotlin/no/dsb/app/App.kt')
    await writeFile(workspace, 'backend/src/main/java/no/dsb/app/Util.java')
    await writeFile(workspace, 'backend/target/site/jacoco/jacoco.xml', UNIT_REPORT)
    await writeFile(workspace, 'backend/target/site/jacoco-it/jacoco.xml', IT_REPORT)
    // Sources copied into target must not make the paths ambiguous.
    await writeFile(workspace, 'backend/target/classes/no/dsb/app/App.kt')

    resetMockCore()
    Deno.env.set('GITHUB_WORKSPACE', workspace)
    Deno.env.set('RUNNER_TEMP', workspace)
    mockCore.outputs['DSB_BUILD_ENVS'] = JSON.stringify({ 'application-name': 'my-app', 'application-source-path': './backend' })
    await run()

    assertEquals(mockOutputs['report-created'], 'true')
    assertEquals(mockOutputs['language'], 'Kotlin')
    assertEquals(mockOutputs['report-file'], join(workspace, 'coverage-my-app.cobertura.xml'))
    const xml = await Deno.readTextFile(mockOutputs['report-file'])
    assertStringIncludes(xml, 'filename="backend/src/main/kotlin/no/dsb/app/App.kt"')
    assertStringIncludes(xml, 'filename="backend/src/main/java/no/dsb/app/Util.java"')
    assertStringIncludes(xml, '<line number="5" hits="2" branch="true" condition-coverage="50% (1/2)"/>')
    assertEquals(mockWarningLogs.length, 0)
  })
})

Deno.test('convert-jacoco - run without reports skips without failing', async () => {
  await withWorkspace(async (workspace) => {
    await writeFile(workspace, 'src/main/kotlin/no/dsb/app/App.kt')

    resetMockCore()
    Deno.env.set('GITHUB_WORKSPACE', workspace)
    Deno.env.set('RUNNER_TEMP', workspace)
    mockCore.outputs['DSB_BUILD_ENVS'] = JSON.stringify({ 'application-name': 'my-app', 'application-source-path': '.' })
    await run()

    assertEquals(mockOutputs['report-created'], 'false')
    assert(!('report-file' in mockOutputs))
  })
})

Deno.test('convert-jacoco - buildSourceIndex skips build output directories', async () => {
  await withWorkspace(async (workspace) => {
    await writeFile(workspace, 'app/src/main/kotlin/A.kt')
    await writeFile(workspace, 'app/target/generated-sources/A.kt')
    await writeFile(workspace, 'app/build/A.kt')
    const index = await buildSourceIndex(workspace, join(workspace, 'app'))
    assertEquals(index.get('A.kt'), ['app/src/main/kotlin/A.kt'])
  })
})
