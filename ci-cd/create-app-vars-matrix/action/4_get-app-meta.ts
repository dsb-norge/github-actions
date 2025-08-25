import { AppVars } from 'common/interfaces/application-variables.ts'
import { core, exists, parseXML } from 'common/deps.ts'
import { handleError } from 'common/utils/error.ts'
import { getActionInput, tryParseJson } from 'common/utils/helpers.ts'

async function getSourceFilePath(
  srcPath: string,
  appType: string,
): Promise<string | undefined> {
  if ((await Deno.stat(srcPath)).isDirectory) {
    core.debug(`'application-source-path' '${srcPath}' is a directory.`)
    if (appType === 'spring-boot' || appType === 'maven-library') {
      return `${srcPath}/pom.xml`
    } else if (appType === 'vue') {
      return `${srcPath}/package.json`
    } else if (appType === 'python') {
      return `${srcPath}/requirements.txt`
    }
  } else {
    return srcPath
  }
  return undefined
}

async function extractMetadata(
  sourceFilePath: string,
  appType: string,
  sourcePath: string,
): Promise<
  { appDesc?: string; appJavaVersion?: string; appNodeVersion?: string; appE2eMode: boolean }
> {
  const srcData = await Deno.readTextFile(sourceFilePath)

  if (!srcData) {
    throw new Error(`Unable to use given 'application-source-path', '${sourceFilePath}' was empty.`)
  }

  let appDesc: string | undefined
  let appJavaVersion: string | undefined
  let appNodeVersion: string | undefined
  let appE2eMode: boolean = false

  if (appType === 'spring-boot' || appType === 'maven-library') {
    const parser = new parseXML()
    const xmlDoc = parser.parse(srcData)

    appDesc = xmlDoc?.project?.description
    appJavaVersion = xmlDoc?.project?.properties['java.version']

    if (!appJavaVersion) {
      throw new Error(`Could not detect 'java-version' from file '${sourceFilePath}', '<java.version>' field is missing.`)
    }
  } else if (appType === 'vue') {
    const jsonData = JSON.parse(srcData)
    appDesc = jsonData.description
    appNodeVersion = jsonData.engines?.node
    appE2eMode = await exists(`${sourcePath}/Dockerfile.playwright`)
  } else {
    throw new Error(`Unknown 'application-type' '${appType}', not sure how to parse file '${sourceFilePath}'.`)
  }

  return { appDesc, appJavaVersion, appNodeVersion, appE2eMode }
}

async function processApp(app: AppVars) {
  const appName = app['application-name']
  core.startGroup(`Get application metadata for app '${appName}'`)

  // Use default source path if not defined
  if (!app['application-source-path']) {
    core.info("'application-source-path' not defined, using default.")
    app['application-source-path'] = './'
  }

  const srcPath = app['application-source-path']
  const appType = app['application-type']

  if (!appType) {
    throw new Error(`'application-type' is not defined for app '${appName}'`)
  }

  if (!await exists(srcPath)) {
    throw new Error(`'application-source-path' '${srcPath}' does not exist!`)
  }

  const sourceFilePath = await getSourceFilePath(srcPath, appType)

  if (!sourceFilePath || !(await exists(sourceFilePath))) {
    throw new Error(`Unable to use 'application-source-path' with value '${srcPath}'.`)
  }

  core.info(`Reading file '${sourceFilePath}' for metadata extraction...`)

  const { appDesc, appJavaVersion, appNodeVersion, appE2eMode } = await extractMetadata(sourceFilePath, appType, srcPath)

  // Set description
  if (!app['application-description'] && appDesc) {
    core.info(`Setting 'application-description' to: '${appDesc}'.`)
    app['application-description'] = appDesc
  }

  // Set java version
  if (!app['java-version'] && appJavaVersion) {
    core.info(`Setting 'java-version' to: '${appJavaVersion}'.`)
    app['java-version'] = appJavaVersion.toString()
  }

  // Set node version
  if (!app['nodejs-version'] && appNodeVersion) {
    core.info(`Setting 'nodejs-version' to: '${appNodeVersion}'.`)
    app['nodejs-version'] = appNodeVersion
  }

  core.info(`Setting 'application-e2e-mode' to: '${appE2eMode}'.`)
  app['nodejs-e2e-enabled'] = appE2eMode

  core.endGroup()
}

export async function getAppMeta() {
  try {
    // 1. Get the 'app-vars' input (which is a JSON string)
    const appVarsJson = getActionInput('APPVARS', true)

    // 2. Log the JSON input
    if (core.isDebug()) {
      core.startGroup('JSON input received')
      core.debug(appVarsJson)
      core.endGroup()
    }

    // 3. Parse the JSON string into a JavaScript array
    const appVars: AppVars[] = tryParseJson<AppVars[]>(appVarsJson)!

    if (appVars.length === 0) {
      throw new Error("The 'APPVARS' input must not be an empty array.")
    }

    core.info('Getting metadata for each application...')

    // 4. Iterate through each app and get metadata
    for (const app of appVars) {
      await processApp(app)
    }

    core.info('Metadata extraction completed.')

    // 5. Set the output
    core.setOutput('APPVARS', JSON.stringify(appVars))
  } catch (error) {
    handleError(error, 'get app meta')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  getAppMeta()
}
