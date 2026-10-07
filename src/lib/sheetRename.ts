import type { SheetData } from '@/types'
import { quoteSheetName } from '@/lib/namedRanges'

const MAX_SHEET_NAME_LENGTH = 31

export type RenameSheetResult = { ok: true } | { ok: false; error: string }

/** Excel sheet-name rules. Returns an error message, or null when valid. */
export function validateSheetName(
  name: string,
  sheets: Array<Pick<SheetData, 'id' | 'name'>>,
  excludeSheetId?: string,
): string | null {
  if (!name) return 'Sheet name cannot be empty.'
  if (name.length > MAX_SHEET_NAME_LENGTH) return `Sheet name must be ${MAX_SHEET_NAME_LENGTH} characters or fewer.`
  if (/[:\\/?*[\]]/.test(name)) return 'Sheet name cannot contain : \\ / ? * [ or ].'
  if (name.startsWith("'") || name.endsWith("'")) return 'Sheet name cannot start or end with an apostrophe.'
  const lower = name.toLowerCase()
  if (sheets.some((s) => s.id !== excludeSheetId && s.name.toLowerCase() === lower)) {
    return `A sheet named "${name}" already exists.`
  }
  return null
}

/**
 * Point `OldName!A1` / `'Old Name'!A1` references at the renamed sheet.
 * Text inside double-quoted string literals is left alone.
 */
export function renameSheetInFormula(formula: string, oldName: string, newName: string): string {
  if (!formula.includes('!')) return formula
  const oldLower = oldName.toLowerCase()
  const replacement = `${quoteSheetName(newName)}!`
  return formula.replace(
    /("(?:[^"]|"")*")|'((?:[^']|'')*)'!|(?<![A-Za-z0-9._])([A-Za-z_][A-Za-z0-9._]*)!/g,
    (match, strLit: string | undefined, quoted: string | undefined, bare: string | undefined) => {
      if (strLit != null) return match
      const name = quoted != null ? quoted.replace(/''/g, "'") : bare
      return name?.toLowerCase() === oldLower ? replacement : match
    },
  )
}
