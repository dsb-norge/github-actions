# DSBs github CI/CD actions
Collection of DSB custom github actions for CI/CD.

## File index
```
ci-cd/
├───build-docker-image              --> Build, tag and push docker image
├───build-maven-project             --> Configure Java and build maven project
├───build-nodejs-project            --> Configure Node.js and build node project
├───build-spring-boot-image         --> Build spring boot OCI image with labels and tags
├───collect-build-envs              --> Collect build output from previous steps stored as workflow artifacts
├───comment-on-pr                   --> Add/update PR comment
├───configure-maven-settings        --> Create maven user settings (settings.xml)
├───create-app-vars-matrix          --> Create build/deploy vars for one or more DSB apps
├───create-build-envs               --> Create common DSB CI/CD variables
├───delete-pr-images-from-acr       --> Delete ephemeral PR image repository from ACR
├───deploy-to-ephemeral             --> Deploy DSB app to ephemeral environment
├───deploy-to-static                --> Deploy DSB app to static environment
├───prune-images-from-acr           --> Prune images from ACR
├───prune-maven-artifacts-in-repo   --> Prune maven artifacts from GitHub packages
├───require-build-envs              --> Test DSB build environment variables for non-zero values
└───teardown-pr-environment         --> Tear down ephemeral PR environment in AKS
```

## Usage and doc

These actions are used by the CI/CD workflow(s) in [./workflows](../workflows). For example usage see their usage in those workflows.

For documentation refer to the `description` section of each specific actions as well as comments within their definition.

## Maintenance

### Development

1. Replace version-tag of all dsb-actions in this repo with a temporary tag, ex. `@v2` becomes `@my-feature`.

    Replace regex pattern for vscode:
    - Find: `(^\s*)((- ){0,1}uses: dsb-norge/github-actions/.*@)v2`
    - Replace: `$1# TODO revert to @v2\n$1$2my-feature`

2. Make your changes and commit your changes on a branch, for example `my-feature-branch`.
3. Tag latest commit on you branch:
   ```bash
   git tag -f -a 'my-feature'
   git push -f origin 'refs/tags/my-feature'
   ```
4. To try out your changes, in the calling repo change the calling workflow to call using your **branch name**. Ex. with a dev branch named `my-feature-branch`:
   ```yaml
    jobs:
        ci-cd:
            # TODO revert to '@v2'
            uses: dsb-norge/github-actions/.github/workflows/ci-cd-default.yml@my-feature-branch
   ```
5. Test your changes from the calling repo. Make changes and remember to always move your tag `my-feature` to the latest commit.
6. When ready remove your temporary tag:
   ```bash
   git tag --delete 'my-feature'
   git push --delete origin 'my-feature'
   ```
    and revert from using the temporary tag to the version-tag for your release in actions, i.e. `@my-feature` becomes `@v2` or `@v3` or whatever.

    Replace regex pattern for vscode:
    - Find: `(^\s*# TODO revert to @v2\n)(^\s*)((- )?uses: dsb-norge/github-actions/.*@)my-feature`
    - Replace: `$2$3v2`
7. Create PR and merge to main.

### Release

After merge to main use tags to release.

#### Minor release

Ex. for smaller backwards compatible changes. Add a new minor version tag ex `v2.1` with a description of the changes and amend the description to the major version tag.

Example for release `v2.17`:
```bash
git checkout origin/main
git pull origin main
# review latest release tag to determine which is the next one
git tag --sort=-creatordate | head -n 5
git tag -a 'v2.17'
# you are prompted for the tag annotation (change description)
git tag -f -a 'v2'
# you are prompted for the tag annotation, amend the change description
git push -f origin 'refs/tags/v2.17'
git push -f origin 'refs/tags/v2'
```

**Note:** If you are having problems pulling main after a release, try to force fetch the tags: `git fetch --tags -f`.

#### Major release

Same as minor release except that the major version tag is a new one. I.e. we do not need to force tag/push.

Example for release `v3`:
```bash
git checkout origin/main
git pull origin main
# review latest release tag to determine which is the next one
git tag --sort=-creatordate | head -n 5
git tag -a 'v3.0'
# you are prompted for the tag annotation (change description)
git tag -a 'v3'
# you are prompted for the tag annotation
git push -f origin 'refs/tags/v3.0'
git push -f origin 'refs/tags/v3'
```

**Note:** If you are having problems pulling main after a release, try to force fetch the tags: `git fetch --tags -f`.


#### Un-release (move major tag back)

In case of trouble where a fix takes long time to develop, this is how to rollback the major tag to the previous minor release.

Example un-release `v2.9` and revert to `v2.8`:
```bash
git checkout origin/main
git pull origin main

moveTag='v2'
moveToTag='v2.8'
moveToHash=$(git rev-parse --verify ${moveToTag})

git push origin "refs/tags/${moveTag}"      # delete the old tag remotely
git tag -fa ${moveTag} ${moveToHash}        # move tag locally
git push -f origin "refs/tags/${moveTag}"   # push the updated tag remotely

```

**Note:** If you are having problems pulling main after a release, try to force fetch the tags: `git fetch --tags -f`.
