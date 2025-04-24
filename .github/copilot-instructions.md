## Core Principles

- **Agent/Edit Mode:** Avoid posting large code sections in chat; implement
  changes directly in files.
- **Interaction:** Keep responses concise. Use the specified format (steps, file
  grouping, minimal diffs). Assume I can merge.
- **Conciseness:** Use comments (`// ...existing code...`) to represent
  unchanged regions.

## Code Generation (TypeScript/Deno)

- **Language/Runtime:** Generate **TypeScript** for the **Deno** runtime.
- **Type Safety:** Prioritize explicit types. **Strictly avoid `any`**. Use
  exported `interface`s for reusable shapes.
- **Immutability:** Prefer `const` over `let`.
- **Enums:** **Avoid `enum`s**; use union types or `as const` objects.
- **Simplicity & Modularity:** Write simple, readable, modular code.
- **Formatting/Linting:** Adhere to Deno standards (assume `deno fmt/lint` from
  `ci-cd/`).
- **Dependencies:** Use `jsr:@std/...` or re-exports from `common/deps.ts`.
- **Error Handling:** Use `handleError` from `common/utils/error.ts` for
  top-level errors.
- **Common Modules:** Utilize helpers/types from `common/` (`utils/helpers.ts`,
  `utils/error.ts`, `interfaces/`, `deps.ts`).

## GitHub Actions Specifics (TypeScript/Deno Steps)

- **Action Type:** Assume `composite` actions.
- **GH Actions SDK:** Use ONLY `npm:@actions/core` or `npm:@actions/github` (via
  `common/deps.ts`). **NO `@actions/exec` or `@actions/io`**.
- **Step Structure:**
  - Use standard `deno install` step.
  - Use `shell: bash` and `deno run` for executing scripts.
  - Pass inputs via `env: INPUT_...`.
  - Specify necessary permissions (`--allow-read`, `--allow-write`,
    `--allow-env`, `--allow-net`, `--allow-run=gh,docker,npm,mvn,helm,...`).
- **File Naming:** Name action step scripts `<number>-<id>.ts` (e.g.,
  `1_init.ts`).
- **Input/Output:** Use `core.getInput`, `core.setOutput`.
- **Environment:** Use `Deno.env.get` for environment variables.

## Testing (Deno)

- **Runner:** Use `Deno.test`.
- **Focus:** Test individual step scripts (`test_my_step.ts` for
  `1_my_step.ts`).
- **Mocking:**
  - Mock `@actions/core` using `common/utils/mock-core.ts`.
  - Mock environment variables (`Deno.env.set`).
  - Mock filesystem (`Deno` functions) or helpers (`FileUtils`,
    `executeCommand`).
  - Use setup/teardown (`resetMockCore`) for isolation.
- **Imports:** Use standard imports (`common/test_deps.ts`,
  `common/utils/mock-core.ts`, module under test, `common/`).
- **Verification:** Ensure tests pass via `deno task test` from `ci-cd/`.
