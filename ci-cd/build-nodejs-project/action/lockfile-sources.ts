/**
 * Which locked packages npm would fetch from somewhere other than the package firewall.
 *
 * npm only rewrites 'resolved' URLs on registry.npmjs.org to the configured registry (the firewall).
 * Rewriting every host ('replace-registry-host=always') would also mangle 'file:' dependencies, which
 * repos use for packages published outside npm, such as SheetJS xlsx. So the rewrite is pinned to
 * npm's default, and this check fails the build instead when a lockfile points at any other host.
 */

const FIREWALLED_REGISTRY = 'https://registry.npmjs.org/'

/** npm ci installs from npm-shrinkwrap.json instead of package-lock.json when both exist. */
const LOCKFILES_BY_PRECEDENCE = ['npm-shrinkwrap.json', 'package-lock.json'] as const

interface LockedPackage {
  resolved?: string
  link?: boolean
}

export interface PackageLock {
  lockfileVersion?: number
  packages?: Record<string, LockedPackage>
}

/**
 * @returns The name of the lockfile npm ci installs from in `dir`, or null when there is none.
 */
export async function findInstalledLockfile(dir: string): Promise<string | null> {
  for (const name of LOCKFILES_BY_PRECEDENCE) {
    try {
      await Deno.stat(`${dir}/${name}`)
      return name
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error
    }
  }
  return null
}

/**
 * @returns One '<path> <resolved>' line per package fetched from outside the firewall and the repo.
 * @throws Error for a lockfile without a 'packages' map (lockfileVersion 1), which cannot be checked.
 */
export function findPackagesBypassingFirewall(lock: PackageLock): string[] {
  if (!lock.packages) {
    throw new Error(`The lockfile has lockfileVersion ${lock.lockfileVersion ?? 'unknown'} and cannot be checked. Regenerate it with npm 7 or newer.`)
  }

  return Object.entries(lock.packages)
    .filter(([, pkg]) => !pkg.link && pkg.resolved !== undefined)
    .filter(([, pkg]) => !pkg.resolved!.startsWith(FIREWALLED_REGISTRY) && !pkg.resolved!.startsWith('file:'))
    .map(([path, pkg]) => `${path} ${pkg.resolved}`)
}
