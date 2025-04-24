import { core, github } from 'common/deps.ts' // Import github
import { getActionInput, logMultiline } from 'common/utils/helpers.ts' // Removed executeCommandWithOutput, tryParseJson
import { handleError } from 'common/utils/error.ts'

// --- Interfaces ---
export interface GitHubPackage {
  name: string
  version_count: number
  repository: {
    full_name: string
  }
}

export interface GitHubVersion {
  id: number
  name: string
  updated_at: string // ISO 8601 format
  metadata?: {
    package_type: string // Should be 'maven'
  }
}

export interface GroupedVersions {
  count: number
  versions: GitHubVersion[]
}

export interface PackageDetails {
  type: string
  releases: GroupedVersions
  snapshots: GroupedVersions
  others: GroupedVersions
}

export interface PackagesOutput {
  [packageName: string]: PackageDetails
}

export interface PruneConfig {
  count: number
  days: number
}

export interface DeleteItem {
  org: string
  package_type: string
  package_name: string
  package_version_id?: number // Only for version deletion
  package_version_name?: string // Only for version deletion
  package_version_updated_at?: string // Only for version deletion
}

// --- Constants ---
const RELEASE_REGEX = /^\d{2}(\d{2})?\.\d{2}\.\d{2}\.\d{1,5}$/i
const SNAPSHOT_REGEX = /^PR-\d+-SNAPSHOT$/i
const PACKAGE_TYPE = 'maven'

// --- Helper Functions ---

export async function fetchPaginatedGhApi<T>(
  endpoint: string,
  octokit: ReturnType<typeof github.getOctokit>,
): Promise<T[]> {
  core.debug(`Fetching paginated API endpoint: ${endpoint}`)
  try {
    const url = new URL(`https://api.github.com${endpoint}`)
    const path = url.pathname
    const queryParams = Object.fromEntries(url.searchParams.entries())
    const method = 'GET'
    const requestRoute = `${method} ${path}`
    core.debug(`Octokit paginate: Route='${requestRoute}', Params=${JSON.stringify(queryParams)}`)
    const results = await octokit.paginate<T>(requestRoute, {
      ...queryParams,
      per_page: 100,
    })
    core.debug(`Fetched total ${results.length} items for endpoint ${endpoint}`)
    return results
  } catch (error) {
    core.error(`Failed to fetch paginated data for endpoint ${endpoint}: ${error}`)
    if (error instanceof Error) core.error(error.stack ?? 'No stack trace available.')
    throw new Error(`Failed to fetch paginated data for ${endpoint} using Octokit: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function groupVersions(versions: GitHubVersion[]): PackageDetails {
  const releases: GitHubVersion[] = []
  const snapshots: GitHubVersion[] = []
  const others: GitHubVersion[] = []

  for (const version of versions) {
    if (RELEASE_REGEX.test(version.name)) {
      releases.push(version)
    } else if (SNAPSHOT_REGEX.test(version.name)) {
      snapshots.push(version)
    } else {
      others.push(version)
    }
  }

  // Sort by updated_at ascending (oldest first)
  const sortByDate = (a: GitHubVersion, b: GitHubVersion) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
  releases.sort(sortByDate)
  snapshots.sort(sortByDate)
  others.sort(sortByDate)

  return {
    type: PACKAGE_TYPE,
    releases: { count: releases.length, versions: releases },
    snapshots: { count: snapshots.length, versions: snapshots },
    others: { count: others.length, versions: others },
  }
}

export function getVersionsToDiscard(
  versions: GitHubVersion[],
  keepCount: number,
  keepDays: number,
  filterRegex?: RegExp,
): GitHubVersion[] {
  const now = Date.now()
  const cutoffTime = now - keepDays * 24 * 60 * 60 * 1000

  let candidates = versions
  if (filterRegex) {
    candidates = versions.filter((v) => filterRegex.test(v.name))
  }

  // Sort descending (newest first) to easily slice off the ones to keep
  const sortedCandidates = [...candidates].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )

  // Slice off the newest 'keepCount' versions
  const potentiallyDiscardable = sortedCandidates.slice(keepCount)

  // Filter those older than the cutoff date
  const discardable = potentiallyDiscardable.filter(
    (v) => new Date(v.updated_at).getTime() < cutoffTime,
  )

  return discardable
}

// --- Main Function ---
export async function run(): Promise<void> {
  core.info('Starting: Process Maven Packages for Pruning')

  try {
    // --- Get Inputs & Env Vars ---
    const token = getActionInput('github-packages-token', true)
    const octokit = github.getOctokit(token)
    const ownerAndRepoInput = getActionInput('owner-and-repository-name')
    const releaseKeepCount = parseInt(
      getActionInput('release-prune-keep-min-count', true),
      10,
    )
    const releaseKeepDays = parseInt(
      getActionInput('release-prune-keep-num-days', true),
      10,
    )
    const snapshotKeepCount = parseInt(
      getActionInput('snapshot-prune-keep-min-count', true),
      10,
    )
    const snapshotKeepDays = parseInt(
      getActionInput('snapshot-prune-keep-num-days', true),
      10,
    )
    const otherKeepCount = parseInt(
      getActionInput('other-prune-keep-min-count', true),
      10,
    )
    const otherKeepDays = parseInt(
      getActionInput('other-prune-keep-num-days', true),
      10,
    )

    const githubRepository = Deno.env.get('GITHUB_REPOSITORY')
    const githubRepositoryOwner = Deno.env.get('GITHUB_REPOSITORY_OWNER')
    const eventName = Deno.env.get('GITHUB_EVENT_NAME')
    const eventAction = Deno.env.get('GITHUB_EVENT_ACTION') // For PR closed
    const prNumberStr = Deno.env.get('GITHUB_EVENT_NUMBER')

    if (!githubRepository || !githubRepositoryOwner) {
      throw new Error('GITHUB_REPOSITORY and GITHUB_REPOSITORY_OWNER env vars are required.')
    }

    const repoWithOwner = ownerAndRepoInput || githubRepository
    const repoOwner = ownerAndRepoInput ? ownerAndRepoInput.split('/')[0] : githubRepositoryOwner

    core.info(`Target Repository Owner: ${repoOwner}`)
    core.info(`Target Repository: ${repoWithOwner}`)
    core.info(`Event Name: ${eventName}`)
    if (eventName === 'pull_request') {
      core.info(`Event Action: ${eventAction}`)
      core.info(`PR Number: ${prNumberStr}`)
    }

    // --- Fetch Packages ---
    core.startGroup('Fetching Maven Packages')
    const packagesUrl = `/orgs/${repoOwner}/packages?package_type=${PACKAGE_TYPE}`
    const allOrgPackages = await fetchPaginatedGhApi<GitHubPackage>(
      packagesUrl,
      octokit,
    )
    const repoPackages = allOrgPackages.filter(
      (pkg) => pkg.repository.full_name === repoWithOwner,
    )

    if (repoPackages.length === 0) {
      core.info(`No packages of type '${PACKAGE_TYPE}' found in repo '${repoWithOwner}'.`)
      core.setOutput('delete-packages-count', '0')
      core.setOutput('delete-versions-count', '0')
      core.setOutput('delete-packages-json', '[]')
      core.setOutput('delete-versions-json', '[]')
      core.endGroup()
      core.info('Step completed: No packages to process.')
      return
    }

    logMultiline(
      `${repoPackages.length} package(s) found:`,
      repoPackages.map((p) => p.name).join('\n'),
    )
    core.endGroup()

    // --- Fetch and Group Versions ---
    const packagesData: PackagesOutput = {}
    core.startGroup('Fetching and Grouping Package Versions')
    for (const pkg of repoPackages) {
      core.info(`Processing package: ${pkg.name}`)
      const versionsUrl = `/orgs/${repoOwner}/packages/${PACKAGE_TYPE}/${pkg.name}/versions`
      const versions = await fetchPaginatedGhApi<GitHubVersion>(
        versionsUrl,
        octokit,
      )
      if (versions.length !== pkg.version_count) {
        core.warning(`Version count mismatch for package ${pkg.name}. API reported ${pkg.version_count}, found ${versions.length}. Using found count.`)
      }
      packagesData[pkg.name] = groupVersions(versions)
      core.info(
        `  Releases: ${packagesData[pkg.name].releases.count}, Snapshots: ${packagesData[pkg.name].snapshots.count}, Others: ${packagesData[pkg.name].others.count}`,
      )
    }
    logMultiline('Grouped Packages Data:', JSON.stringify(packagesData, null, 2))
    core.endGroup()

    // --- Determine What to Delete ---
    core.startGroup('Determining Items to Delete')
    const packagesToDelete: DeleteItem[] = []
    const versionsToDelete: DeleteItem[] = []

    const isPr = eventName === 'pull_request'
    const isClosingPr = isPr && eventAction === 'closed'
    const prNumber = prNumberStr ? parseInt(prNumberStr, 10) : null

    let snapshotFilterRegex: RegExp | undefined = undefined
    let considerReleases = !isPr
    const considerSnapshots = true // Always consider snapshots, but rules change
    let considerOthers = !isPr

    let currentSnapshotKeepCount = snapshotKeepCount
    let currentSnapshotKeepDays = snapshotKeepDays

    if (isPr) {
      core.info('Running in PR context.')
      if (isClosingPr && prNumber) {
        core.info(`PR #${prNumber} is closing. Targeting its snapshots for deletion.`)
        // Force deletion of this PR's snapshots
        currentSnapshotKeepCount = 0
        currentSnapshotKeepDays = 0
        snapshotFilterRegex = new RegExp(`^PR-${prNumber}-SNAPSHOT$`, 'i')
        // Only consider snapshots for deletion on PR close
        considerReleases = false
        considerOthers = false
      } else {
        core.info('PR is open. No pruning will occur for releases or others. Snapshots retained normally.')
        // Don't prune releases or others during an open PR
        considerReleases = false
        considerOthers = false
        // Keep snapshots according to standard rules, don't filter by PR number
        snapshotFilterRegex = undefined
      }
    } else {
      core.info('Running outside PR context. Standard pruning rules apply.')
      snapshotFilterRegex = undefined // Consider all snapshots
    }

    core.info(`Consider Releases: ${considerReleases}`)
    core.info(`Consider Snapshots: ${considerSnapshots}`)
    core.info(`Consider Others: ${considerOthers}`)
    core.info(`Snapshot Keep Count: ${currentSnapshotKeepCount}`)
    core.info(`Snapshot Keep Days: ${currentSnapshotKeepDays}`)
    if (snapshotFilterRegex) {
      core.info(`Snapshot Filter Regex: ${snapshotFilterRegex}`)
    }

    for (const packageName of Object.keys(packagesData)) {
      core.info(`Evaluating package: ${packageName}`)
      const details = packagesData[packageName]
      const totalVersionCount = details.releases.count +
        details.snapshots.count + details.others.count
      const packageDiscardVersions: GitHubVersion[] = []

      if (considerReleases) {
        const discard = getVersionsToDiscard(
          details.releases.versions,
          releaseKeepCount,
          releaseKeepDays,
        )
        core.info(`  Releases to discard: ${discard.length}`)
        packageDiscardVersions.push(...discard)
      }
      if (considerSnapshots) {
        const discard = getVersionsToDiscard(
          details.snapshots.versions,
          currentSnapshotKeepCount,
          currentSnapshotKeepDays,
          snapshotFilterRegex,
        )
        core.info(`  Snapshots to discard: ${discard.length}`)
        packageDiscardVersions.push(...discard)
      }
      if (considerOthers) {
        const discard = getVersionsToDiscard(
          details.others.versions,
          otherKeepCount,
          otherKeepDays,
        )
        core.info(`  Others to discard: ${discard.length}`)
        packageDiscardVersions.push(...discard)
      }

      core.info(
        `  Total versions to discard for ${packageName}: ${packageDiscardVersions.length} / ${totalVersionCount}`,
      )

      if (
        packageDiscardVersions.length > 0 &&
        packageDiscardVersions.length === totalVersionCount
      ) {
        core.info(
          `All versions of package '${packageName}' scheduled for deletion. Deleting package instead.`,
        )
        packagesToDelete.push({
          org: repoOwner,
          package_type: PACKAGE_TYPE,
          package_name: packageName,
        })
      } else if (packageDiscardVersions.length > 0) {
        core.info(
          `Scheduling ${packageDiscardVersions.length} specific versions of package '${packageName}' for deletion.`,
        )
        for (const version of packageDiscardVersions) {
          versionsToDelete.push({
            org: repoOwner,
            package_type: PACKAGE_TYPE,
            package_name: packageName,
            package_version_id: version.id,
            package_version_name: version.name,
            package_version_updated_at: version.updated_at,
          })
        }
      } else {
        core.info(`  No versions to discard for ${packageName}.`)
      }
    }
    core.endGroup()

    // --- Set Outputs ---
    core.startGroup('Setting Outputs')
    const packagesToDeleteJson = JSON.stringify(packagesToDelete, null, 2)
    const versionsToDeleteJson = JSON.stringify(versionsToDelete, null, 2)

    core.setOutput('delete-packages-count', packagesToDelete.length.toString())
    core.setOutput('delete-versions-count', versionsToDelete.length.toString())
    core.setOutput('delete-packages-json', packagesToDeleteJson)
    core.setOutput('delete-versions-json', versionsToDeleteJson)

    logMultiline(
      `${packagesToDelete.length} package(s) will be deleted:`,
      packagesToDeleteJson,
    )
    logMultiline(
      `${versionsToDelete.length} package version(s) will be deleted:`,
      versionsToDeleteJson,
    )
    core.endGroup()

    core.info('Step completed: Process Maven Packages for Pruning')
  } catch (error) {
    handleError(error, 'Error in Process Maven Packages for Pruning')
  }
}

// Standard execution guard
if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
