import * as originalCore from 'npm:@actions/core@1.11.1'

export let core = originalCore

export function setCore(newCore: unknown) {
  core = newCore as typeof originalCore
}
export { importPKCS8, SignJWT } from 'npm:jose@6.0.10'
