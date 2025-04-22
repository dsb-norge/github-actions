export function isValidEntry(
  entry: Record<string, unknown>,
  entryName: string,
  requiredKeys: string[],
): string[] {
  const errors: string[] = []

  for (const key of requiredKeys) {
    if (!(key in entry)) {
      errors.push(`Build env '${key}' is required but was not found in '${entryName}' JSON.`)
    } else if (typeof entry[key] === 'string' && entry[key].trim() === '') {
      errors.push(`It is required that build env '${key}' is set to a value; an empty string was found in '${entryName} JSON.`)
    } else if (typeof entry[key] === undefined || entry[key] === null) {
      errors.push(`It is required that build env '${key}' is set to a value; null or undefined was found in '${entryName} JSON.`)
    } else if (typeof entry[key] === 'object' && Object.keys(entry[key] as object).length === 0) {
      errors.push(`It is required that build env '${key}' is set to a value; an empty object was found in '${entryName} JSON.`)
    }
  }

  return errors
}
