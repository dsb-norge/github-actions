import { assertEquals, crypto, fail } from 'common/test_deps.ts'
import { setCore } from 'common/deps.ts'
import { main } from './action.ts'

// A mock private key for testing purposes
const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDCFg4UrY5xtulv
/NXKmL1J4qI1SopAfTNMo3X7p+kJO7plqUYjzaztcre1qfh0m33Sm1Q8oPbO/GpP
MU1/HgcceytgJ/b4UwufVVMl9BrMDYG8moDBylbVupFQS3Ly1L9i/iFG9Z9A9xzY
Zzf799A45bnvNXL6s2glzvjiRvfQ2NDF0anTcnZLcYtC7ugq1IMM+ihAcPfw8Qw2
chN/SmP4qAM+PKaQwagmU7doqmmyN9u38AfoYZ1GCFhEs5TBBT6H6h9YdHeVtiIq
1c+fl03biSIfLrV7dUBD39gBmXBcL/30Ya3D82mCEUC4zg/UkOfQOmkmV3Lc8YUL
QZ8EJkBLAgMBAAECggEAVuVE/KEP6323WjpbBdAIv7HGahGrgGANvbxZsIhm34ls
VOPK0XDegZkhAybMZHjRhp+gwVxX5ChC+J3cUpOBH5FNxElgW6HizD2Jcq6t6LoL
YgPSrfEHm71iHg8JsgrqfUnGYFzMJmv88C6WdCtpgG/qJV1K00/Ly1G1QKoBffEs
+v4fAMJrCbUdCz1qWto+PU+HLMEo+krfEpGgcmtZeRlDADh8cETMQlgQfQX2VWq/
aAP4a1SXmo+j0cvRU4W5Fj0RVwNesIpetX2ZFz4p/JmB5sWFEj/fC7h5z2lq+6Bm
e2T3BHtXkIxoBW0/pYVnASC8P2puO5FnVxDmWuHDYQKBgQDTuuBd3+0tSFVEX+DU
5qpFmHm5nyGItZRJTS+71yg5pBxq1KqNCUjAtbxR0q//fwauakh+BwRVCPOrqsUG
jBSb3NYE70Srp6elqxgkE54PwQx4Mr6exJPnseM9U4K+hULllf5yjM9edreJE1nV
NVgFjeyafQhrHKwgr7PERJ/ikwKBgQDqqsT1M+EJLmI1HtCspOG6cu7q3gf/wKRh
E8tu84i3YyBnI8uJkKy92RNVI5fvpBARe3tjSdM25rr2rcrcmF/5g6Q9ImxZPGCt
86eOgO9ErNtbc4TEgybsP319UE4O41aKeNiBTAZKoYCxv/dMqG0j4avmWzd+foHq
gSNUvR2maQKBgQCYeqOsV2B6VPY7KIVFLd0AA9/dwvEmgAYLiA/RShDI+hwQ/5jX
uxDu37KAhqeC65sHLrmIMUt4Zdr+DRyZK3aIDNEAesPMjw/X6lCXYp1ZISD2yyym
MFGH8X8CIkstI9Faf9vf6PJKSFrC1/HA7wq17VCwrUzLvrljTMW8meM/CwKBgCpo
2leGHLFQFKeM/iF1WuYbR1pi7gcmhY6VyTowARFDdOOu8GXYI5/bz0afvCGvAMho
DJCREv7lC/zww6zCTPYG+HOj+PjXlJFba3ixjIxYwPvyEJiDK1Ge18sB7Fl8dHNq
C5ayaqCqN1voWYUdGzxU2IA1E/5kVo5O8FesJeOhAoGBAImJbZFf+D5kA32Xxhac
59lLWBCsocvvbd1cvDMNlRywAAyhsCb1SuX4nEAK9mrSBdfmoF2Nm3eilfsOds0f
K5mX069IKG82CMqh3Mzptd7e7lyb9lsoGO0BAtjho3cWtha/UZ70vfaMzGuZ6JmQ
ak6k+8+UFd93M4z0Qo74OhXB
-----END PRIVATE KEY-----`

// Mock the core functions
const mockCore = {
  getInput: (name: string) => {
    if (name === 'github-app-id') {
      return '123456'
    }
    if (name === 'github-app-installation-id') {
      return '789012'
    }
    if (name === 'github-app-private-key') {
      return TEST_PRIVATE_KEY
    }
    return ''
  },
  setOutput: (name: string, value: string) => {
    console.debug(`Setting output ${name} to ${value}`)
    output[name] = value
  },
  setFailed: (message: string) => {
    console.error(`Action failed with error: ${message}`)
  },
  info: (message: string) => {
    console.log(`Info: ${message}`)
  },
}

const output = {}

setCore(mockCore)

Deno.test('should fetch github-token correctly', async () => {
  const mockFetch = async (url: string, options: RequestInit) => {
    assertEquals(url.includes('/installations/'), true)
    assertEquals(options.method, 'POST')
    assertEquals(
      options.headers?.['Authorization']?.startsWith('Bearer '),
      true,
    )

    const jwt = options.headers?.['Authorization']?.substring(7)
    const b64Claims = jwt.split('.')[1]
    const claims = JSON.parse(atob(b64Claims))

    assertEquals(claims.iss, '123456')

    assertEquals(options.headers?.['Accept'], 'application/vnd.github+json')
    assertEquals(options.headers?.['X-GitHub-Api-Version'], '2022-11-28')

    return new Response(JSON.stringify({ token: 'mock-token' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  globalThis.fetch = mockFetch as typeof fetch

  await main()

  assertEquals(output['github-token'], 'mock-token')
})

Deno.test('should handle errors correctly', async () => {
  const mockFetch = async (url: string, options: RequestInit) => {
    return new Response('Not Found', { status: 404 })
  }

  globalThis.fetch = mockFetch as typeof fetch

  try {
    await main()
    fail('Expected error to be thrown')
  } catch {
    // Expected error to be thrown
  }
})
