import { handleError } from 'common/utils/error.ts'
import { core, importPKCS8, SignJWT } from 'common/deps.ts'

export async function main() {
  try {
    const githubAppId = core.getInput('github-app-id', { required: true })
    const githubAppInstallationId = core.getInput(
      'github-app-installation-id',
      { required: true },
    )
    const githubAppPrivateKey = core.getInput('GITHUB_APP_PRIVATE_KEY', { required: true })
    const tokenRequestBody = core.getInput('token-request-body', { required: false })

    core.info('Minting JWT ...')

    const privateKey = await importPKCS8(githubAppPrivateKey, 'RS256')

    const jwt = await new SignJWT({
      iat: Math.floor(Date.now() / 1000) - 5, // 5 seconds ago
      iss: githubAppId,
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setExpirationTime(Math.floor(Date.now() / 1000) + 600) // 10 minutes
      .sign(privateKey)

    core.info('Exchanging JWT for an installation access token ...')
    const response = await fetch(
      `https://api.github.com/app/installations/${githubAppInstallationId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${jwt}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: tokenRequestBody,
      },
    )

    if (!response.ok) {
      throw new Error(
        `Failed to get access token: ${response.status} ${response.statusText} ${await response
          .text()}`,
      )
    }

    const data = await response.json()
    const githubToken = data.token

    core.info('Returning the installation access token ...')
    core.setOutput('github-token', githubToken)
  } catch (error: unknown) {
    handleError(error, 'get github app installation token')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  main()
}
