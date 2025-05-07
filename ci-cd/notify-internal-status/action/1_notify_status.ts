import { core, github } from 'common/deps.ts'
import { getActionInput, tryParseJson } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'

// Allowed status values (GitHub job.status + custom)
export const VALID_NOTIFY_STATUSES = [
  'success',
  'failure',
  'cancelled',
  'started',
] as const
export type NotifyStatus = typeof VALID_NOTIFY_STATUSES[number] | 'unknown'

// Allowed step-name values (minimal, for tracker phases)
export const VALID_NOTIFY_STEP_NAMES = [
  'ci-cd-started',
  'build-matrix-started',
  'build-matrix-finished',
  'app-build-started',
  'app-build-finished',
  'app-deploy-started',
  'app-deploy-finished',
] as const
export type NotifyStepName = typeof VALID_NOTIFY_STEP_NAMES[number]

export interface NotifyStatusPayload {
  repository: string
  workflow: string
  job: string
  runId: string
  sha: string
  status: NotifyStatus
  applicationName?: string
  applicationNames: string[]
  step?: NotifyStepName
  timestamp: string
  extraData?: Record<string, unknown>
  isPullRequest: boolean
  pullRequestState?: 'opened' | 'closed'
  runAttempt?: number
}

// List of endpoints to notify (edit as needed)
const NOTIFY_ENDPOINTS = [
  'https://status.dev.dsbnorge.no/api/v1/github/action-status',
  'https://status.dsbnorge.no/api/v1/github/action-status',
] as const

export async function run(): Promise<void> {
  core.info('Starting: notify-internal-status')
  try {
    const statusInput = getActionInput('status', true)
    const status: NotifyStatus = (VALID_NOTIFY_STATUSES as readonly string[]).includes(statusInput) ? (statusInput as NotifyStatus) : 'unknown'
    const stepNameInput = getActionInput('step-name', false)
    const stepName: NotifyStepName | undefined = stepNameInput && (VALID_NOTIFY_STEP_NAMES as readonly string[]).includes(stepNameInput) ? (stepNameInput as NotifyStepName) : undefined
    const extraDataInput = getActionInput('extra-data', false) || '{}'
    // Basic Auth inputs
    const basicAuthUsername = getActionInput('basic-auth-username', false) || 'ci-cd'
    const basicAuthPassword = getActionInput('basic-auth-password', true)
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
    const runAttempt = Deno.env.get('GITHUB_RUN_ATTEMPT') ? Number(Deno.env.get('GITHUB_RUN_ATTEMPT')) : undefined

    // Detect PR context and state
    const isPullRequest = github.context.eventName === 'pull_request' || github.context.eventName === 'pull_request_target'
    let pullRequestState: 'opened' | 'closed' | undefined
    if (isPullRequest) {
      const pr = github.context.payload?.pull_request
      if (pr && typeof pr.state === 'string') {
        pullRequestState = pr.state === 'closed' ? 'closed' : 'opened'
      } else {
        pullRequestState = undefined
      }
    }

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
      isPullRequest,
      ...(pullRequestState ? { pullRequestState } : {}),
      ...(runAttempt ? { runAttempt } : {}),
    }

    core.debug(`Payload: ${JSON.stringify(payload)}`)
    const headers: HeadersInit = { 'Content-Type': 'application/json' }

    const credentials = btoa(`${basicAuthUsername}:${basicAuthPassword}`)
    headers['Authorization'] = `Basic ${credentials}`

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
