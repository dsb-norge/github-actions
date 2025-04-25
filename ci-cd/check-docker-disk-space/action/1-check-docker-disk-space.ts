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
      core.error('`docker system df` output:\n' + dfOutput)
      core.error('`docker system df` error output:\n' + dfError)
      throw new Error(`'docker system df' failed with code ${dfResult.code}`)
    }
    core.info('`docker system df` output:\n' + dfOutput)

    // --- Parse Output ---
    // Find the line containing "RECLAIMABLE" and usually the total percentage at the end.
    const lines = dfOutput.trim().split('\n')
    let totalReclaimableLine = ''

    // Try finding a line explicitly containing "Total RECLAIMABLE" (case insensitive)
    totalReclaimableLine = lines.find((line) => line.toUpperCase().includes('TOTAL RECLAIMABLE')) || ''

    // Fallback: Find the last line containing "RECLAIMABLE" if the explicit total isn't found
    if (!totalReclaimableLine) {
      const reclaimableLines = lines.filter((line) => line.toUpperCase().includes('RECLAIMABLE'))
      if (reclaimableLines.length > 0) {
        totalReclaimableLine = reclaimableLines[reclaimableLines.length - 1]
        core.debug(`Using last line containing 'RECLAIMABLE' as total: "${totalReclaimableLine}"`)
      }
    }

    if (!totalReclaimableLine) {
      core.warning('Could not determine total reclaimable space line in `docker system df` output. Skipping prune check.')
      return // Exit gracefully
    }

    // Extract the size string (e.g., "10.2GB") from the line.
    // It's often the second to last field before the percentage.
    const fields = totalReclaimableLine.trim().split(/\s+/)
    let reclaimableStr = ''
    if (fields.length >= 2) {
      // Find the field that looks like a size (number followed by unit) near the end
      // Iterate backwards from the end, skipping potential percentage like (xx%)
      for (let i = fields.length - 1; i >= 0; i--) {
        // Check if it's NOT a percentage like (xx%)
        if (!fields[i].match(/^\(\d+(\.\d+)?%\)$/)) {
          // Check if it IS a size string
          if (fields[i].match(/^\d+(\.\d+)?\s*[a-zA-Z]+$/i)) {
            reclaimableStr = fields[i]
            break
          }
        }
      }
    }

    if (!reclaimableStr) {
      core.warning(`Could not parse total reclaimable size from line: "${totalReclaimableLine}". Skipping prune check.`)
      return // Exit gracefully
    }

    core.info(`Total Reclaimable String: ${reclaimableStr}`)
    const reclaimableBytes = parseSizeToBytes(reclaimableStr)
    core.info(`Total Reclaimable Bytes: ${reclaimableBytes}`)
    core.info(`Threshold Bytes: ${thresholdBytes}`)

    // --- Check Threshold and Prune ---
    if (reclaimableBytes > thresholdBytes) {
      core.info(`Total reclaimable space (${reclaimableStr}) exceeds threshold (${thresholdGb}GB). Pruning Docker system...`)
      await executeCommand('docker system prune -a -f', 'Prune Docker System')
      core.info('Docker prune completed. Checking space again:')
      // Run df again to show the result after pruning
      await executeCommand('docker system df', 'Get Docker Disk Usage After Prune')
    } else {
      core.info(`Total reclaimable space (${reclaimableStr}) is within threshold (${thresholdGb}GB). No pruning needed.`)
    }

    core.info('Action step completed successfully.')
  } catch (error) {
    handleError(error, 'Check Docker Disk Space')
  }
}

if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
  run()
}
