import { AppVars } from '../interfaces/application-variables.ts' // Corrected path

export const mockOutputs: { [key: string]: string } = {}
export const mockInfoLogs: string[] = []
export const mockErrorLogs: string[] = []
export const mockWarningLogs: string[] = []
export const mockDebugLogs: string[] = []

export const mockCore = {
  yamlPath: '',
  outputs: mockOutputs, // Renamed for consistency with test usage
  infoLogs: mockInfoLogs,
  errorLogs: mockErrorLogs,
  warningLogs: mockWarningLogs,
  debugLogs: mockDebugLogs,
  getInput: (name: string) => {
    if (name === 'APPS') {
      // Read the YAML file here
      try {
        console.log(`Current directory: ${Deno.cwd()}`)
        const yamlContent = Deno.readTextFileSync(
          `./testdata/${mockCore.yamlPath}`,
        )
        return yamlContent
      } catch (error) {
        throw new Error(`Error reading YAML file: ${error}`)
      }
    } else if (name in mockCore.outputs) { // Use mockCore.outputs
      // Return the output for the test
      return mockCore.outputs[name] // Use mockCore.outputs
    }
    return '' // Default empty string for other inputs
  },
  setOutput: (name: string, value: string) => {
    // Store the output for assertion later
    mockCore.outputs[name] = value // Use mockCore.outputs
  },
  getOutputAppVars: (): AppVars[] => {
    if (!mockCore.outputs['APPVARS']) { // Use mockCore.outputs
      throw new Error('APPVARS output not set')
    }
    return JSON.parse(
      mockCore.outputs['APPVARS'] as string, // Use mockCore.outputs
    ) as unknown as AppVars[]
  },
  info: (message: string) => {
    console.log('INFO:', message)
    mockInfoLogs.push(message)
  },
  error: (message: string) => {
    console.error('ERROR:', message)
    mockErrorLogs.push(message)
  },
  warning: (message: string) => {
    console.warn('WARNING:', message)
    mockWarningLogs.push(message)
  },
  debug: (message: string) => {
    console.debug('DEBUG:', message)
    mockDebugLogs.push(message)
  },
  setFailed: (message: string) => {
    console.error('FAILED:', message)
    mockErrorLogs.push(`FAILED: ${message}`) // Also log to error logs
    throw new Error(message) // Simulate failure
  },
  startGroup: (name: string) => {
    console.log(`START GROUP: ${name}`)
  },
  endGroup: () => {
    console.log('END GROUP')
  },
  isDebug: () => {
    return true // Change this to true if you want to enable debug mode
  },
  setSecret: (_value: string) => {
    // No-op for mock
  },
}

const appVars: AppVars[] = [] // Define appVars in a broader scope

export function setAppVars(appVarsInput: AppVars[]) {
  appVars.length = 0 // Clear the existing appVars
  appVars.push(...appVarsInput)
  mockCore.outputs['APPVARS'] = JSON.stringify(appVarsInput) // Use mockCore.outputs
}

export function resetMockCore() {
  // Clear outputs
  for (const key in mockCore.outputs) {
    delete mockCore.outputs[key]
  }
  // Clear logs
  mockInfoLogs.length = 0
  mockErrorLogs.length = 0
  mockWarningLogs.length = 0
  mockDebugLogs.length = 0

  mockCore.yamlPath = ''
  // No need to set APPVARS here, setAppVars should be called if needed by test
}
