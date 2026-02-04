export const PROTECTED_ENVS: Set<string> = new Set([
  'acr-tenant-id',
  'acr-subscription-id',
  'acr-push-service-principal-id',
  'acr-service-principal',
  'app-config-repo-token',
  'github-repo-token',
  'jasypt-password',
  'maven-extra-envs-from-github', // This is generated, not taken from input directly
  'pr-deploy-aks-creds-tenant-id',
  'pr-deploy-aks-creds-subscription-id',
  'pr-deploy-aks-creds-service-principal-id',
  'sonarqube-token',
])

export const SPECIAL_ENVS: Set<string> = new Set([
  'app-vars', // The input itself
  'application-image-id', // Generated
  'application-source', // Generated
  'application-source-revision', // Generated
  'caller-repo-calling-branch', // Generated
  'caller-repo-default-branch', // Generated
  'caller-repo-is-on-default-branch', // Generated
  'docker-image-prune-keep-min-images', // Handled specially based on event
  'docker-image-prune-keep-num-days', // Handled specially based on event
  'github-dependencies-cache-key', // Generated
  'github-dependencies-cache-restore-keys', // Generated
  'github-dependencies-cache-pr-base-key', // Generated
  'github-json', // Input context object
  'maven-build-project-deploy-to-repositories-yml', // Handled specially (YAML processing)
  'maven-extra-envs-from-github-yml', // Handled specially (YAML -> JSON processing)
  'maven-user-settings-repositories-yml', // Handled specially (YAML processing)
  'pr-deploy-additional-helm-values', // Handled specially (JSON/YAML processing)
  'pr-deploy-app-config-branch', // Generated
  'pr-deploy-k8s-application-name', // Handled specially (generation logic)
  'pr-deploy-k8s-namespace', // Handled specially (generation logic)
  'secrets-json', // Input context object
  'vars-json', // Input context object
])

export const ENVS_WITHOUT_SECRETS: Set<string> = new Set([
  'app-config-repo',
  'application-build-timestamp',
  'application-description',
  'application-image-id',
  'application-image-name',
  'application-name',
  'application-source',
  'application-source-path',
  'application-additional-watch-files',
  'application-source-revision',
  'application-type',
  'application-vendor',
  'application-version',
  'caller-repo-calling-branch',
  'caller-repo-default-branch',
  'caller-repo-is-on-default-branch',
  'docker-image-prune-keep-min-images',
  'docker-image-prune-keep-num-days',
  'docker-image-registry',
  'docker-image-repo',
  'github-dependencies-cache-delete-on-pr-close',
  'github-dependencies-cache-enabled',
  'github-dependencies-cache-key',
  'github-dependencies-cache-path',
  'github-dependencies-cache-pr-base-key',
  'github-dependencies-cache-restore-keys',
  'java-distribution',
  'java-version',
  'maven-build-project-arguments',
  'maven-build-project-command',
  'maven-build-project-deploy-release-artifacts',
  'maven-build-project-deploy-release-deploy-command',
  'maven-build-project-deploy-release-version-command',
  'maven-build-project-deploy-snapshot-artifacts',
  'maven-build-project-deploy-snapshot-deploy-command',
  'maven-build-project-deploy-snapshot-version-command',
  'maven-build-project-deploy-to-repositories-yml',
  'maven-build-project-goals',
  'maven-build-project-version-arguments',
  'maven-build-project-version-command',
  'maven-build-project-version-goals',
  'maven-build-skip-tests',
  'nodejs-build-project-custom-command-final',
  'nodejs-build-project-custom-command-pre-npm-ci',
  'nodejs-build-project-custom-command-pre-npm-run-build',
  'nodejs-build-project-custom-command-pre-npm-run-lint',
  'nodejs-version',
  'nodejs-e2e-enabled',
  'nodejs-e2e-backend-json',
  'nodejs-e2e-backend-routes',
  'nodejs-e2e-backend-url',
  'pr-deploy-skip',
  'pr-deploy-additional-helm-values',
  'pr-deploy-aks-cluster-name',
  'pr-deploy-aks-resource-group',
  'pr-deploy-app-config-branch',
  'pr-deploy-argo-applications-url',
  'pr-deploy-comment-additional-text',
  'pr-deploy-comment-prefix',
  'pr-deploy-k8s-application-name',
  'pr-deploy-k8s-namespace',
  'spring-boot-build-image-arguments',
  'spring-boot-build-image-command',
  'spring-boot-build-image-pull-images-pre-build-yml',
  'spring-boot-build-image-goals',
  'spring-boot-build-image-version-arguments',
  'spring-boot-build-image-version-command',
  'spring-boot-build-image-version-goals',
  'static-deploy-environments',
  'static-deploy-from-default-branch-only',
  'has-changes',
  'application-previous-version-tag',
])
