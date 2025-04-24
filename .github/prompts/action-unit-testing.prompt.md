# Copilot Prompt: Generating Unit Tests for TypeScript GitHub Action Steps (Deno Runtime)

Follow these instructions when generating unit tests for TypeScript/Deno GitHub
Action steps.

## Core Principles for Unit Testing

1. **Test Runner:** Use Deno's built-in test runner (`Deno.test`).
2. **Focus:** Each test file should ideally focus on testing a single action
   step script (e.g., `test_1_my_step.ts` tests `1_my_step.ts`). Integration
   tests covering multiple steps are acceptable but should be clearly named
   (e.g., `test_integration_flow.ts`).
3. **Mocking:** Thoroughly mock external dependencies and interactions:
   - `@actions/core`: Use the provided `mockCore` utilities.
   - Environment Variables: Use `Deno.env.set()` within tests.
   - Filesystem: Mock `Deno` functions like `stat`, `readTextFile`, etc., or
     helper functions that interact with the filesystem (e.g.,
     `FileUtils.getHashOfFile`). Use setup/teardown helpers (like
     `overrideStat`/`restoreStat` if available) for consistency.
   - Helper Functions: If a helper function from `common/utils/helpers.ts` has
     side effects or external dependencies, consider mocking it for isolated
     unit tests.
   - Command Execution: Mock `executeCommand` and `executeCommandWithOutput` if
     the test should not perform real command execution.
   - **Stubbing Caution:** Be aware that `stub` from `@std/testing/mock` might
     fail on non-configurable properties (e.g., some Deno APIs), causing
     `MockError: Cannot stub...`. Consider alternatives like manual
     assignment/restoration if `stub` causes issues.
   - **Mock Initialization Order:** Ensure mock objects/functions (e.g., for
     Octokit) are fully initialized _before_ defining their behavior (e.g.,
     using `.resolves()` or `.rejects()`).
   - **Mock `GITHUB_EVENT_PATH` Interaction:** If tests rely on GitHub event
     context (e.g., PR number), mock the `GITHUB_EVENT_PATH` environment
     variable and handle any file read operations on that path (mock filesystem
     or provide a temporary mock file).
4. **Isolation:** Ensure tests are isolated. Use setup (`resetMockCore`) and
   teardown (`restoreStat`) logic to prevent state leakage between tests.
5. **Clarity:** Write descriptive test names
   (`Deno.test('Test Scenario Description', ...)`).
6. **Verification:** Ensure generated tests compile and pass when run with
   `deno test` from the project root (e.g., `ci-cd/`).
7. **Strict Mode Compliance:** Do not access `arguments`, `caller`, or `callee`
   on functions within tests.

## Standard Imports

- Assertions (`assertEquals`, `assertStringIncludes`, `fail`, etc.): Import from
  `common/test_deps.ts`.
- Module Under Test: Import the specific `run` or `main` function from the
  action step script (e.g., `import { run } from './1_my_step.ts';`).
- Mocking Utilities: Import `mockCore`, `mockOutputs`, `resetMockCore` from
  `common/utils/mock-core.ts` (or similar location). Import `setCore` from
  `common/deps.ts`.
- Other Dependencies: Import types (`AppVars`), helpers (`FileUtils`), etc., as
  needed from `common/`.

## Mocking Strategy (`@actions/core`)

- **Initialization:** Call `setCore(mockCore)` at the top level of the test file
  to replace the real `@actions/core` implementation.
- **Setup:** Call `resetMockCore()` at the beginning of each `Deno.test` block
  to clear previous inputs/outputs.
- **Inputs:** Mock inputs by implementing
  `mockCore.getInput = (name: string) => { ... };` or setting specific mock
  properties if available (e.g., `mockCore.yamlPath`).
- **Outputs:** Assert on outputs by checking the `mockOutputs` object (e.g.,
  `JSON.parse(mockOutputs['output-name'])`) or using specific getter methods if
  available (e.g., `mockCore.getOutputAppVars()`).
- **Logging:** Mocking logs is usually not necessary unless specific log output
  needs verification.

## Standard Test Structure

```typescript
// 1. Imports
import { assertEquals, assertStringIncludes, fail } from "common/test_deps.ts";
import {
    mockCore,
    mockOutputs,
    resetMockCore,
} from "common/utils/mock-core.ts";
import { setCore } from "common/deps.ts";
import { run } from "./1_the_step_to_test.ts"; // Import the step's main function
import { AppVars } from "common/interfaces/application-variables.ts";
// Import other necessary helpers, types, or Deno functions

// 2. Replace core implementation
setCore(mockCore);

// Optional: Mock other global dependencies (e.g., Deno.stat)
const originalStat = Deno.stat;
function overrideStat(/* ... */) {/* ... */}
function restoreStat() {
    Deno.stat = originalStat;
}
// Optional: Mock specific helper functions if needed
// FileUtils.getHashOfFile = async (_: string) => 'mocked-hash';

// 3. Test Cases
Deno.test("Test scenario description (e.g., Happy path)", async () => {
    // --- Setup ---
    resetMockCore(); // Reset mocks for isolation
    // Set environment variables
    Deno.env.set("GITHUB_WORKSPACE", "/mock/workspace");
    Deno.env.set("SOME_ENV_VAR", "value");
    // Mock inputs
    mockCore.getInput = (name: string) => {
        if (name === "my-input") return "input-value";
        if (name === "app-vars-json") {
            return JSON.stringify({/* mock AppVars */});
        }
        return "";
    };
    // Mock filesystem/helpers if needed for this specific test
    // overrideStat(...);

    // --- Execute ---
    try {
        await run(); // Execute the action step's main function
    } catch (error) {
        fail(`Test failed unexpectedly: ${error}`);
    } finally {
        // --- Teardown (if needed) ---
        // restoreStat();
    }

    // --- Assert ---
    // Assert on outputs
    assertEquals(mockOutputs["output-one"], "expected-value");
    const appVarsOutput = JSON.parse(mockOutputs["app-vars-output"]);
    assertEquals(appVarsOutput.someProperty, "expected");
    // Assert on logs (less common)
    // assertStringIncludes(mockCore.loggedInfo.join('\n'), 'Expected log message');
});

Deno.test("Test scenario description (e.g., Error case)", async () => {
    // --- Setup ---
    resetMockCore();
    Deno.env.set("GITHUB_WORKSPACE", "/mock/workspace");
    // Mock inputs to cause an error
    mockCore.getInput = (name: string) => {
        if (name === "invalid-input") return "bad-value";
        return "";
    };
    // Mock filesystem/helpers

    // --- Execute & Assert Error ---
    try {
        await run();
        fail("Expected an error but none was thrown.");
    } catch (error) {
        // Assert on the type or message of the error
        assertStringIncludes(error.message, "Invalid input provided");
    } finally {
        // --- Teardown ---
    }
});

// Add more test cases for different scenarios and edge cases
```

## Assertions

- Use assertion functions from `common/test_deps.ts` (`assertEquals`,
  `assertStringIncludes`, `assertRejects`, etc.).
- For error testing, use a `try...catch` block and `fail()` if the expected
  error is not thrown, or use `assertRejects`.

## Test Data

- For complex inputs or expected outputs, consider loading them from `.json` or
  `.yml` files stored in a `testdata/` subdirectory relative to the test file.
- Use `Deno.readTextFileSync` to load test data.

Remember to keep tests focused and mock dependencies effectively to ensure
reliable and fast unit testing.
