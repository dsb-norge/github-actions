import { AppVars } from 'common/interfaces/application-variables.ts'

export interface GithubMatrix {
  'application-name': string[]
  'include': {
    'application-name': string
    'app-vars': AppVars
  }[]
}
