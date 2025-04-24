# Copilot Prompt: Generating/Rewriting TypeScript GitHub Action Steps (Deno Runtime)

Follow these instructions when generating/rewriting TypeScript/Deno GitHub
Action steps. **Note:** "Rewriting" typically refers to converting existing Bash
script steps (`shell: bash`) within a composite action to TypeScript/Deno; other
steps (e.g., `uses: actions/...`) should generally remain unchanged unless
specifically requested.

## Core Principles for GitHub Actions

1. **GH Actions Integration:** Use ONLY `npm:@actions/core` or
   `npm:@actions/github` for environment interaction (inputs, outputs, logs,
   secrets, path, status). NO `@actions/exec` or `@actions/io`.
2. **Common Modules:**
   - Import external deps ONLY via re-export from `common/deps.ts`.
   - Utilize helpers from `common/utils/helpers.ts` (see below).
   - Use `handleError` from `common/utils/error.ts` for top-level error
     handling.
   - Import shared interfaces (e.g., `AppVars`) from `common/interfaces/`.
3. **File Structure:**
   - Name step scripts `<number>-<id>.ts` (e.g., `2_init.ts`).
   - Define helpers within the step file ONLY if step-specific.

## Available Helper Functions (`common/utils/helpers.ts`)

Summary of commonly used helpers:

- **Parsing:**
  - `tryParseJson<T>(jsonString)`: Safely parses JSON string to `T` or `null`.
  - `tryParseYaml<T>(yamlString)`: Safely parses YAML string to `T` or `null`.
  - `stringifyYaml(obj)`: Converts object to YAML string (`lineWidth: -1`).
    Returns `''` on error.
- **Logging:**
  - `logMultiline(title, value, debugCheck?)`: Logs `value` in a collapsible
    group `title` (`core.info` or `core.debug`).
- **Paths:**
  - `getWorkspacePath()`: Gets `GITHUB_WORKSPACE` path.
  - `getAbsolutePath(relativePath)`: Resolves path relative to workspace.
  - `getRelativePath(absolutePath)`: Makes path relative to workspace.
- **File Operations:**
  - `calculateFileMd5(filePath)`: Returns MD5 hex hash of file, `''` if not
    found, throws on other errors.
  - `readContextFromFile<T>(envVarName)`: Reads/parses JSON file path from
    `envVarName` to `T` or `null`.
- **Inputs & Environment:**
  - `getActionInput(name, required?)`: Gets action input by name (maps to
    `INPUT_` env var).
  - `parseExtraEnvs(jsonString, name)`: Parses JSON string into
    `Record<string, string>` for env vars.
- **Command Execution:**
  - `executeCommand(cmd, groupTitle, env?, cwd?)`: Executes _allowed_ command
    (`mvn`, `npm`, etc.), streams output. Throws on failure. Forces color.
  - `executeCommandWithOutput(cmd, groupTitle, env?, cwd?)`: Executes _allowed_
    command, captures output. Returns `{ code, stdout, stderr }`. Throws on
    failure. Disables color.
- **Maven Specific:**
  - `findPomXml(workspacePath, appSourcePath?)`: Locates `pom.xml` based on
    `appSourcePath`. Throws if not found.
  - `determineMavenCommand(...)`: Constructs `mvn` command string based on
    inputs/`appVars`/defaults, handling precedence and flags
    (`-Dstyle.color=always`, `-DskipTests`).

## Input / Environment Variable Handling (Script vs. YAML)

- **Action Inputs:**
  - Script: `getActionInput('my-input')`
  - YAML Env: `INPUT_MY_INPUT: ${{ inputs.my-input }}`
- **General Env Vars:**
  - Script: `Deno.env.get('MY_VAR')`
  - YAML Env: `MY_VAR: value`
- **Outputs:**
  - Script: `core.setOutput('output-name', value)`
  - YAML Output: `value: ${{ steps.<step-id>.outputs.output-name }}`

## Standard `action.yml` Structure (Composite Action)

**Note:** Do NOT include numbered comments (e.g., `# 1. Some comment`) in generated code. And do not rename step-ids

```yaml
# filepath: path/to/your/action.yml
name: "Your Action Name"
description: "Action description."
author: "Direktoratet for samfunnssikkerhet og beredskap" # Standard author
inputs:
    some-input:
        description: "Input description."
        required: true
    dsb-build-envs: # Common input
        description: "DSB build environment variables JSON."
        required: true
outputs:
    some-output:
        description: "Output description."
        value: ${{ steps.run-script.outputs.output-name }}

runs:
    using: "composite"
    steps:
        # 1. Install Deno dependencies
        - name: 🦕 Deno install
          shell: bash
          run: deno install
          working-directory: ${{ github.action_path }}/../ # Adjust if needed

        # 2. Execute Deno script(s)
        - id: run-script # Descriptive ID
          # IMPORTANT: Keep shell: bash and use 'deno run' below
          shell: bash
          env:
              # Pass inputs (INPUT_ prefix)
              INPUT_SOME_INPUT: ${{ inputs.some-input }}
              INPUT_DSB_BUILD_ENVS: ${{ inputs.dsb-build-envs }}
              # Pass other env vars
              GITHUB_WORKSPACE: ${{ github.workspace }}
              GH_TOKEN: ${{ github.token }} # Example
          run: |
              # Run script with permissions
              deno run \
                --allow-read --allow-write --allow-env --allow-net \
                --allow-run=gh,docker,npm,mvn # Add required permissions
                ${{ github.action_path }}/action/1_your_script_name.ts # Path to script

        # Add more steps if needed
```

## Standard TypeScript File Structure Guideline

**Note:** Do NOT include numbered comments (e.g., `// 1. Imports`) in generated
code.

```typescript
import { core } from "common/deps.ts";
import {
    executeCommand,
    getActionInput,
    tryParseJson,
} from "common/utils/helpers.ts";
import { handleError } from "common/utils/error.ts";
import { AppVars } from "common/interfaces/application-variables.ts";

// Interfaces/Types (Export if reusable)
export interface StepData {/* ... */}

// Constants

// Helper Functions (Step-specific only)

// Main Action Function
export async function run(): Promise<void> {
    core.info("Starting: [Step Name/ID]");
    // let cleanupNeeded = false; // Optional: For finally block

    try {
        // --- Get Inputs & Env Vars ---
        const dsbBuildEnvsInput = getActionInput("dsb-build-envs", true);
        const appVars = tryParseJson<AppVars>(dsbBuildEnvsInput);
        if (!appVars) throw new Error("Input 'dsb-build-envs' parse failed.");
        const workspacePath = Deno.env.get("GITHUB_WORKSPACE") || ".";

        // --- Main Logic ---
        core.startGroup("Main logic");
        // ... Use helpers, std libs, executeCommand ...
        // Example: await executeCommand('echo "Hello"', 'Running echo');
        core.endGroup();

        // cleanupNeeded = true; // If cleanup is required

        // --- Set Outputs ---
        // Example: core.setOutput('result', 'value');

        core.info("Step completed.");
    } catch (error) {
        handleError(error, "Error in [Step Name/ID]");
    } finally {
        // --- Cleanup --- (Optional)
        // if (cleanupNeeded) {
        //     core.startGroup("Cleanup");
        //     try { /* ... Cleanup logic ... */ }
        //     catch (cleanupError) { core.warning(`Cleanup failed: ${cleanupError}`); }
        //     core.endGroup();
        // }
    }
}

// Standard execution guard
if (Deno.env.get("GITHUB_ACTIONS") === "true") {
    run();
}
```
