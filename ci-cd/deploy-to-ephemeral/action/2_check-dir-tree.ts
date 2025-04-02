import { core, exists, join } from 'common/deps.ts'
import { handleError } from 'common/utils/error.ts'

const ROOT_DIR = './_pr-deploy'
const PREVIEW_DIR = join(ROOT_DIR, 'preview')
const APPS_DIR = join(ROOT_DIR, 'apps')
const ENV_DIR = join(APPS_DIR, 'dev')

async function checkDir(path: string, errorMsg: string): Promise<boolean> {
  const found = await exists(path)
  if (!found) {
    core.error(errorMsg)
  }
  return found
}

export async function run(): Promise<void> {
  core.info('Checking required config repo directories...')
  let allOk = true
  try {
    if (!(await checkDir(ROOT_DIR, `Unable to find config repo root directory '${ROOT_DIR}' after checkout!`))) {
      allOk = false
    }
    if (!(await checkDir(PREVIEW_DIR, `Unable to find preview chart directory '${PREVIEW_DIR}' within config repo!`))) {
      allOk = false
    }
    if (!(await checkDir(APPS_DIR, `Unable to find apps directory '${APPS_DIR}' within config repo!`))) {
      allOk = false
    }
    if (!(await checkDir(ENV_DIR, `Unable to find environment directory '${ENV_DIR}' under apps directory '${APPS_DIR}'!`))) {
      allOk = false
    }
    if (!allOk) {
      throw new Error('One or more required directories are missing in the checked-out config repo.')
    }
    core.info('All required directories found.')
  } catch (error) {
    handleError(error, 'check-dir-tree')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
