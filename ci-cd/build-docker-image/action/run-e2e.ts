import { core } from 'common/deps.ts'
import { executeCommand, getActionInput, tryParseJson } from 'common/utils/helpers.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'

// Helper to find a free port on the host
function getFreePort(): number {
  const listener = Deno.listen({ port: 0 })
  const { port } = listener.addr as Deno.NetAddr
  listener.close()
  return port
}

export async function run(): Promise<void> {
  core.info('Starting: run-e2e')
  const mainContainer = 'e2e-app'
  let npmrcPath: string | undefined
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

    // --- NPM Auth Secret Handling ---
    if (appVars['npmjs-token'] && typeof appVars['npmjs-token'] === 'string') {
      npmrcPath = `.npmrc.e2e.${Date.now()}`
      await Deno.writeTextFile(
        npmrcPath,
        `//registry.npmjs.org/:_authToken=${appVars['npmjs-token']}`,
      )
      core.info(`Wrote temporary .npmrc for Docker secret: ${npmrcPath}`)
    }

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
        ...(npmrcPath ? ['--secret', `id=npmrc,src=${npmrcPath}`] : []),
        mainImage,
      ],
      'docker run main app',
    )

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
  } catch {
    core.setOutput('e2e', 'failure')
    // --- Cleanup ---
    try {
      await executeCommand(['docker', 'stop', 'e2e-app'], 'Cleanup: stop main app')
    } catch (_) {
      // ignore cleanup errors
    }
  } finally {
    if (npmrcPath) {
      try {
        await Deno.remove(npmrcPath)
        core.info(`Removed temporary .npmrc: ${npmrcPath}`)
      } catch (_) {
        // ignore cleanup errors
      }
    }
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
