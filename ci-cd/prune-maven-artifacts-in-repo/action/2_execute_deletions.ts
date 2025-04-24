import { core, github } from 'common/deps.ts'
import { getActionInput, tryParseJson } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'

// --- Interfaces ---
interface DeleteItem {
  org: string
  package_type: 'maven' | 'npm'
  package_name: string
  package_version_id?: number // Only for version deletion
  package_version_name?: string // Only for version deletion
  package_version_updated_at?: string // Only for version deletion
}

// --- Main Function ---
export async function run(): Promise<void> {
  core.info('Starting: Execute Package/Version Deletions')

  try {
    // --- Get Inputs & Env Vars ---
    const token = getActionInput('github-packages-token', true)
    const octokit = github.getOctokit(token)
    const dryRunInput = getActionInput('dry-run') || 'false'
    const isDryRun = dryRunInput.toLowerCase() !== 'false'

    const packagesJson = Deno.env.get('DELETE_PACKAGES_JSON') || '[]'
    const versionsJson = Deno.env.get('DELETE_VERSIONS_JSON') || '[]'

    const packagesToDelete = tryParseJson<DeleteItem[]>(packagesJson)
    const versionsToDelete = tryParseJson<DeleteItem[]>(versionsJson)

    if (!packagesToDelete || !versionsToDelete) {
      throw new Error('Failed to parse DELETE_PACKAGES_JSON or DELETE_VERSIONS_JSON.')
    }

    if (isDryRun) {
      core.info('----------------------')
      core.info('💫 THIS IS A DRILL 💫')
      core.info('      I repeat')
      core.info('💫 THIS IS A DRILL 💫')
      core.info('----------------------')
      core.info(
        'NO DESTRUCTIVE OPERATIONS WILL BE PERFORMED.',
      )
    }

    let hasErrors = false

    // --- Delete Packages ---
    if (packagesToDelete.length > 0) {
      core.startGroup(`Deleting ${packagesToDelete.length} package(s)`)
      for (const pkg of packagesToDelete) {
        core.info(`Deleting ${pkg.package_type} package '${pkg.package_name}' (org: ${pkg.org})`)
        if (!isDryRun) {
          try {
            await octokit.rest.packages.deletePackageForOrg({
              org: pkg.org,
              package_type: pkg.package_type,
              package_name: pkg.package_name,
            })
            core.info('Done.')
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            core.error(`Failed to delete package ${pkg.package_name}: ${errorMessage}`)
            hasErrors = true // Continue deleting others
          }
        } else {
          core.info('[Dry Run] Skipped actual deletion.')
        }
      }
      core.endGroup()
    } else {
      core.info('No packages to delete.')
    }

    // --- Delete Versions ---
    if (versionsToDelete.length > 0) {
      core.startGroup(`Deleting ${versionsToDelete.length} version(s)`)
      for (const ver of versionsToDelete) {
        core.info(`Deleting version '${ver.package_version_name}' (ID: ${ver.package_version_id}, Updated: ${ver.package_version_updated_at}) from package '${ver.package_name}' (org: ${ver.org})`)
        if (!isDryRun) {
          try {
            await octokit.rest.packages.deletePackageVersionForOrg({
              org: ver.org,
              package_type: ver.package_type,
              package_name: ver.package_name,
              package_version_id: ver.package_version_id!,
            })
            core.info('Done.')
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            core.error(`Failed to delete version ${ver.package_version_name} (ID: ${ver.package_version_id}): ${errorMessage}`)
            hasErrors = true // Continue deleting others
          }
        } else {
          core.info('[Dry Run] Skipped actual deletion.')
        }
      }
      core.endGroup()
    } else {
      core.info('No package versions to delete.')
    }

    if (hasErrors) {
      // Use core.setFailed to indicate issues but allow workflow to potentially continue
      core.setFailed('One or more deletion operations failed. Check logs for details.')
    } else {
      core.info('Step completed: Execute Package/Version Deletions')
    }
  } catch (error) {
    // Use handleError for unexpected script errors
    handleError(error, 'Error in Execute Package/Version Deletions')
  }
}

// Standard execution guard
if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
