import { core, github } from 'common/deps.ts'
import { handleError } from 'common/utils/error.ts'

const EXPECTED_EVENT_NAME = 'pull_request'
const DISALLOWED_ACTION = 'closed'

export function run(): void {
  core.info('Starting event trigger validation...')

  try {
    // --- Get Context ---
    const context = github.context
    const eventName = context.eventName
    // The 'action' property exists on the payload for webhook events
    const action = context.payload.action as string | undefined // Cast for type safety

    core.info(`Actual event name: '${eventName}'`)
    core.info(`Actual event action: '${action ?? 'N/A'}'`) // Log action if present

    // --- Validation Logic ---
    let validationFailed = false
    let errorMessage = ''

    // Check 1: Is the event name 'pull_request'?
    if (eventName !== EXPECTED_EVENT_NAME) {
      validationFailed = true
      errorMessage = `This action should only be called by '${EXPECTED_EVENT_NAME}' events, but was triggered by '${eventName}'!`
      core.error(errorMessage) // Log the specific error
    } // Check 2: If it *is* a pull_request event, is the action 'closed'?
    else if (action === DISALLOWED_ACTION) {
      // This check only makes sense if the event name was correct
      validationFailed = true
      errorMessage = `This action should not be called by event action '${DISALLOWED_ACTION}'!`
      core.error(errorMessage) // Log the specific error
    }

    // --- Set Failure Status ---
    if (validationFailed) {
      core.setFailed(errorMessage)
    } else {
      core.info('Event trigger validation passed successfully.')
    }
  } catch (error) {
    handleError(error, 'validating event trigger')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
