import { core } from 'common/deps.ts'
import { getActionInput, tryParseJson } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'

function buildCommentPrefix(appVars: AppVars): string {
  return `${appVars['application-name']} ${appVars['pr-deploy-comment-prefix']}`
}

function buildCommentText(appVars: AppVars, commentPrefix: string): string {
  const mainBlock = [
    '```',
    `         name: ${appVars['application-name']}`,
    `      version: ${appVars['application-version']}`,
    `  description: ${appVars['application-description']}`,
    '```',
    `ArgoCD url: ${appVars['pr-deploy-argo-applications-url']}/${appVars['pr-deploy-k8s-application-name']}`,
  ].join('\n')

  const hasChanges: boolean = appVars['has-changes'] ?? false

  let commentText = `${commentPrefix}\n${hasChanges ? `:rocket: **Contains diff from ${appVars['caller-repo-default-branch'] ?? 'main'}** :rocket:\n` : `:information_source: **There are no changes from ${appVars['caller-repo-default-branch'] ?? 'main'}** :information_source:\n`}${mainBlock}`
  const additionalText = appVars['pr-deploy-comment-additional-text'] ?? ''
  if (additionalText.trim().length > 0) {
    commentText += `\n${additionalText}`
  }
  return commentText
}

export function run(): void {
  core.info('Creating PR comment text and prefix...')

  try {
    const dsbBuildEnvsInput: string = getActionInput('dsb-build-envs', true)
    const appVars: AppVars | null = tryParseJson<AppVars>(dsbBuildEnvsInput)
    if (!appVars) {
      throw new Error('Failed to parse dsb-build-envs JSON.')
    }
    const commentPrefix = buildCommentPrefix(appVars)
    const commentText = buildCommentText(appVars, commentPrefix)

    core.info(`Final PR comment prefix: ${commentPrefix}`)
    core.info(`Final PR comment text:\n${commentText}`)

    core.setOutput('prefix', commentPrefix)
    core.setOutput('comment', commentText)

    core.info('PR comment step completed.')
  } catch (error) {
    handleError(error, 'create-comment')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
