import * as originalCore from 'npm:@actions/core@1.11.1'
import * as originalGithub from 'npm:@actions/github@6.0.0'

export let core = originalCore
export let github = originalGithub

export function setCore(newCore: unknown) {
  core = newCore as typeof originalCore
}
export function setGithub(newGithub: unknown) {
  github = newGithub as typeof originalGithub
}
export { exists } from 'jsr:@std/fs@1.0.15/exists'
export { basename, dirname, isAbsolute, join, relative, resolve } from 'jsr:@std/path@1.0.8'
export { parse as parseYaml, stringify as stringifyYaml } from 'jsr:@std/yaml@1.0.5'
export { XMLParser as parseXML } from 'npm:fast-xml-parser@5.0.9'
export { crypto } from 'jsr:@std/crypto@1.0.4'
export { ensureDir, expandGlob } from 'jsr:@std/fs@1.0.15'
export { encodeHex } from 'jsr:@std/encoding@1.0.8/hex'
export { format as formatDate } from 'jsr:@std/datetime@0.225.3/format'
export { delay } from 'jsr:@std/async@1.0.12/delay'
