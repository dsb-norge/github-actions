import { ApplicationType } from './application-type.ts'

export type AppDependency = { group?: string; name: string; operator?: string; version?: string }

export interface AppVars {
  // Core App Info
  'application-name': string
  'application-version'?: string
  'application-type'?: ApplicationType // e.g., 'spring-boot', 'vue', 'maven-library'
  'application-description'?: string
  'application-vendor'?: string
  'application-build-timestamp'?: string // Often set later
  'application-dependencies'?: AppDependency[] // List of dependencies with group, name, version, operator

  // Source Info (some generated)
  'application-source-path'?: string
  'application-additional-watch-files'?: string | string[] // Optional: additional files to watch for changes (relative to repo root)
  'application-source'?: string // Generated: repo URL
  'application-source-revision'?: string // Generated: commit SHA

  // Caller Repo Info (generated)
  'caller-repo-default-branch'?: string
  'caller-repo-calling-branch'?: string
  'caller-repo-is-on-default-branch'?: boolean

  // Docker / ACR
  'acr-tenant-id'?: string // Secret - Azure tenant ID for ACR auth
  'acr-subscription-id'?: string // Secret - Azure subscription ID for ACR
  'acr-push-service-principal-id'?: string // Secret - Azure service principal ID with push rights
  'acr-delete-service-principal-id'?: string // Service principal ID for delete access
  'docker-image-registry'?: string
  'docker-image-repo'?: string
  'application-image-name'?: string
  'application-image-id'?: string // Generated: registry/repo/name
  'docker-image-prune-keep-min-images'?: string | number
  'docker-image-prune-keep-num-days'?: string | number

  // Java / Maven
  'java-distribution'?: string
  'java-version'?: string
  'jasypt-password'?: string // Secret
  'maven-user-settings-repositories-yml'?: string // YAML string
  'maven-extra-envs-from-github-yml'?: string // YAML string (input only)
  'maven-extra-envs-from-github'?: Record<string, string> // JSON object (generated)
  'maven-build-project-deploy-to-repositories-yml'?: string // YAML string
  'maven-build-project-arguments'?: string
  'maven-build-project-command'?: string
  'maven-build-project-goals'?: string
  'maven-build-project-version-arguments'?: string
  'maven-build-project-version-command'?: string
  'maven-build-project-version-goals'?: string
  'maven-build-project-deploy-release-artifacts'?: string | boolean
  'maven-build-project-deploy-release-deploy-command'?: string
  'maven-build-project-deploy-release-version-command'?: string
  'maven-build-project-deploy-snapshot-artifacts'?: string | boolean
  'maven-build-project-deploy-snapshot-deploy-command'?: string
  'maven-build-project-deploy-snapshot-version-command'?: string
  'maven-build-skip-tests'?: string | boolean // Indicates if tests are skipped

  // Node.js
  'nodejs-version'?: string
  'nodejs-build-project-custom-command-final'?: string
  'nodejs-build-project-custom-command-pre-npm-ci'?: string
  'nodejs-build-project-custom-command-pre-npm-run-build'?: string
  'nodejs-build-project-custom-command-pre-npm-run-lint'?: string
  'nodejs-e2e-enabled'?: string | boolean // Indicates if E2E tests are enabled
  'nodejs-e2e-backend-json'?: string // Path to JSON file containing json-server config
  'nodejs-e2e-backend-routes'?: string // Path to JSON file containing json-server routes
  'nodejs-e2e-backend-url'?: string // URL for the backend service used in E2E tests

  // Spring Boot Build Image
  'spring-boot-build-image-arguments'?: string
  'spring-boot-build-image-command'?: string
  'spring-boot-build-image-pull-images-pre-build-yml'?: string | string[] // YAML string
  'spring-boot-build-image-goals'?: string
  'spring-boot-build-image-version-arguments'?: string
  'spring-boot-build-image-version-command'?: string
  'spring-boot-build-image-version-goals'?: string

  // PR Deployment
  'pr-deploy-skip'?: string | boolean // Indicates if PR deployment is skipped
  'pr-deploy-aks-cluster-name'?: string
  'pr-deploy-aks-resource-group'?: string
  'pr-deploy-aks-creds-tenant-id'?: string // Secret - Azure tenant ID
  'pr-deploy-aks-creds-subscription-id'?: string // Secret - Azure subscription ID
  'pr-deploy-aks-creds-service-principal-id'?: string // Secret - Azure service principal (client) ID
  'pr-deploy-additional-helm-values'?: string // YAML string
  'pr-deploy-k8s-application-name'?: string // Often generated
  'pr-deploy-k8s-namespace'?: string // Often generated
  'pr-deploy-app-config-branch'?: string // Generated
  'pr-deploy-argo-applications-url'?: string
  'pr-deploy-comment-additional-text'?: string
  'pr-deploy-comment-prefix'?: string

  // Static Deploy
  'static-deploy-environments'?: string // JSON array string? Or comma-separated? Assume string for now.
  'static-deploy-from-default-branch-only'?: string | boolean

  // GitHub Actions Cache (some generated)
  'github-dependencies-cache-enabled'?: string | boolean
  'github-dependencies-cache-path'?: string
  'github-dependencies-cache-key'?: string // Generated
  'github-dependencies-cache-restore-keys'?: string // Generated (multiline)
  'github-dependencies-cache-pr-base-key'?: string // Generated
  'github-dependencies-cache-delete-on-pr-close'?: string | boolean

  // Other Secrets / Tokens
  'app-config-repo'?: string
  'app-config-repo-token'?: string // Secret
  'github-repo-token'?: string // Secret (often GITHUB_TOKEN)
  'sonarqube-token'?: string // Secret

  // Internal Action Use (will be removed or not directly output)
  'app-vars'?: string // Input JSON string
  'github-json'?: string // Input JSON string
  'secrets-json'?: string // Input JSON string

  'vars-json'?: string // Input JSON string

  'has-changes'?: boolean // Generated: true if any changes detected
  'application-previous-version-tag'?: string | null // Generated: previous version tag (if no changes detected)

  // *** Index Signature ***
  // Allows assignment using variable keys (like inputKey) during the merge process.
  // While slightly less type-safe for *new* properties added this way,
  // it enables the dynamic merging logic while still providing type safety
  // for accessing known properties later (e.g., appVars["application-name"]).
  // deno-lint-ignore no-explicit-any
  [key: string]: any
}
