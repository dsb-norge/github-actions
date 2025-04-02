# Copilot Instructions: Generating TypeScript GitHub Action Steps (Deno Runtime)

## Core Principles

1.  **Language & Runtime:** Generate **TypeScript** code intended to be run using the **Deno** runtime.
2.  **GitHub Actions Integration:** Use the `npm:@actions/core` or `npm:@actions/github` library EXCLUSIVELY for interacting with the GitHub Actions environment (inputs, outputs, logging, secrets, path variables, setting failure status). Do NOT use `@actions/exec` or `@actions/io`.
3.  **Deno Standard Libraries:** STRONGLY PREFER using Deno standard libraries from `jsr:@std/...` for common tasks like:
    *   File System: `jsr:@std/fs` (e.g., `exists`, `readTextFile`, `appendTextFile`)
    *   Path Manipulation: `jsr:@std/path` (e.g., `resolve`, `relative`, `join`, `basename`)
    *   YAML Parsing: `jsr:@std/yaml` (`parse`)
    *   Avoid Node.js built-in modules (`fs`, `path`) unless absolutely necessary and unavailable in `@std`.
4.  **Common Modules (Assume Existence & Use):**
    *   **`common/deps.ts`**: Assume this file exists and re-exports common dependencies like `@actions/core`, relevant `@std` modules (`fs`, `path`, `yaml`), etc. Import dependencies *from this file* whenever possible.
    *   **`common/utils/helpers.ts`**: Assume this file exists and contains reusable helper functions. **Use these helpers when appropriate.** Examples include:
        *   `getActionInput(name: string, required?: boolean): string`: Wrapper around `core.getInput`.
        *   `tryParseJson<T>(jsonString: string): T | null`: Safely parses JSON, returning null on error.
        *   `tryParseYaml<T>(yamlString: string | undefined | null): T | null`: Safely parses YAML, returning null on error
        * `function executeCommand(commandString: string, groupTitle: string, env?: Record<string, string>, cwd?: string, ): Promise<number>`: For running commands with Deno.Command in the correct way. Throwing exception on failure, and returns the result code
    *   **`common/utils/error.ts`**: Assume this file exists and contains a common error handling function:
        *   `handleError(error: unknown, context: string): void`: Logs the error appropriately using `core.error`/`core.debug` and calls `core.setFailed`.
    *   **`common/interfaces/`**: Assume this directory contains shared TypeScript interfaces (like `AppVars`). Import interfaces from here.
5.  **Structure & Modularity:**
    *   Each distinct action *step* should reside in its own file, typically named `<number (indicating which order the TS file is called in)>-<id-of-action-in-yml>.ts`.
    *   Define step-specific helper functions *within* the file if they are not reusable across steps.
6.  **Type Safety:** Use **explicit TypeScript types** for variables, function parameters, and return values. Define interfaces for complex objects.
7.  **Simplicity:** Keep the code straightforward and easy to understand. Avoid overly complex abstractions for simple tasks.

## Input / Environment Variable Handling (YAML vs. Script)

*   **For Action Inputs (`core.getInput` / `getActionInput`):**
    *   In the TypeScript script, use the wrapper `getActionInput('my-input-name')`.
    *   In the GitHub Actions YAML file (`action.yml` or workflow step), this corresponds to an environment variable set under the `env:` key, prefixed with `INPUT_`, uppercased, and with hyphens converted to underscores:
        ```yaml
        env:
          INPUT_MY_INPUT_NAME: ${{ inputs.someValue || 'default' }}
        ```
*   **For General Environment Variables (`Deno.env.get`):**
    *   In the TypeScript script, use `Deno.env.get('MY_ENV_VARIABLE')`.
    *   In the GitHub Actions YAML file, this corresponds to an environment variable set directly under the `env:` key with the **exact same name**:
        ```yaml
        env:
          MY_ENV_VARIABLE: ${{ github.workspace }} # Or any other value/context
        ```

## Standard File Structure

```typescript
// 1. Imports (PRIORITIZE from common/deps, common/utils, common/interfaces)
import { core, copy, /* other deps */ } from 'common/deps.ts';
import { getActionInput, tryParseJson } from 'common/utils/helpers.ts';
import { handleError } from 'common/utils/error.ts';
import { AppVars } from 'common/interfaces/application-variables.ts';
// Import specific jsr:@std modules ONLY if not in deps.ts
import { exists } from 'jsr:@std/fs@1.0.15/exists';

// 2. Interfaces/Types (Specific to this step, if any)
interface StepSpecificData {
    // ...
}

// 3. Constants (Defaults, keys, etc.)
const SOME_DEFAULT: string = 'default_value';

// 4. Helper Functions (Specific to this step)
//    (Define helpers here ONLY if they are NOT reusable and belong in common/utils)
async function stepSpecificHelper(/* params */): Promise<void> {
    // ...
}

// 5. Main Action Function
export async function run(): Promise<void> {
    core.info('Starting action step...');
    // Use variables for state needed in finally block (e.g., keys to unset)
    let cleanupNeeded = false;

    try {
        // --- Get Inputs & Environment Variables ---
        // Use getActionInput wrapper (preferred) or core.getInput directly
        const someInput: string = getActionInput('some-input', true); // Corresponds to env: INPUT_SOME_INPUT
        const workspacePath: string = Deno.env.get('GITHUB_WORKSPACE') || '.'; // Corresponds to env: GITHUB_WORKSPACE
        const customEnv: string | undefined = Deno.env.get('MY_CUSTOM_ENV'); // Corresponds to env: MY_CUSTOM_ENV

        // Very common action input used in most actions
        const dsbBuildEnvsInput: string = getActionInput('dsb-build-envs', true)
        const appVars: AppVars | null = tryParseJson<AppVars>(dsbBuildEnvsInput)
        if (!appVars) {
          throw new Error('Failed to parse dsb-build-envs JSON.')
        }

        // --- Main Logic ---
        // (Parsing, file operations, command execution, etc.)
        // USE HELPERS FROM common/utils WHEREVER POSSIBLE (e.g., tryParseJson)
        // ...
        // Example: await executeCommand(['arg1', 'arg2'], 'Doing something');
        // ...
        cleanupNeeded = true; // Mark if cleanup is needed

        // --- Set Outputs ---
        core.setOutput('output-name', 'output-value');

        core.info('Action step completed successfully.');

    } catch (error) {
        // --- Error Handling ---
        // Use the common handler from common/utils/error.ts
        handleError(error, 'context description for error');
        // handleError should call core.setFailed()

    } finally {
        // --- Cleanup ---
        // Always attempt cleanup if necessary
        if (cleanupNeeded) {
            core.info('Performing cleanup...');
            try {
                // Example: await executeCommand(['rmi', 'temp-image'], 'Cleaning up image');
            } catch (cleanupError) {
                // Log cleanup errors as warnings, don't mask original error
                core.warning(`Cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
            }
        }
    }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
    run();
}
```