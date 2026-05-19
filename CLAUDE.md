# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Collection of DSB-Norge's reusable GitHub composite actions and workflows. Other dsb-norge repos consume them via `uses: dsb-norge/github-actions/<path>@v<N>` (e.g. `@v4`). There is no app to deploy from here — releases are git tags.

Top-level layout:

- `ci-cd/` — CI/CD composite actions (the main body of work). Has its own `deno.json` shared by all TS-based actions in that tree.
- `.github/workflows/` — Reusable workflows (`ci-cd-default.yml`, `ci-cd-build-deploy-maven-lib.yml`, `maven-artifacts-pruner.yml`) that orchestrate the `ci-cd/` actions.
- `get-github-app-installation-token/` — Standalone TS/Deno action with its own `deno.json` and `common/`.
- `get-repo-lists/`, `run-maven-command/` — Standalone Bash actions (older style; pair `helpers.sh` + `helpers_additional.sh` with `action.yml`).

The high-level CI/CD flow (create-matrix → matrix build-deploy → deploy-to-static / prune) is diagrammed in `ci-cd/README.md`.

## Two coexisting action styles

Newer actions are **TypeScript + Deno composite actions**. Older actions are **Bash composite actions**. Match the style of the action you're editing; don't port one to the other unless asked.

### TS/Deno composite action conventions

- **Composite only** — no JS-action `runs.main` entrypoints.
- **Step scripts** live in `<action>/action/` and are named `<number>_<id>.ts` (e.g. `1_convert.ts`, `2_validate-input.ts`). `action.yml` invokes them in order with `deno run --allow-... <script>`, passing inputs via `env: INPUT_...` and chaining outputs through `core.setOutput`.
- Each step starts with `deno install` (working-directory pointing at the deno-project root that owns the `deno.json`), so the import map resolves.
- **Allowed GH Actions SDK:** only `npm:@actions/core` and `npm:@actions/github`, both re-exported via `common/deps.ts`. Do **not** use `@actions/exec` or `@actions/io` — shell out via `Deno.Command` if you need to run a process, and request `--allow-run=<binary,...>` explicitly.
- **All third-party imports go through `common/deps.ts`** (`jsr:@std/...` and pinned `npm:`/`jsr:` versions). Tests import from `common/test_deps.ts`. Don't add bare `jsr:` / `npm:` imports in step scripts.
- **TypeScript strictness:** no `any`; prefer `interface` for shared shapes (see `common/interfaces/`); prefer `const`; avoid `enum` (use union types or `as const`).
- **Top-level errors** go through `handleError(error, context)` from `common/utils/error.ts` so failure surfaces via `core.setFailed`.
- Each step's `main`/`run` is gated by `if (Deno.env.get('GITHUB_ACTIONS') === 'true') main()` so tests can import the module without executing.

### Testing TS/Deno actions

- Runner: `Deno.test`. Test files are `test_*.ts` colocated with the step (e.g. `test_detect-type.ts` next to `3_detect-type.ts`).
- Run all tests from the deno-project root:
  - `cd ci-cd && deno task test` — runs every `./**/test_*.ts`. The task uses `--unstable-temporal --no-check --allow-all`.
  - `cd get-github-app-installation-token && deno task test` — for that standalone action.
- Single file / single test:
  - `cd ci-cd && deno test --unstable-temporal --no-check --allow-all create-app-vars-matrix/action/test_detect-type.ts`
  - Append `--filter "name fragment"` to run a single `Deno.test` case.
- Format / lint: `cd ci-cd && deno fmt` and `deno lint` (config is in `ci-cd/deno.json`; note `lineWidth: 450`, `singleQuote: true`, `semiColons: false`).
- **Mocking `@actions/core`:** `setCore(mockCore)` at module top, `resetMockCore()` in each test. `mockCore` lives at `common/utils/mock-core.ts` and captures outputs/logs into `mockOutputs`/`mockInfoLogs` etc. Override `mockCore.getInput` per test to feed inputs. The yaml-based fixtures use `mockCore.yamlPath` to read from `ci-cd/testdata/`.
- Detailed testing conventions (mock initialization order, `GITHUB_EVENT_PATH` handling, stub caveats) are in `.github/prompts/action-unit-testing.prompt.md`.

### Bash actions

`run-maven-command/` and `get-repo-lists/` source `helpers.sh` (logging, `set-output`, group markers) from inside the action; `helpers_additional.sh` is auto-sourced if present.

## Release model (important, easy to get wrong)

Consumers pin to a major tag like `@v4`. The `vN` tag is force-moved to each minor (`v4.0`, `v4.1`, …). To cut a release:

```bash
git tag -a 'v4.x'        # new annotated minor tag
git tag -f -a 'v4'       # force-amend the major tag annotation
git push -f origin 'refs/tags/v4.x' 'refs/tags/v4'
```

The full release / un-release / development-tag workflow is documented in `ci-cd/README.md` under **Maintenance**. **Don't tag or push tags unless the user explicitly asks** — it changes what every downstream repo picks up on its next CI run.

When developing changes that need to be tried from a real consumer repo, follow the temporary-tag dance in that same section (rewrite `@v4` → `@my-feature` across the repo, force-move the temp tag during iteration, then revert before merging to main).

## Workflow context this code runs in

The reusable workflows assume:

- Self-hosted runners labeled `self-hosted, dsb-builder, linux, x64`.
- A GitHub App (`dsb-norge-cicd-access`) is installed in the caller org; `get-github-app-installation-token` mints an installation token from `ORG_CICD_APP_ID` / `ORG_CICD_APP_INSTALLATION_ID` / `ORG_CICD_APP_PRIVATE_KEY`.
- Permissions required on the caller workflow are listed at the top of `.github/workflows/ci-cd-default.yml` and in `ci-cd/README.md`.
- Build provenance + CycloneDX SBOM attestations are produced for Docker images, Maven artifacts, and npm builds (see `ci-cd/README.md` → **Artifact attestation** for verification commands and the Sigstore endpoint list self-hosted runners need outbound 443 access to).

## Conventions worth knowing before editing

- `AppVars` (`ci-cd/common/interfaces/application-variables.ts`) is the central data shape — most steps read/write a JSON-serialized `AppVars[]` via the `APPVARS` output, threading it through the pipeline.
- App type is auto-detected from sources in `create-app-vars-matrix` (`pom.xml` → `spring-boot`, `package.json` → `vue`, `maven-library` must be explicit). Many defaults come from `create-build-envs` — when adding a new optional input to the pipeline, that's usually where it belongs.
- Maven debug flag (`-X`) is auto-added when `RUNNER_DEBUG=1`; suppress with `maven-debug: false` rather than special-casing in actions.
- Don't commit anything under `ci-cd/create-app-vars-matrix/_*` or `ci-cd/create-build-envs/_*` — they're test scratch dirs and are gitignored.