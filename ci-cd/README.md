# DSBs github CI/CD actions
Collection of DSB custom github actions for CI/CD.

## Index
```
/
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
