import { AppVars } from 'common/interfaces/application-variables.ts'

export const mockOutputs: { [key: string]: string } = {}

export const mockCore = {
  yamlPath: '',
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
    } else if (name in mockOutputs) {
      // Return the output for the test
      return mockOutputs[name]
    }
    return '' // Default empty string for other inputs
  },
  setOutput: (name: string, value: string) => {
    // Store the output for assertion later
    mockOutputs[name] = value
  },
  getOutputAppVars: (): AppVars[] => {
    if (!mockOutputs['APPVARS']) {
      throw new Error('APPVARS output not set')
    }
    return JSON.parse(
      mockOutputs['APPVARS'] as string,
    ) as unknown as AppVars[]
  },
  info: (message: string) => {
    console.log('INFO:', message)
  },
  error: (message: string) => {
    console.error('ERROR:', message)
  },
  warning: (message: string) => {
    console.warn('WARNING:', message)
  },
  debug: (message: string) => {
    console.debug('DEBUG:', message)
  },
  setFailed: (message: string) => {
    console.error('FAILED:', message)
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
  mockOutputs['APPVARS'] = JSON.stringify(appVarsInput)
}

export function resetMockCore() {
  mockOutputs['APPVARS'] = ''
  mockCore.yamlPath = ''
  mockOutputs['APPVARS'] = JSON.stringify(appVars)
}
