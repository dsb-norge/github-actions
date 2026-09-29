import { basename, core, expandGlob, join, parseXML, relative } from 'common/deps.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'
import { handleError } from 'common/utils/error.ts'
import { getActionInput, getWorkspacePath, tryParseJson } from 'common/utils/helpers.ts'

/**
 * Converts the JaCoCo XML report(s) of a Maven build into a single Cobertura XML report.
 *
 * GitHub's code coverage API only accepts Cobertura, while JaCoCo (and Kover, which writes the
 * same format) only writes its own XML. This step finds every JaCoCo XML report the build left in
 * the app's 'target' directories, merges them (a line counts as covered when any report covers it,
 * so unit, integration and merged reports can coexist) and writes one Cobertura report with file
 * paths relative to the repository root, which is what GitHub maps onto the PR diff.
 *
 * JaCoCo reports source files as '<package dir>/<file name>' relative to an unknown source root,
 * so paths are resolved against an index of the app's source files. Files that cannot be resolved
 * unambiguously are left out rather than guessed.
 *
 * Never fails the build for lack of coverage: no reports, or none that resolve, only means
 * 'report-created=false'.
 */

const REPORT_GLOB: string = '**/target/**/jacoco*.xml'
const SOURCE_GLOB: string = '**/*.{kt,kts,java}'
const GLOB_EXCLUDES: string[] = ['**/target/**', '**/build/**', '**/node_modules/**', '**/.git/**']

/** Coverage of a single source line, merged across reports. */
export interface LineCoverage {
  hits: number
  branchesTotal: number
  branchesCovered: number
}

/** Repo-relative source path → line number → coverage. */
export type CoverageMap = Map<string, Map<number, LineCoverage>>

/** Basename → repo-relative paths of all source files with that name. */
export type SourceIndex = Map<string, string[]>

interface JacocoLine {
  nr: string
  ci?: string
  mb?: string
  cb?: string
}

interface JacocoSourceFile {
  name: string
  line?: JacocoLine[]
}

interface JacocoPackage {
  name: string
  sourcefile?: JacocoSourceFile[]
}

interface JacocoGroup {
  group?: JacocoGroup[]
  package?: JacocoPackage[]
}

/** Converts a path to forward slashes, as used in reports and by GitHub. */
function toPosix(path: string): string {
  return path.replaceAll('\\', '/')
}

/**
 * Builds the source index for all Kotlin/Java files below 'rootDir'.
 * @param workspace Absolute path of the repository root, paths in the index are relative to it.
 * @param rootDir Absolute path of the directory to index.
 */
export async function buildSourceIndex(workspace: string, rootDir: string): Promise<SourceIndex> {
  const index: SourceIndex = new Map()
  for await (const entry of expandGlob(SOURCE_GLOB, { root: rootDir, exclude: GLOB_EXCLUDES, globstar: true })) {
    if (!entry.isFile) continue
    const repoPath = toPosix(relative(workspace, entry.path))
    const paths = index.get(entry.name) ?? []
    paths.push(repoPath)
    index.set(entry.name, paths)
  }
  return index
}

/** The directory of the Maven module that produced a report, i.e. everything before its '/target/'. */
export function moduleDirOfReport(reportRepoPath: string): string {
  const at = reportRepoPath.lastIndexOf('/target/')
  if (at > 0) return reportRepoPath.substring(0, at)
  return '.'
}

/** Picks the single best candidate, preferring the reporting module and main (non-test) sources. */
function pickCandidate(candidates: string[], moduleDir: string): string | null {
  if (candidates.length === 1) return candidates[0]
  if (candidates.length === 0) return null
  const inModule = moduleDir === '.' ? candidates : candidates.filter((path) => path.startsWith(`${moduleDir}/`))
  if (inModule.length === 1) return inModule[0]
  const mainSources = (inModule.length > 0 ? inModule : candidates).filter((path) => path.includes('/src/main/'))
  if (mainSources.length === 1) return mainSources[0]
  return null
}

/**
 * Resolves a JaCoCo source file to its repo-relative path.
 * @param packagePath JaCoCo package name, a slash separated directory ('no/dsb/app'), empty for the default package.
 * @param fileName JaCoCo source file name ('App.kt').
 * @param moduleDir Repo-relative directory of the module that produced the report.
 * @returns The path, or null when there is no unambiguous match.
 */
export function resolveSourcePath(index: SourceIndex, packagePath: string, fileName: string, moduleDir: string): string | null {
  const candidates = index.get(fileName) ?? []
  const suffix = packagePath ? `${packagePath}/${fileName}` : fileName
  const matchingPackage = candidates.filter((path) => path === suffix || path.endsWith(`/${suffix}`))
  if (matchingPackage.length > 0) return pickCandidate(matchingPackage, moduleDir)
  // Kotlin does not require the directory to match the package, fall back to a unique file name.
  return pickCandidate(candidates, moduleDir)
}

function collectPackages(node: JacocoGroup, packages: JacocoPackage[] = []): JacocoPackage[] {
  for (const pkg of node.package ?? []) packages.push(pkg)
  for (const group of node.group ?? []) collectPackages(group, packages)
  return packages
}

/**
 * Parses a JaCoCo XML report and merges its line coverage into 'coverage'.
 * @returns The number of source files that could not be resolved, or null if the document is not a JaCoCo report.
 */
export function mergeJacocoReport(xml: string, reportRepoPath: string, index: SourceIndex, coverage: CoverageMap): number | null {
  const parser = new parseXML({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    isArray: (name: string) => ['group', 'package', 'sourcefile', 'line'].includes(name),
  })
  const doc = parser.parse(xml) as { report?: JacocoGroup }
  if (!doc?.report || typeof doc.report !== 'object') return null

  const moduleDir = moduleDirOfReport(reportRepoPath)
  let unresolved = 0
  for (const pkg of collectPackages(doc.report)) {
    for (const sourceFile of pkg.sourcefile ?? []) {
      const lines = sourceFile.line ?? []
      if (lines.length === 0) continue
      const path = resolveSourcePath(index, pkg.name ?? '', sourceFile.name, moduleDir)
      if (!path) {
        unresolved++
        core.debug(`Could not resolve '${pkg.name}/${sourceFile.name}' from report '${reportRepoPath}' to a unique source file.`)
        continue
      }
      const fileCoverage = coverage.get(path) ?? new Map<number, LineCoverage>()
      for (const line of lines) {
        const nr = Number(line.nr)
        const hits = Number(line.ci ?? 0)
        const branchesTotal = Number(line.mb ?? 0) + Number(line.cb ?? 0)
        const branchesCovered = Number(line.cb ?? 0)
        const existing = fileCoverage.get(nr)
        fileCoverage.set(nr, {
          hits: Math.max(existing?.hits ?? 0, hits),
          branchesTotal: Math.max(existing?.branchesTotal ?? 0, branchesTotal),
          branchesCovered: Math.max(existing?.branchesCovered ?? 0, branchesCovered),
        })
      }
      coverage.set(path, fileCoverage)
    }
  }
  return unresolved
}

function escapeXmlAttr(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function rate(covered: number, valid: number): string {
  return valid === 0 ? '1' : (covered / valid).toFixed(4)
}

interface Totals {
  linesValid: number
  linesCovered: number
  branchesValid: number
  branchesCovered: number
}

function totalsOf(lines: Iterable<LineCoverage>): Totals {
  const totals: Totals = { linesValid: 0, linesCovered: 0, branchesValid: 0, branchesCovered: 0 }
  for (const line of lines) {
    totals.linesValid++
    if (line.hits > 0) totals.linesCovered++
    totals.branchesValid += line.branchesTotal
    totals.branchesCovered += line.branchesCovered
  }
  return totals
}

function rateAttrs(totals: Totals): string {
  return `line-rate="${rate(totals.linesCovered, totals.linesValid)}" branch-rate="${rate(totals.branchesCovered, totals.branchesValid)}"`
}

/** Writes the merged coverage as a Cobertura XML document, one class per source file. */
export function toCobertura(coverage: CoverageMap, timestampSeconds: number): string {
  const byPackage = new Map<string, string[]>()
  for (const path of [...coverage.keys()].sort()) {
    const dir = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '.'
    const paths = byPackage.get(dir) ?? []
    paths.push(path)
    byPackage.set(dir, paths)
  }

  const all = totalsOf([...coverage.values()].flatMap((lines) => [...lines.values()]))
  const out: string[] = [
    '<?xml version="1.0" ?>',
    '<!DOCTYPE coverage SYSTEM "http://cobertura.sourceforge.net/xml/coverage-04.dtd">',
    `<coverage ${rateAttrs(all)} lines-covered="${all.linesCovered}" lines-valid="${all.linesValid}" branches-covered="${all.branchesCovered}" branches-valid="${all.branchesValid}" complexity="0" version="dsb-jacoco-to-cobertura" timestamp="${timestampSeconds}">`,
    '  <sources>',
    '    <source>.</source>',
    '  </sources>',
    '  <packages>',
  ]
  for (const [dir, paths] of byPackage) {
    const pkgTotals = totalsOf(paths.flatMap((path) => [...coverage.get(path)!.values()]))
    out.push(`    <package name="${escapeXmlAttr(dir.replaceAll('/', '.'))}" ${rateAttrs(pkgTotals)} complexity="0">`)
    out.push('      <classes>')
    for (const path of paths) {
      const lines = coverage.get(path)!
      const className = basename(path).replace(/\.[^.]+$/, '')
      out.push(`        <class name="${escapeXmlAttr(className)}" filename="${escapeXmlAttr(path)}" ${rateAttrs(totalsOf(lines.values()))} complexity="0">`)
      out.push('          <methods/>')
      out.push('          <lines>')
      for (const nr of [...lines.keys()].sort((a, b) => a - b)) {
        const line = lines.get(nr)!
        if (line.branchesTotal > 0) {
          const percent = Math.round((line.branchesCovered / line.branchesTotal) * 100)
          out.push(`            <line number="${nr}" hits="${line.hits}" branch="true" condition-coverage="${percent}% (${line.branchesCovered}/${line.branchesTotal})"/>`)
        } else {
          out.push(`            <line number="${nr}" hits="${line.hits}" branch="false"/>`)
        }
      }
      out.push('          </lines>')
      out.push('        </class>')
    }
    out.push('      </classes>')
    out.push('    </package>')
  }
  out.push('  </packages>')
  out.push('</coverage>')
  return out.join('\n') + '\n'
}

/** Linguist language for the upload: whichever of Kotlin and Java has more covered-able lines. */
export function detectLanguage(coverage: CoverageMap): 'Kotlin' | 'Java' {
  let kotlinLines = 0
  let javaLines = 0
  for (const [path, lines] of coverage) {
    if (path.endsWith('.java')) javaLines += lines.size
    else kotlinLines += lines.size
  }
  return kotlinLines >= javaLines ? 'Kotlin' : 'Java'
}

export async function run(): Promise<void> {
  try {
    const appVars = tryParseJson<AppVars>(getActionInput('dsb-build-envs', true))
    if (!appVars) throw new Error('Failed to parse dsb-build-envs JSON.')
    const appName = appVars['application-name'] ?? 'app'
    const workspace = getWorkspacePath()
    const sourceRoot = join(workspace, appVars['application-source-path'] ?? '.')
    const outDir = Deno.env.get('RUNNER_TEMP') || workspace

    core.setOutput('report-created', 'false')

    const reports: string[] = []
    for await (const entry of expandGlob(REPORT_GLOB, { root: sourceRoot, exclude: ['**/node_modules/**', '**/.git/**'], globstar: true })) {
      if (entry.isFile) reports.push(entry.path)
    }
    if (reports.length === 0) {
      core.info(`No JaCoCo XML reports found below '${relative(workspace, sourceRoot) || '.'}' (looked for '${REPORT_GLOB}'), skipping code coverage.`)
      core.info("To get coverage, add the jacoco-maven-plugin with its 'prepare-agent' and 'report' goals to the pom.")
      return
    }

    const index = await buildSourceIndex(workspace, sourceRoot)
    const coverage: CoverageMap = new Map()
    let unresolved = 0
    for (const report of reports.sort()) {
      const reportRepoPath = toPosix(relative(workspace, report))
      const result = mergeJacocoReport(await Deno.readTextFile(report), reportRepoPath, index, coverage)
      if (result === null) {
        core.info(`Skipping '${reportRepoPath}', not a JaCoCo XML report.`)
        continue
      }
      core.info(`Merged JaCoCo report '${reportRepoPath}'.`)
      unresolved += result
    }
    if (unresolved > 0) {
      core.warning(`${unresolved} source file(s) in the JaCoCo report(s) could not be mapped to a unique file in the repository and were left out of the coverage report. Run with debug logging to see which.`)
    }
    if (coverage.size === 0) {
      core.warning('The JaCoCo report(s) contained no source files that could be mapped to the repository, skipping code coverage.')
      return
    }

    const reportFile = join(outDir, `coverage-${appName}.cobertura.xml`)
    await Deno.writeTextFile(reportFile, toCobertura(coverage, Math.floor(Date.now() / 1000)))
    const totals = totalsOf([...coverage.values()].flatMap((lines) => [...lines.values()]))
    const language = detectLanguage(coverage)
    core.info(`Wrote Cobertura report for ${coverage.size} source file(s), ${totals.linesCovered}/${totals.linesValid} lines covered, language '${language}': ${reportFile}`)

    core.setOutput('report-file', reportFile)
    core.setOutput('language', language)
    core.setOutput('report-created', 'true')
  } catch (error) {
    handleError(error, 'convert JaCoCo coverage to Cobertura')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
