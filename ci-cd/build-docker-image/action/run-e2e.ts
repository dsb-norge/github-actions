import { core } from 'common/deps.ts'
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

export async function run(): Promise<void> {
  core.info('Starting: run-e2e')
  const mainContainer = 'e2e-app'
  try {
    // --- Get Inputs & Env Vars ---
    const dsbBuildEnvsInput = getActionInput('dsb-build-envs', true)
    const appVars = tryParseJson<AppVars>(dsbBuildEnvsInput)
    if (!appVars) throw new Error("Input 'dsb-build-envs' parse failed.")
    const mainImage = `${appVars['application-image-id']}:latest`
    const playwrightImage = `${appVars['application-image-id']}-playwright:local`

    // --- Dynamic port mapping ---
    const hostPort = getFreePort()
    const containerPort = 8080
    const backendUrl = `http://test-application-pr-434.test-application-pr-434.svc.cluster.local:8080`

    // --- Main Logic ---
    await executeCommand(
      [
        'docker',
        'run',
        '-d',
        '--rm',
        '--name',
        mainContainer,
        '-p',
        `${hostPort}:${containerPort}`,
        '-e',
        `LOC_API_PROXY_PASS_HOST=${backendUrl}`,
        mainImage,
      ],
      'docker run main app',
    )

    await waitForAppReady(`http://localhost:${hostPort}`)

    await executeCommand(
      [
        'docker',
        'run',
        '--rm',
        '--name',
        'e2e-playwright',
        '--network',
        'host',
        '-e',
        'CI=true',
        '-e',
        `PLAYWRIGHT_BASE_URL=http://localhost:${hostPort}`,
        playwrightImage,
      ],
      'docker run playwright',
    )

    await executeCommand([
      'docker',
      'stop',
      mainContainer,
    ], 'docker stop main app')

    core.setOutput('e2e', 'success')
    core.info('run-e2e completed.')
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    core.error(`Failed to run e2e tests: ${errorMessage}`)
    core.setOutput('e2e', 'failure')
    // --- Cleanup ---
    try {
      await executeCommand(['docker', 'stop', 'e2e-app'], 'Cleanup: stop main app')
    } catch (_) {
      // ignore cleanup errors
    }
    handleError(e, 'run-e2e')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
