# DSBs github CI/CD actions
Collection of DSB custom github actions for CI/CD.

## Index
```
ci-cd/
├───build-docker-image        --> Build, tag and push docker image
├───build-maven-project       --> Configure Java and build maven project
├───build-nodejs-project      --> Configure Node.js and build node project
├───build-spring-boot-image   --> Build spring boot OCI image with labels and tags
├───create-app-vars-matrix    --> Create build/deploy vars for one or more DSB apps
├───create-build-envs         --> Create common DSB CI/CD variables
├───delete-pr-images-from-acr --> Delete ephemeral PR image repository from ACR
├───deploy-to-ephemeral       --> Deploy DSB app to ephemeral environment
├───deploy-to-static          --> Deploy DSB app to static environment
├───prune-images-from-acr     --> Prune images from ACR
├───require-build-envs        --> Test DSB build environment variables for non-zero values
└───teardown-pr-environment   --> Tear down ephemeral PR environment in AKS
```

## Usage and doc

These actions are used by the CI/CD workflow(s) in [./workflows](../workflows). For example usage see their usage in those workflows.

For documentation refer to the `description` section of each specific actions as well as comments within their defintion.

## Maintenance

### Development

1. Replace version-tag of all dsb-actions in this repo with a temporary tag, ex. `@v1` becomes `@my-feature`.

    Replace regex pattern for vscode:
    - Find: `(^\s*)((- ){0,1}uses: dsb-norge/github-actions/.*@)v1`
    - Replace: `$1# TODO revert to @v1\n$1$2my-feature`

2. Make your changes and commit your changes on a branch, for example `my-feature-branch`.
3. Tag latest commit on you branch:
   ```bash
   git tag -f -a 'my-feature'
   git push -f --tags
   ```
4. To try out your changes, in the calling repo change the calling workflow to call using your **branch name**. Ex. with a dev branch named `my-feature-branch`:
   ```yaml
    jobs:
        ci-cd:
            # TODO revert to '@v1'
            uses: dsb-norge/github-actions/.github/workflows/ci-cd-default.yml@my-feature-branch
   ```
5. Test your changes from the calling repo. Make changes and remember to always move your tag `my-feature` to the latest commit.
6. When ready remove your temporary tag:
   ```bash
   git tag --delete 'my-feature'
   git push --delete origin 'my-feature'
   ```
    and revert from using the temporary tag to the version-tag for your release in actions, ie. `@my-feature` becomes `@v1` or `@v2` or wahtever.

    Replace regex pattern for vscode:
    - Find: `(^\s*# TODO revert to @v1\n)(^\s*)((- )?uses: dsb-norge/github-actions/.*@)my-feature`
    - Replace: `$2$3v1`
7. Create PR and merge to main.

### Release

After merge to main use tags to release.

#### Minor release

Ex. for smaller backwards compatible changes. Add a new minor version tag ex `v1.8` with a description of the changes and ammend the description to the major version tag.

Example with release `v1.8`:
```bash
git checkout origin/main
git pull origin main
git tag -a 'v1.11'
# you are promted for the tag annotation (change description)
git tag -f -a 'v1'
# you are promted for the tag annotation, ammend the change description
git push -f --tags
```

#### Major release

Same as minor release only the major version tag is a new one. Ie. we do not need to force tag/push.

Example with release `v2`:
```bash
git checkout origin/main
git pull origin main
git tag -a 'v2.0'
# you are promted for the tag annotation (change description)
git tag -a 'v2'
# you are promted for the tag annotation
git push --tags
```
