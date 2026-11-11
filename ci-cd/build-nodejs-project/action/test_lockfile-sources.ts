import { assertEquals, assertThrows } from 'common/test_deps.ts'
import { findInstalledLockfile, findPackagesBypassingFirewall } from './lockfile-sources.ts'

async function dirWith(...files: string[]): Promise<string> {
  const dir = await Deno.makeTempDir()
  for (const file of files) await Deno.writeTextFile(`${dir}/${file}`, '{}')
  return dir
}

Deno.test('findInstalledLockfile: prefers npm-shrinkwrap.json, as npm ci does', async () => {
  assertEquals(await findInstalledLockfile(await dirWith('package-lock.json', 'npm-shrinkwrap.json')), 'npm-shrinkwrap.json')
})

Deno.test('findInstalledLockfile: falls back to package-lock.json', async () => {
  assertEquals(await findInstalledLockfile(await dirWith('package-lock.json')), 'package-lock.json')
})

Deno.test('findInstalledLockfile: returns null without a lockfile', async () => {
  assertEquals(await findInstalledLockfile(await dirWith()), null)
})

Deno.test('findPackagesBypassingFirewall: accepts registry and file: packages', () => {
  const lock = {
    lockfileVersion: 3,
    packages: {
      '': {},
      'node_modules/vue': { resolved: 'https://registry.npmjs.org/vue/-/vue-3.5.45.tgz' },
      'node_modules/xlsx': { resolved: 'file:vendor/xlsx-0.20.3.tgz' },
      'node_modules/local-lib': { resolved: 'libs/local-lib', link: true },
    },
  }
  assertEquals(findPackagesBypassingFirewall(lock), [])
})

Deno.test('findPackagesBypassingFirewall: reports packages from other hosts', () => {
  const lock = {
    lockfileVersion: 3,
    packages: {
      'node_modules/xlsx': { resolved: 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz' },
      'node_modules/forked': { resolved: 'git+ssh://git@github.com/someone/forked.git#abc123' },
      'node_modules/vue': { resolved: 'https://registry.npmjs.org/vue/-/vue-3.5.45.tgz' },
    },
  }
  assertEquals(findPackagesBypassingFirewall(lock), [
    'node_modules/xlsx https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz',
    'node_modules/forked git+ssh://git@github.com/someone/forked.git#abc123',
  ])
})

Deno.test('findPackagesBypassingFirewall: rejects a lockfile without a packages map', () => {
  assertThrows(() => findPackagesBypassingFirewall({ lockfileVersion: 1 }), Error, 'lockfileVersion 1')
})
