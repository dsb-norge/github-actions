# DSBs github workflows
Collection of DSB custom github reusable workflows.

## Index
```
.github/workflows/
└───ci-cd-default.yml             --> Default CI/CD workflow, see doc below.
└───update-deps-and-create-pr.yml --> Automatic update of third party dependencies, see doc below.
```

## Workflow: ci-cd-default.yml

Default DSB CI/CD workflow that performs various operations depending on from what github event it was called:
- Event `pull_request` for all actions except `closed`:
  - Build one or more spring-boot or Vue projects (depends on given configuration).
  - Pushes built images to ephemeral image repo in ACR.
  - Creates ephemeral PR environment in AKS.
  - Deploys apps to ephemeral PR environment in AKS.
  - Prunes older images from ephemeral image repo in ACR.
- Event `pull_request` with action `close`:
  - Removes ephemeral PR environment in AKS.
  - Removes ephemeral image repo in ACR.
- Events `push` and `workflow_dispatch`:
  - Build one or more spring-boot or Vue projects (depends on given configuration).
  - Pushes built images to static image repo in ACR.
  - Deploys apps to static environments in AKS.
  - Prunes older images from static image repo in ACR.

### **Inputs**

#### **`apps`**

Specification of applications to build and/or deploy.
YAML list (as string) with specifications of applications to build and/or deploy.

**Required fields are:**
- **`application-name`** - string

**Semi-optional fields are:**
- **`application-type`** - string
  - This is optional if either a `pom.xml` or `package.json` exists within the given `application-source-path`
  - If both files are found within `application-source-path`, `pom.xml` takes precedence and `application-type` is set to `spring-boot`.
- **`application-description`** - string
  - For spring-boot projects this is optional if the `pom.xml` contains a description:
    ```
    <project>
      <description>My backend description</description>
    </project>
    ```
  - For Vue projects this is optional if the `package.json` contains a description:
    ```
    {
      ...
      "description": "My frontend description",
      ...
    }
    ```

**Other optional fields**

There are many other possible inputs available. These are not required as they have default values that work out of the box.

For other optional fields and their defaults see `inputs` of the [create-build-envs](../ci-cd/create-build-envs/action.yml) action.

#### **`Build and deploy secrets`**

The following secrets are required input parameters, see `inputs` definition in [ci-cd/create-build-envs/action.yml](../ci-cd/create-build-envs/action.yml) for documentation of these:
- `maven-repo-username`
- `maven-repo-token`
- `sonarqube-token`
- `jasypt-password`
- `acr-username`
- `acr-password`
- `github-repo-token`
- `app-config-repo-token`
- `pr-deploy-aks-creds`
- `acr-service-principal`


### **Example usage**

Basic example of how to add CI/CD to a github repo containing one spring-boot backend (under `./backend`) and one Vue frontend (under `./frontend`).

The following would be saved as `.github/workflows/ci-cd.yml` in the application repo.

```yaml
name: 'CI/CD'

on:
  # Run on main branch for PR default events + closed event
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
    types: [opened, synchronize, reopened, closed]
  # Allow manual build
  workflow_dispatch:

# Only one workflow at a time for a given branch or tag
concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
  ci-cd:
    # TODO revert to @v1
    uses: dsb-norge/github-actions/workflows/ci-cd-default.yml@tuin-144
    secrets:
      # All required secrets are passed to the workflow here
      maven-repo-username: ${{ secrets.JENKINS_REPO_USERNAME }}
      maven-repo-token: ${{ secrets.JENKINS_REPO_TOKEN }}
      sonarqube-token: ${{ secrets.SONAR_TOKEN }}
      jasypt-password: ${{ secrets.JASYPT_LOCAL_ENCRYPTOR_PASSWORD }}
      acr-username: ${{ secrets.AZ_CR_USER }}
      acr-password: ${{ secrets.AZ_CR_SECRET }}
      github-repo-token: ${{ secrets.GITHUB_TOKEN }}
      app-config-repo-token: ${{ secrets.GITOPS_TAG_BUMPER_TOKEN }}
      pr-deploy-aks-creds: ${{ secrets.KUBERNETES_ADMIN }}
      acr-service-principal: ${{ secrets.AZ_CR_SP }}
    with:
      # Github requires inputs of type string, ultimately this will be parsed as yaml list
      apps: |
        - application-name: my-backend-app
          application-source-path: ./backend
        - application-name: my-frontend
          application-source-path: ./frontend
          pr-deploy-comment-additional-text: Frontend available at https://pr-${{ github.event.number }}-my-frontend.dev.dsbnorge.no
          pr-deploy-additional-helm-values:
            parameters:
              dsb-nginx-frontend.config.LOC_API_PROXY_PASS_HOST: "http://my-backend-app-pr-${{github.event.number}}.my-backend-app-pr-${{github.event.number}}.svc.cluster.local:8080"
              dsb-nginx-frontend.ingress_host: "pr-${{ github.event.number }}-my-frontend.dev.dsbnorge.no"
```

### **Overriding defaults**

Note that most of the default `inputs` of the [create-build-envs](../ci-cd/create-build-envs/action.yml) action can be overridden when specifying the `apps` input to the workflow.

Ex. if you want to build the above spring-boot backend with a specific Java version, the specification would be:
```yaml
jobs:
  ci-cd:
...
    with:
      apps: |
        - application-name: my-backend-app
          application-source-path: ./backend
          java-version: '16'
```
## Workflow: update-deps-and-create-pr.yml
A workflow for automatic update of third party dependencies for a backend maven project.

### **Inputs**

#### **`apps`**

Specification of applications to build and/or deploy.
YAML list (as string) with specifications of applications to build and/or deploy.

**Required fields are:**
- **`application-name`** - string

#### **`Build and deploy secrets`**

The following secrets are required input parameters, see `inputs` definition in [ci-cd/create-build-envs/action.yml](../ci-cd/create-build-envs/action.yml) for documentation of these:
- `maven-repo-username`
- `maven-repo-token`

### **Example usage**

Basic example of how to add automatic dependency update to a github repo containing a spring-boot backend (under `./backend`).

The following would be saved as `.github/workflows/autobump-deps.yml` in the application repo.

```yaml
name: 'Autobump deps'

on:
  # Allow manual build
  workflow_dispatch:
  # Trigger at set times, e.g. '5 6 * * *' triggers every day at 06:05
  schedule:
    - cron: '5 6 * * *'

# a single branch/tag should only run one workflow at a time
concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
  autobump:
    name: Bump versions
    # TODO revert to @v1
    uses: dsb-norge/github-actions/workflows/update-deps-and-create-pr.yml@tuin-144
    secrets:
      maven-repo-username: ${{ secrets.JENKINS_REPO_USERNAME }}
      maven-repo-token: ${{ secrets.JENKINS_REPO_TOKEN }}
    with:
      # Note: 'application-name' becomes part of the branch name for the bumping. If you have more than one
      # maven app within the same github repos, each app must be listed here with a unique 'application-name'.
      apps: |
        - application-name: my-backend-app
          application-source-path: ./backend
```
