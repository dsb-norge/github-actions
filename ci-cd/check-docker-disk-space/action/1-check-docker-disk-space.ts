import { core } from 'common/deps.ts'
import { executeCommand, executeCommandWithOutput, getActionInput } from 'common/utils/helpers.ts'
import { handleError } from 'common/utils/error.ts'

const DEFAULT_THRESHOLD_GB = 7
const BYTES_PER_GB = 1024 * 1024 * 1024

/**
 * Parses a size string (e.g., "8.0GB", "500MB", "1.2kB") into bytes.
 * Handles floating point numbers and various units (case-insensitive).
 * Returns 0 and logs a warning if parsing fails.
 */
export function parseSizeToBytes(sizeStr: string): number {
  if (!sizeStr) {
    core.warning('parseSizeToBytes received empty string, returning 0.')
    return 0
  }

  // Regex to capture number (int/float) and optional unit
  const sizeMatch = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?$/i)
  if (!sizeMatch) {
    core.warning(`Could not parse size string: "${sizeStr}". Assuming 0 bytes.`)
    return 0
  }

  const num = parseFloat(sizeMatch[1])
  const unit = (sizeMatch[2] || 'B').toUpperCase() // Default to Bytes if no unit

  let multiplier = 1
  switch (unit) {
    case 'T':
    case 'TB':
    case 'TIB':
      multiplier = 1024 * 1024 * 1024 * 1024
      break
    case 'G':
    case 'GB':
    case 'GIB':
      multiplier = BYTES_PER_GB
      break
    case 'M':
    case 'MB':
    case 'MIB':
      multiplier = 1024 * 1024
      break
    case 'K':
    case 'KB':
    case 'KIB':
      multiplier = 1024
      break
    case 'B':
      multiplier = 1
      break
    default:
      core.warning(`Unknown size unit "${unit}" in "${sizeStr}". Assuming bytes.`)
      multiplier = 1
  }

  // Use Math.round for potentially large numbers resulting from float multiplication
  return Math.round(num * multiplier)
}

export async function run(): Promise<void> {
  try {
    // --- Get Inputs & Environment Variables ---
    const thresholdGbInput: string = getActionInput('threshold-gb', false) || String(DEFAULT_THRESHOLD_GB)
    const thresholdGb = parseInt(thresholdGbInput, 10)

    if (isNaN(thresholdGb) || thresholdGb < 0) {
      throw new Error(`Invalid threshold-gb input: "${thresholdGbInput}". Must be a non-negative number.`)
    }
    const thresholdBytes = thresholdGb * BYTES_PER_GB
    core.info(`Disk usage threshold set to ${thresholdGb}GB (${thresholdBytes} bytes) for TOTAL reclaimable space.`)

    // --- Main Logic ---
    core.info('Running docker system df...')
    const dfResult = await executeCommandWithOutput('docker system df', 'Get Docker Disk Usage')
    const dfOutput = dfResult.stdout
    const dfError = dfResult.stderr

    if (dfResult.code !== 0) {
      core.error('output:\n' + dfOutput)
      core.error('error output:\n' + dfError)
      throw new Error(`'docker system df' failed with code ${dfResult.code}`)
    }
    core.info('output:\n' + dfOutput)

    // --- Parse Output ---
    const lines = dfOutput.trim().split('\n')
    if (lines.length < 2) {
      core.warning('No data lines found in `docker system df` output. Skipping prune check.')
      return
    }

    const headerLine = lines[0]
    const dataLines = lines.slice(1)

    // Find the index of the RECLAIMABLE column
    const headers = headerLine.trim().split(/\s{2,}/) // Split header by 2+ spaces
    const reclaimableIndex = headers.findIndex((h) => h.toUpperCase().includes('RECLAIMABLE'))

    if (reclaimableIndex === -1) {
      core.warning("Could not find 'RECLAIMABLE' column in `docker system df` header. Skipping prune check.")
      return
    }

    let totalReclaimableBytes = 0
    let foundReclaimableValue = false

    for (const line of dataLines) {
      const fields = line.trim().split(/\s{2,}/) // Split data line by 2+ spaces
      if (fields.length > reclaimableIndex) {
        // The reclaimable value might have the percentage attached, e.g., "7.002GB (100%)"
        // We only want the size part.
        const reclaimableField = fields[reclaimableIndex]
        const sizeMatch = reclaimableField.match(/^(\d+(?:\.\d+)?\s*[a-zA-Z]+)/) // Match the size part at the beginning
        if (sizeMatch && sizeMatch[1]) {
          const reclaimableStr = sizeMatch[1].trim()
          core.debug(`Found reclaimable value: ${reclaimableStr} from line: "${line}"`)
          totalReclaimableBytes += parseSizeToBytes(reclaimableStr)
          foundReclaimableValue = true
        } else {
          core.debug(`Could not extract size from reclaimable field: "${reclaimableField}" in line: "${line}"`)
        }
      } else {
        core.debug(`Line does not have enough fields to get reclaimable value: "${line}"`)
      }
    }

    if (!foundReclaimableValue) {
      core.warning('Could not extract any reclaimable size values from `docker system df` output. Skipping prune check.')
      return
    }

    core.info(`Total Calculated Reclaimable Bytes: ${totalReclaimableBytes}`)
    core.info(`Threshold Bytes: ${thresholdBytes}`)

    // --- Check Threshold and Prune ---
    if (totalReclaimableBytes > thresholdBytes) {
      core.info(`Total calculated reclaimable space (${(totalReclaimableBytes / BYTES_PER_GB).toFixed(2)}GB) exceeds threshold (${thresholdGb}GB). Pruning Docker system...`)
      await executeCommand('docker system prune -a -f', 'Prune Docker System')
      core.info('Docker prune completed. Checking space again:')
      // Run df again to show the result after pruning
      await executeCommand('docker system df', 'Get Docker Disk Usage After Prune')
    } else {
      core.info(`Total calculated reclaimable space (${(totalReclaimableBytes / BYTES_PER_GB).toFixed(2)}GB) is within threshold (${thresholdGb}GB). No pruning needed.`)
    }

    core.info('Action step completed successfully.')
  } catch (error) {
    handleError(error, 'Check Docker Disk Space')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
