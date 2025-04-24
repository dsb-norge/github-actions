import { core, github } from 'common/deps.ts'
import { getActionInput, tryParseJson } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'

export interface NotifyStatusPayload {
  repository: string
  workflow: string
  job: string
  runId: string
  sha: string
  status: string
  applicationName?: string
  applicationNames: string[]
  step?: string
  timestamp: string
  extraData?: Record<string, unknown>
}

// List of endpoints to notify (edit as needed)
const NOTIFY_ENDPOINTS = [
  'https://pr-266-status.dev.dsbnorge.no/api/v1/github/action-status'
] as const

export async function run(): Promise<void> {
  core.info('Starting: notify-internal-status')
  try {
    const status = getActionInput('status', true)
    const stepName = getActionInput('step-name', false)
    const extraDataInput = getActionInput('extra-data', false) || '{}'
    const oidcToken = getActionInput('oidc-token', false)
    const applicationNameInput = getActionInput('application-name', false)
    const appVarsInput = getActionInput('appvars', false)
    const applicationName = applicationNameInput
    let applicationNames: string[] = []
    if (appVarsInput) {
      const appVars = tryParseJson<unknown>(appVarsInput)
      if (Array.isArray(appVars)) {
        applicationNames = appVars
          .map((a) => typeof a === 'object' && a && 'application-name' in a ? String((a as Record<string, unknown>)['application-name']) : undefined)
          .filter((n): n is string => Boolean(n))
      } else if (appVars && typeof appVars === 'object' && 'application-name' in appVars) {
        applicationNames = [String((appVars as Record<string, unknown>)['application-name'])]
      }
    }
    const extraData = tryParseJson<Record<string, unknown>>(extraDataInput) ?? {}

    const repository = `${github.context.repo.owner}/${github.context.repo.repo}`
    const workflow = github.context.workflow
    const job = github.context.job
    const runId = String(github.context.runId)
    const sha = github.context.sha

    const payload: NotifyStatusPayload = {
      repository,
      workflow,
      job,
      runId,
      sha,
      status,
      applicationName,
      applicationNames,
      timestamp: new Date().toISOString(),
      ...(stepName ? { step: stepName } : {}),
      ...(Object.keys(extraData).length > 0 ? { extraData } : {}),
    }

    core.debug(`Payload: ${JSON.stringify(payload)}`)
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (oidcToken) headers['Authorization'] = `Bearer ${oidcToken}`

    await Promise.all(
      NOTIFY_ENDPOINTS.map(async (endpoint) => {
        try {
          core.info(`Sending status to ${endpoint}`)
          const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
          })
          if (!response.ok) {
            core.warning(`API request to ${endpoint} failed: ${response.status} ${await response.text()}`)
          } else {
            core.info(`API request to ${endpoint} successful (${response.status})`)
          }
        } catch (err) {
          core.warning(`Error sending to ${endpoint}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }),
    )
    core.info('Step completed.')
  } catch (error) {
    handleError(error, 'Error in notify-internal-status')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
