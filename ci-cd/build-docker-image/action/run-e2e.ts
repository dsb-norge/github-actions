import { core, exists, join } from 'common/deps.ts'
import { executeCommand, getActionInput, tryParseJson } from 'common/utils/helpers.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'
import { handleError } from 'common/utils/error.ts'

// Helper to find a free port on the host
function getFreePort(): number {
  const listener = Deno.listen({ port: 0 })
  const { port } = listener.addr as Deno.NetAddr
  listener.close()
  return port
}

async function waitForAppReady(url: string, timeoutMs = 20000, intervalMs = 500): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // ignore errors, just retry
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(`App not ready at ${url} after ${timeoutMs}ms`)
}

async function stopContainerIfExists(containerName: string): Promise<void> {
  try {
    await executeCommand(['docker', 'stop', containerName], `stop ${containerName}`)
  } catch {
    // Container doesn't exist or already stopped - ignore
  }
}

async function removeNetworkIfExists(networkName: string): Promise<void> {
  try {
    await executeCommand(['docker', 'network', 'rm', networkName], `remove network ${networkName}`)
  } catch {
    // Network doesn't exist - ignore
  }
}

export async function run(): Promise<void> {
  core.info('Starting: run-e2e')
  const mainContainer = 'e2e-app'
  const backendContainer = 'mock-backend'
  const networkName = `e2e-network-${crypto.randomUUID().substring(0, 8)}`

  try {
    // --- Get Inputs & Env Vars ---
    const dsbBuildEnvsInput = getActionInput('dsb-build-envs', true)
    const appVars = tryParseJson<AppVars>(dsbBuildEnvsInput)
    if (!appVars) throw new Error("Input 'dsb-build-envs' parse failed.")
    const mainImage = `${appVars['application-image-id']}:latest`
    const playwrightImage = `${appVars['application-image-id']}-playwright:local`
    const applicationSourcePath = appVars['application-source-path'] || './frontend'
    const backendJsonConfig = `${applicationSourcePath}/${appVars['nodejs-e2e-backend-json'] ?? 'e2e/db.json'}`
    const backendRoutes = `${applicationSourcePath}/${appVars['nodejs-e2e-backend-routes'] ?? 'e2e/routes.json'}`

    await executeCommand(['docker', 'network', 'create', networkName], `Create docker network ${networkName}`)

    const backendPort = getFreePort()
    let backendUrl: string | undefined = undefined
    if (await exists(backendJsonConfig)) {
      const hasCustomRoutes = await exists(backendRoutes)
      await executeCommand(
        [
          'docker',
          'run',
          '-d',
          '--rm',
          '--name',
          backendContainer,
          '--network',
          networkName,
          '--pull',
          'always',
          '-p',
          `${backendPort}:3000`,
          '-v',
          `${backendJsonConfig}:/data/db.json`,
          ...(hasCustomRoutes ? [`-v`, `${backendRoutes}:/data/routes.json`] : []),
          'dsbacr.azurecr.io/dsb-norge/dsb-json-server:latest',
        ],
        `docker run ${backendContainer}`,
      )
      try {
        await waitForAppReady(`http://localhost:${backendPort}/`)
      } catch (e) {
        await executeCommand(['docker', 'logs', 'mock-backend'], 'Show mock backend logs')
        throw e
      }
      core.info(`Started ${backendContainer} for E2E tests.`)
      backendUrl = `http://${backendContainer}:3000`
    } else {
      if (!await exists(backendJsonConfig)) {
        core.warning(`E2E backend JSON config not found: ${backendJsonConfig}, from current directory '${Deno.cwd()}'. Skipping mock backend setup.`)
      } else {
        core.info('E2E backend JSON config not provided. Skipping mock backend setup.')
      }
      backendUrl = appVars['nodejs-e2e-backend-url']
    }

    if (!backendUrl || backendUrl.trim() === '') {
      core.warning('No backend configuration or URL provided for E2E tests. Skipping E2E tests.')
      core.setOutput('e2e', 'skipped')
      return
    }

    // --- Dynamic port mapping ---
    const hostPort = getFreePort()
    const containerPort = 8080

    // --- Main Logic ---
    await executeCommand(
      [
        'docker',
        'run',
        '-d',
        '--rm',
        '--name',
        mainContainer,
        '--network',
        networkName,
        '-p',
        `${hostPort}:${containerPort}`,
        '-e',
        `LOC_API_PROXY_PASS_HOST=${backendUrl}`,
        '-e',
        `LOC_SOCKET_PROXY_PASS_HOST=${backendUrl}`,
        mainImage,
      ],
      'docker run main app',
    )

    try {
      await waitForAppReady(`http://localhost:${hostPort}`)
    } catch (e) {
      await executeCommand(['docker', 'logs', mainContainer], 'Show main app logs')
      throw e
    }

    const resultsDir = `${Deno.cwd()}/playwright-report`
    const tmpDir = `/tmp/playwright-report-${crypto.randomUUID()}`
    await Deno.mkdir(tmpDir, { recursive: true })

    let didFail = false
    try {
      await executeCommand(
        [
          'docker',
          'run',
          '--rm',
          '--userns=host',
          '--name',
          'e2e-playwright',
          '--network',
          'host',
          '-e',
          'CI=true',
          '-e',
          `PLAYWRIGHT_BASE_URL=http://localhost:${hostPort}`,
          '-v',
          `${tmpDir}:/app/playwright-report`,
          '-v',
          `${tmpDir}:/app/test-results`,
          playwrightImage,
        ],
        'docker run playwright',
      )
    } catch {
      didFail = true
    }
    core.setOutput('e2e-has-ran', 'true')

    await executeCommand(['cp', '-r', join(tmpDir, '.'), resultsDir], 'copy playwright-report to workspace')

    await stopContainerIfExists(mainContainer)
    await stopContainerIfExists(backendContainer)
    await removeNetworkIfExists(networkName)

    if (didFail) {
      core.setOutput('e2e', 'failure')
      core.error('E2E tests failed.')
    } else {
      core.setOutput('e2e', 'success')
      core.info('run-e2e completed.')
    }
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    core.error(`Failed to run e2e tests: ${errorMessage}`)
    core.setOutput('e2e', 'failure')
    stopContainerIfExists(mainContainer)
    stopContainerIfExists(backendContainer)
    removeNetworkIfExists(networkName)
    handleError(e, 'run-e2e')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
