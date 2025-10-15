import { basename, core, crypto, delay, encodeHex, exists, join, parseYaml, relative, resolve, stringifyYaml as yamlString } from 'common/deps.ts'
import { AppVars } from 'common/interfaces/application-variables.ts'

/**
 * Safely parse JSON, returning null on error.
 * @param jsonString The JSON string to parse.
 * @returns The parsed object or null if parsing fails.
 */
export function tryParseJson<T>(
  jsonString: string | undefined | null,
): T | null {
  if (!jsonString) return null
  try {
    return JSON.parse(jsonString) as T
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.warning(`Failed to parse JSON: ${message}`)
    core.debug(`Invalid JSON string: ${jsonString}`)
    return null
  }
}

/**
 * Safely parse YAML, returning null on error.
 * @param yamlString The YAML string to parse.
 * @returns The parsed object or null if parsing fails.
 */
export function tryParseYaml<T>(
  yamlString: string | undefined | null,
): T | null {
  if (!yamlString) return null
  try {
    return parseYaml(yamlString) as unknown as T // YAML parse returns unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.warning(`Failed to parse YAML: ${message}`)
    core.debug(`Invalid YAML string: ${yamlString}`)
    return null
  }
}

/**
 * Pretty print an object as YAML string.
 * @param obj The object to stringify.
 * @returns YAML string representation.
 */
export function stringifyYaml(obj: unknown): string {
  try {
    // Consider adding options for indentation if needed: yaml.stringify(obj, { indent: 2 })
    return yamlString(obj, { lineWidth: -1, schema: 'core' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.warning(`Failed to stringify object to YAML: ${message}`)
    return ''
  }
}

/** Log a potentially multiline value within a group */
export function logMultiline(
  title: string,
  value: string | undefined | null,
  debugCheck: boolean = false,
): void {
  if (!debugCheck || core.isDebug()) {
    core.startGroup(title)
    if (!debugCheck) {
      core.info(value ?? '<undefined>')
    } else {
      core.debug(value ?? '<undefined>')
    }
    core.endGroup()
  }
}

/** Get GitHub workspace path */
export function getWorkspacePath(): string {
  // GITHUB_WORKSPACE is the reliable way to get the workspace path in Actions
  return Deno.env.get('GITHUB_WORKSPACE') ?? Deno.cwd()
}

/** Get absolute path relative to workspace */
export function getAbsolutePath(relativePath: string): string {
  return resolve(getWorkspacePath(), relativePath)
}

/** Get relative path from workspace */
export function getRelativePath(absolutePath: string): string {
  return relative(getWorkspacePath(), absolutePath)
}

export const FileUtils = {
  getHashOfFile: async (filePath: string): Promise<string | null> => {
    const fileContent = await Deno.readFile(filePath)
    const hash = await crypto.subtle.digest('MD5', fileContent)
    return encodeHex(hash)
  },
}

/** Calculate MD5 hash of file contents */
export async function calculateFileMd5(
  filePath: string,
): Promise<string | null> {
  try {
    return await FileUtils.getHashOfFile(filePath)
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      core.warning(`File not found for hashing: ${filePath}`)
      return ''
    } else if (e instanceof Error) {
      core.error(`Error reading file for hashing ${filePath}: ${e.message}`)
    }
    throw e
  }
}

/**
 * Gets an input value using core.getInput.
 * IMPORTANT: This relies on the action runner setting environment variables
 * like `INPUT_MY_INPUT_NAME` for the input `my-input-name`.
 * Ensure your action.yml maps inputs to env vars correctly.
 * @param name Input name (e.g., 'application-name')
 * @param options Input options (e.g., { required: true })
 * @returns The input value string.
 */
export function getActionInput(
  name: string,
  required: boolean = false,
): string {
  // core.getInput handles the mapping from 'input-name' to INPUT_INPUT_NAME env var
  const inputName = name.replace(/-/g, '_').toUpperCase()
  return core.getInput(inputName, { required, trimWhitespace: true })
}

/**
 * A utility to allow for easier unit testing of the context file reader.
 * It provides methods to get the context file path from an environment variable
 * and to read the file contents.
 */
export const ContextFileReader = {
  getContextFilePath: (envVarName: string): string | null => {
    const filePath = Deno.env.get(envVarName)
    if (!filePath) {
      core.warning(`Environment variable ${envVarName} not set. Cannot read context file.`)
      return null
    }
    return filePath
  },
  readFile: async <T>(filePath: string): Promise<T | null> => {
    try {
      const jsonString = await Deno.readTextFile(filePath)
      return tryParseJson<T>(jsonString)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      core.error(`Failed to read context file ${filePath}: ${message}`)
      return null
    }
  },
}

/**
 * Reads a JSON context from a file path specified by an environment variable.
 * @param envVarName The name of the environment variable holding the file path.
 * @returns The parsed context object or null if an error occurs.
 */
export async function readContextFromFile<T>(
  envVarName: string,
): Promise<T | null> {
  const filePath = ContextFileReader.getContextFilePath(envVarName)
  if (!filePath) {
    return null
  }
  core.info(`Reading context from file specified by ${envVarName}: ${filePath}`)
  try {
    const context = await ContextFileReader.readFile<T>(filePath)
    if (!context) {
      core.error(`Failed to parse JSON context from file: ${filePath}`)
      return null
    }
    core.debug(`Successfully read and parsed context from ${filePath}`)
    return context
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // Log specific error if file not found
    if (error instanceof Deno.errors.NotFound) {
      core.error(`Context file not found at path specified by ${envVarName}: ${filePath}`)
    } else {
      core.error(`Failed to read context file ${filePath}: ${message}`)
    }
    return null
  }
}

/**
 * Parses and returns environment variables from a JSON string.
 * @param jsonString The JSON string containing environment variables.
 * @param name Descriptive name for logging.
 * @returns A record of environment variables.
 * @throws Will throw an error if the JSON string cannot be parsed.
 *         Will log a warning if the JSON string is empty or invalid.
 */
export function parseExtraEnvs(
  jsonString: string | undefined,
  name: string,
): Record<string, string> {
  const exportedEnv: Record<string, string> = {}
  if (!jsonString) {
    core.debug(`No environment variables provided for '${name}'.`)
    return exportedEnv
  }

  const envs = tryParseJson<Record<string, unknown>>(jsonString)

  if (!envs || typeof envs !== 'object' || Object.keys(envs).length === 0) {
    core.warning(`Could not parse or found no variables in JSON for '${name}'. Skipping export.`)
    return exportedEnv
  }

  for (const key in envs) {
    // Ensure own properties and convert value to string
    if (Object.hasOwn(envs, key)) {
      const value = String(envs[key])
      exportedEnv[key] = value
    }
  }
  return exportedEnv
}

/**
 * Expands shell-style variables in a command string using the current environment.
 * Supports ${VAR} and ${VAR:0:7} (substring) syntax.
 */
export function expandShellVars(command: string, env: Record<string, string> = Deno.env.toObject()): string {
  return command.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::(\d+):(\d+))?\}/g, (_, varName, start, len) => {
    const value = env[varName] ?? ''
    if (start !== undefined && len !== undefined) {
      return value.substring(Number(start), Number(start) + Number(len))
    }
    return value
  })
}

/// List of allowed commands for security reasons
/// This is a security measure to prevent arbitrary command execution
export const allowedCommands = [
  'mvn',
  'npm',
  'docker',
  'git',
  'helm',
  'gh',
  'az',
  'cp',
  'python',
]

/**
 * Executes a shell command, streaming its stdout and stderr.
 * Throws an error if the command fails.
 * @param commandString The command to execute.
 * @param groupTitle Title for the log group.
 * @param env Optional environment variables to set for the command.
 * @param cwd Optional working directory for the command.
 * @returns The exit code of the command.
 * @throws If the command fails (non-zero exit code).
 */
export async function executeCommand(
  commandString: string | string[],
  groupTitle: string,
  env?: Record<string, string>,
  cwd?: string,
): Promise<number> {
  core.startGroup(groupTitle)

  const extendedEnv = {
    ...Deno.env.toObject(), // Include all current environment variables
    ...env,
    FORCE_COLOR: '1', // Force color output for tools respecting this
    CLICOLOR_FORCE: '1', // Force color output for tools respecting this
  }

  const firstArg = Array.isArray(commandString) ? commandString[0] : commandString.split(' ')[0]
  if (!firstArg || !allowedCommands.includes(firstArg)) {
    throw new Error(`Command '${firstArg}' is not allowed. Allowed commands: ${allowedCommands.join(', ')}`)
  }

  const args = Array.isArray(commandString) ? commandString.slice(1) : commandString.split(' ').slice(1)

  core.info(`Executing command: ${firstArg} with args: ${args.join(' ')}`)

  const command = new Deno.Command(firstArg, {
    args,
    env: extendedEnv,
    cwd,
    stdout: 'inherit', // Stream stdout to the parent process
    stderr: 'inherit', // Stream stderr to the parent process
  })
  const { code, signal, success } = await command.output()

  core.info(`Subprocess finished with code: ${code}, signal: ${signal}`)
  core.endGroup()

  if (!success) {
    throw new Error(`Command failed with exit code ${code}: ${commandString}`)
  }
  core.info(`Command finished successfully: ${commandString}`)
  return code
}

/**
 * Executes a shell command, capturing its stdout and stderr.
 * Throws an error if the command fails. Logs output appropriately.
 * @param commandString The command to execute.
 * @param groupTitle Title for the log group.
 * @param env Optional environment variables to set for the command.
 * @param cwd Optional working directory for the command.
 * @returns An object containing the exit code, stdout, and stderr.
 * @throws If the command fails (non-zero exit code).
 */
export async function executeCommandWithOutput(
  commandString: string | string[],
  groupTitle: string,
  env?: Record<string, string>,
  cwd?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  core.startGroup(groupTitle)

  const extendedEnv = {
    ...Deno.env.toObject(), // Include all current environment variables
    ...env,
    FORCE_COLOR: '0', // Disable color for easier parsing of output
    CLICOLOR_FORCE: '0',
  }

  const firstArg = Array.isArray(commandString) ? commandString[0] : commandString.split(' ')[0]
  if (!firstArg || !allowedCommands.includes(firstArg)) {
    core.endGroup() // Ensure group is closed before throwing
    throw new Error(`Command '${firstArg}' is not allowed. Allowed commands: ${allowedCommands.join(', ')}`)
  }

  const args = Array.isArray(commandString) ? commandString.slice(1) : commandString.split(' ').slice(1)

  core.info(`Executing command: ${firstArg} with args: ${args.join(' ')}`)

  const command = new Deno.Command(firstArg, {
    args,
    env: extendedEnv,
    cwd,
    stdout: 'piped', // Capture stdout
    stderr: 'piped', // Capture stderr
  })

  const process = command.spawn()
  let stdout = ''
  let stderr = ''
  const decoder = new TextDecoder()

  // Stream and capture stdout/stderr concurrently
  const stdoutPromise = (async () => {
    for await (const chunk of process.stdout) {
      const decodedChunk = decoder.decode(chunk, { stream: true })
      stdout += decodedChunk
      core.info(decodedChunk.trimEnd()) // Log lines as they come
    }
  })()

  const stderrPromise = (async () => {
    for await (const chunk of process.stderr) {
      const decodedChunk = decoder.decode(chunk, { stream: true })
      stderr += decodedChunk
      core.error(decodedChunk.trimEnd()) // Log error lines as they come
    }
  })()

  // Wait for streams to close and process to exit
  await Promise.all([stdoutPromise, stderrPromise])
  const status = await process.status

  // Short delay to ensure all output is flushed/logged before closing group
  await delay(100)

  core.info(`Subprocess finished with code: ${status.code}, signal: ${status.signal}`)
  core.endGroup()

  if (!status.success) {
    throw new Error(`Command failed with exit code ${status.code}: ${commandString}\nStderr:\n${stderr}`)
  }

  core.info(`Command finished successfully: ${commandString}`)
  return { code: status.code, stdout: stdout.trim(), stderr: stderr.trim() }
}

/**
 * Locates the pom.xml file based on application source path.
 * @param workspacePath The GitHub workspace path.
 * @param appSourcePath The application source path from appVars.
 * @returns The resolved path to pom.xml.
 * @throws If pom.xml cannot be found.
 */
export async function findPomXml(
  workspacePath: string,
  appSourcePath: string | undefined,
): Promise<string> {
  const sourceDir = appSourcePath || '.' // Default to current dir if empty/missing
  const basePomPath = resolve(workspacePath, sourceDir)
  let pomFilePath: string | null = null

  core.debug(`Checking for pom.xml based on sourceDir: ${sourceDir}`)
  core.debug(`Resolved base path: ${basePomPath}`)

  // Check if sourceDir itself is the pom.xml file (case insensitive check on basename)
  if (
    (await exists(basePomPath, { isFile: true })) &&
    basename(basePomPath).toLowerCase() === 'pom.xml'
  ) {
    pomFilePath = basePomPath
    core.debug(`Found pom.xml directly at: ${pomFilePath}`)
  } else {
    // If not, check for pom.xml inside the sourceDir
    const pomInDir = join(basePomPath, 'pom.xml')
    core.debug(`Checking for pom.xml inside directory: ${pomInDir}`)
    if (await exists(pomInDir, { isFile: true })) {
      pomFilePath = pomInDir
      core.debug(`Found pom.xml inside directory: ${pomFilePath}`)
    }
  }

  if (!pomFilePath) {
    throw new Error(`Cannot find pom.xml. Checked '${basePomPath}' and '${join(basePomPath, 'pom.xml')}'`)
  }
  core.info(`Located pom.xml at: ${pomFilePath}`)
  return pomFilePath
}

const MVN_FORCE_COLOR: string = '-Dstyle.color=always'

/**
 * Determines the Maven command based on the provided inputs and application variables.
 *
 * @param {string} cmdInput - The command input from the GitHub Action.
 * @param {AppVars} appVars - The application variables.
 * @param {string} safePomFilePath - The path to the pom.xml file.
 * @param {string} goalsDefault - The default goals if not specified in appVars.
 * @param {string} argsDefault - The default arguments if not specified in appVars.
 * @param {string} commandKey - The key in appVars for the specific command.
 * @param {string} goalsKey - The key in appVars for the specific goals.
 * @param {string} argsKey - The key in appVars for the specific arguments.
 * @returns {string} The determined Maven command.
 */
export function determineMavenCommand(
  cmdInput: string | undefined,
  appVars: AppVars,
  safePomFilePath: string,
  goalsDefault: string,
  argsDefault: string,
  commandKey: string | undefined,
  goalsKey: string | undefined,
  argsKey: string | undefined,
  skipTests: boolean = false,
): string {
  const skipTestsFlag = '-DskipTests'
  if (cmdInput) {
    core.info("Using command from 'inputs'.")
    const inputArgs = cmdInput.split(' ')
    if (!cmdInput.includes(MVN_FORCE_COLOR) && inputArgs[0] === 'mvn') {
      return `${inputArgs[0]} ${MVN_FORCE_COLOR} ${inputArgs.slice(1).join(' ')}`
    }
    if (skipTests && !cmdInput.includes(skipTestsFlag)) {
      core.info(`Adding ${skipTestsFlag} based on skipTests flag.`)
      cmdInput = `${cmdInput} ${skipTestsFlag}`
    }
    return cmdInput
  } else if (commandKey && appVars[commandKey]) {
    core.info("Using command from 'dsb-build-envs'.")
    let inputCommand = appVars[commandKey] as string
    const inputArgs = inputCommand.split(' ')
    if (!inputCommand.includes(MVN_FORCE_COLOR) && inputArgs[0] === 'mvn') {
      inputCommand = `${inputArgs[0]} ${MVN_FORCE_COLOR} ${inputArgs.slice(1).join(' ')}`
    }
    if (skipTests && !inputCommand.includes(skipTestsFlag)) {
      core.info(`Adding ${skipTestsFlag} based on skipTests flag.`)
      inputCommand = `${inputCommand} ${skipTestsFlag}`
    }
    return inputCommand
  } else {
    core.info('Constructing command from goals/arguments.')
    const goals = (goalsKey && appVars[goalsKey]) ? appVars[goalsKey] as string : goalsDefault
    let args = (argsKey && appVars[argsKey]) ? appVars[argsKey] as string : argsDefault
    const usingDefaultGoals = !(goalsKey && goalsKey in appVars)
    const usingDefaultArgs = !(argsKey && argsKey in appVars)

    // Want to ensure that the color output is always enabled
    if (!args.includes(MVN_FORCE_COLOR)) {
      args = `${MVN_FORCE_COLOR} ${args}`
    }
    if (skipTests && !args.includes(skipTestsFlag)) {
      core.info(`Adding ${skipTestsFlag} based on skipTests flag.`)
      args = `${args} ${skipTestsFlag}`
    }

    core.info(`Goals: '${goals}' (Source: ${usingDefaultGoals ? 'default' : 'dsb-build-envs'})`)
    core.info(`Arguments: '${args}' (Source: ${usingDefaultArgs ? 'default' : 'dsb-build-envs'})`)

    return `mvn ${args} --file ${safePomFilePath} ${goals}`
  }
}
