import { core } from 'common/deps.ts'

export function handleError(error: unknown, context: string) {
  if (error instanceof Error) {
    const stackTrace = error.stack
    const errorMessage = error.message
    core.setFailed(`Failed to ${context}: ${errorMessage}\n${stackTrace}`)
  } else {
    core.setFailed(`Failed to ${context}: ${error}`)
  }
}
