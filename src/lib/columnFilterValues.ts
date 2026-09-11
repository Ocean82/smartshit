/**
 * Collect unique display values in a column for the header filter checklist.
 * Dedupes case-insensitively; keeps the first-seen display form. Blank → ''.
 */
export function collectColumnUniqueValues(args: {
  startRow: number
  endRow: number
  column: number
  getDisplay: (row: number, col: number) => string
  maxValues?: number
}): string[] {
  const max = args.maxValues ?? 500
  const seen = new Set<string>()
  const out: string[] = []
  for (let r = args.startRow; r <= args.endRow; r++) {
    const raw = args.getDisplay(r, args.column)
    const display = raw.trim() === '' ? '' : raw
    const key = display.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(display)
    if (out.length >= max) break
  }
  out.sort((a, b) => {
    if (a === '' && b !== '') return -1
    if (b === '' && a !== '') return 1
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  })
  return out
}
