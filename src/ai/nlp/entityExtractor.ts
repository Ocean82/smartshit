/**
 * Entity Extractor
 *
 * Extracts structured entities from user input text using
 * the active workbook context for resolution. Handles:
 * - Column resolution (by header name, letter, or ordinal)
 * - Numeric extraction (currency prefixes, plain numbers, thousands separators)
 * - Comparison operator mapping (natural language → operator entities)
 * - Sheet resolution (by name or ordinal)
 *
 * Returns entities in left-to-right order as they appear in the input.
 * Pure-logic module — no DOM, no Worker APIs.
 */

import type { IntentType, Entity, ExtractedEntity, UnresolvedEntity, AmbiguousEntity } from '@shared/intentTypes'
import type { WorkbookContext } from './types'

// ─── Word Number Mapping ────────────────────────────────────────────────────

const WORD_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
  million: 1000000,
}

// ─── Ordinal Mapping ────────────────────────────────────────────────────────

const ORDINAL_WORDS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
  seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
  thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16,
  seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20,
}

// ─── Comparison Operator Patterns ───────────────────────────────────────────

interface OperatorMapping {
  patterns: string[]
  value: string
}

const OPERATOR_MAPPINGS: OperatorMapping[] = [
  // Order matters: longer/more specific patterns first to avoid partial matches
  { patterns: ['greater than or equal', 'at least', 'no less than'], value: 'greater-than-or-equal' },
  { patterns: ['less than or equal', 'at most', 'no more than'], value: 'less-than-or-equal' },
  { patterns: ['not equal to', 'not equals', 'different from', "isn't"], value: 'not-equal-to' },
  { patterns: ['greater than', 'more than', 'over', 'above', 'exceeds', 'bigger than'], value: 'greater-than' },
  { patterns: ['less than', 'under', 'below', 'fewer than', 'smaller than'], value: 'less-than' },
  { patterns: ['equal to', 'equals', 'exactly'], value: 'equal-to' },
]

// ─── Numeric Parsing ────────────────────────────────────────────────────────

const MAX_NUMERIC_VALUE = 999_999_999.99

/**
 * Parse a word-based number like "five hundred" or "twenty three thousand".
 * Returns null if the text cannot be parsed as a word number.
 */
export function parseWordNumber(text: string): number | null {
  const words = text.toLowerCase().trim().split(/[\s-]+/)
  let result = 0
  let current = 0

  for (const word of words) {
    const val = WORD_NUMBERS[word]
    if (val === undefined) return null

    if (val === 1000000) {
      current = current === 0 ? 1000000 : current * 1000000
      result += current
      current = 0
    } else if (val === 1000) {
      current = current === 0 ? 1000 : current * 1000
      result += current
      current = 0
    } else if (val === 100) {
      current = current === 0 ? 100 : current * 100
    } else {
      current += val
    }
  }

  result += current
  return result
}

/**
 * Parse a formatted number string into a normalized decimal.
 * Handles: "$1,500.50", "500", "1000.5", "$500", "500 dollars"
 * Returns null if not a valid number.
 */
export function parseFormattedNumber(text: string): number | null {
  // Remove currency prefixes/suffixes
  let cleaned = text.trim()
    .replace(/^\$\s*/, '')
    .replace(/\s*dollars?\s*$/i, '')
    .replace(/\s*usd\s*$/i, '')
    .trim()

  // Remove thousands separators (commas)
  cleaned = cleaned.replace(/,/g, '')

  // Parse as float
  const val = parseFloat(cleaned)
  if (isNaN(val) || !isFinite(val)) return null
  if (val < 0 || val > MAX_NUMERIC_VALUE) return null

  // Normalize to 2 decimal places
  return Math.round(val * 100) / 100
}

// ─── Entity Extraction Helpers ──────────────────────────────────────────────

interface MatchResult {
  startIndex: number
  endIndex: number
  entity: Entity
}

/**
 * Find all operator entities in the text.
 */
function extractOperators(text: string): MatchResult[] {
  const results: MatchResult[] = []
  const lowerText = text.toLowerCase()

  for (const mapping of OPERATOR_MAPPINGS) {
    for (const pattern of mapping.patterns) {
      let searchFrom = 0
      while (true) {
        const idx = lowerText.indexOf(pattern, searchFrom)
        if (idx === -1) break

        // Ensure word boundary: not part of a larger word
        const before = idx > 0 ? lowerText[idx - 1] : ' '
        const after = idx + pattern.length < lowerText.length ? lowerText[idx + pattern.length] : ' '
        const isWordBoundary = /[\s,;.!?]/.test(before) || idx === 0
        const isEndBoundary = /[\s,;.!?]/.test(after) || idx + pattern.length === lowerText.length

        if (isWordBoundary && isEndBoundary) {
          // Check no existing match overlaps this position
          const overlaps = results.some(
            r => idx < r.endIndex && idx + pattern.length > r.startIndex
          )
          if (!overlaps) {
            results.push({
              startIndex: idx,
              endIndex: idx + pattern.length,
              entity: {
                type: 'operator',
                value: mapping.value,
                originalText: text.slice(idx, idx + pattern.length),
                resolved: true,
              } as ExtractedEntity,
            })
          }
        }
        searchFrom = idx + 1
      }
    }
  }

  return results
}

/**
 * Find all numeric entities in the text.
 */
function extractNumbers(text: string): MatchResult[] {
  const results: MatchResult[] = []

  // Pattern for formatted numbers: $1,234.56, 1234, 1234.56, $500
  // Requires that the number is not preceded by a letter (avoids "Sheet1")
  const numericPattern = /(?<![a-zA-Z])\$?\s?\d[\d,]*(?:\.\d{1,2})?\s*(?:dollars?|usd)?/gi
  let match: RegExpExecArray | null

  while ((match = numericPattern.exec(text)) !== null) {
    const parsed = parseFormattedNumber(match[0])
    if (parsed !== null) {
      results.push({
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        entity: {
          type: 'number',
          value: parsed,
          originalText: match[0].trim(),
          resolved: true,
        } as ExtractedEntity,
      })
    }
  }

  // Pattern for word numbers: "five hundred", "twenty three"
  // Match sequences of known number words
  const wordNumberPattern = /\b((?:(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million)[\s-]*)+)\b/gi

  while ((match = wordNumberPattern.exec(text)) !== null) {
    const parsed = parseWordNumber(match[1])
    if (parsed !== null && parsed >= 0 && parsed <= MAX_NUMERIC_VALUE) {
      // Avoid overlaps with already-matched formatted numbers
      const overlaps = results.some(
        r => match!.index < r.endIndex && match!.index + match![0].length > r.startIndex
      )
      if (!overlaps) {
        const normalized = Math.round(parsed * 100) / 100
        results.push({
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          entity: {
            type: 'number',
            value: normalized,
            originalText: match[0].trim(),
            resolved: true,
          } as ExtractedEntity,
        })
      }
    }
  }

  return results
}

/**
 * Find all column entities in the text by matching against the workbook context.
 */
function extractColumns(text: string, ctx: WorkbookContext): MatchResult[] {
  const results: MatchResult[] = []
  const _lowerText = text.toLowerCase()

  // Get active sheet columns
  const activeSheet = ctx.sheets.find(s => s.id === ctx.activeSheetId)
  if (!activeSheet) return results

  const columns = activeSheet.columns

  // Pattern 1: "column A", "column B" — match by letter
  const colLetterPattern = /\bcolumn\s+([a-z])\b/gi
  let match: RegExpExecArray | null

  while ((match = colLetterPattern.exec(text)) !== null) {
    const letter = match[1].toUpperCase()
    const found = columns.filter(c => c.letter.toUpperCase() === letter)

    if (found.length === 1) {
      results.push({
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        entity: {
          type: 'column',
          value: found[0].letter,
          originalText: match[0],
          resolved: true,
        } as ExtractedEntity,
      })
    } else if (found.length === 0) {
      results.push({
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        entity: {
          type: 'column',
          originalText: match[0],
          resolved: false,
          reason: 'not_found',
        } as UnresolvedEntity,
      })
    }
  }

  // Pattern 2: "column 3", "column 1" — match by numeric index
  const colNumPattern = /\bcolumn\s+(\d+)\b/gi
  while ((match = colNumPattern.exec(text)) !== null) {
    const idx = parseInt(match[1], 10)
    // Check not already matched by letter pattern
    const overlaps = results.some(
      r => match!.index < r.endIndex && match!.index + match![0].length > r.startIndex
    )
    if (overlaps) continue

    const found = columns.filter(c => c.index === idx - 1) // 1-based user input → 0-based index
    if (found.length === 1) {
      results.push({
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        entity: {
          type: 'column',
          value: found[0].letter,
          originalText: match[0],
          resolved: true,
        } as ExtractedEntity,
      })
    } else if (found.length === 0) {
      results.push({
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        entity: {
          type: 'column',
          originalText: match[0],
          resolved: false,
          reason: 'not_found',
        } as UnresolvedEntity,
      })
    }
  }

  // Pattern 3: "the third column", "first column" — match by ordinal
  const ordinalWords = Object.keys(ORDINAL_WORDS).join('|')
  const colOrdinalPattern = new RegExp(`\\b(?:the\\s+)?(${ordinalWords})\\s+column\\b`, 'gi')
  while ((match = colOrdinalPattern.exec(text)) !== null) {
    const ordinal = match[1].toLowerCase()
    const idx = ORDINAL_WORDS[ordinal]

    const overlaps = results.some(
      r => match!.index < r.endIndex && match!.index + match![0].length > r.startIndex
    )
    if (overlaps) continue

    if (idx !== undefined) {
      const found = columns.filter(c => c.index === idx - 1)
      if (found.length === 1) {
        results.push({
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          entity: {
            type: 'column',
            value: found[0].letter,
            originalText: match[0],
            resolved: true,
          } as ExtractedEntity,
        })
      } else if (found.length === 0) {
        results.push({
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          entity: {
            type: 'column',
            originalText: match[0],
            resolved: false,
            reason: 'not_found',
          } as UnresolvedEntity,
        })
      }
    }
  }

  // Pattern 4: "the Amount column", "Amount column", "{headerName} column"
  // Match by header name (case-insensitive)
  for (const col of columns) {
    if (!col.headerName || col.headerName.trim().length === 0) continue
    const headerLower = col.headerName.toLowerCase()

    // Match patterns like "the {name} column" or "{name} column"
    const headerPattern = new RegExp(
      `\\b(?:the\\s+)?${escapeRegex(headerLower)}\\s+column\\b`,
      'gi'
    )
    while ((match = headerPattern.exec(text)) !== null) {
      const overlaps = results.some(
        r => match!.index < r.endIndex && match!.index + match![0].length > r.startIndex
      )
      if (overlaps) continue

      results.push({
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        entity: {
          type: 'column',
          value: col.letter,
          originalText: match[0],
          resolved: true,
        } as ExtractedEntity,
      })
    }
  }

  // Pattern 5: Bare header name references (without "column" keyword)
  // e.g., "where Amount is..." — but only for multi-word or capitalized headers
  // to reduce false positives
  for (const col of columns) {
    if (!col.headerName || col.headerName.trim().length === 0) continue
    const headerLower = col.headerName.toLowerCase()
    // Only match bare header names that are at least 2 chars
    if (headerLower.length < 2) continue

    const bareHeaderPattern = new RegExp(
      `\\b${escapeRegex(headerLower)}\\b`,
      'gi'
    )
    while ((match = bareHeaderPattern.exec(text)) !== null) {
      const overlaps = results.some(
        r => match!.index < r.endIndex && match!.index + match![0].length > r.startIndex
      )
      if (overlaps) continue

      // Check if this is part of an operator or other common word
      // Only match if the header name isn't a common English word
      const commonWords = new Set(['is', 'the', 'a', 'an', 'and', 'or', 'not', 'in', 'on', 'at', 'to', 'for', 'of', 'by', 'it', 'as'])
      if (commonWords.has(headerLower)) continue

      results.push({
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        entity: {
          type: 'column',
          value: col.letter,
          originalText: match[0],
          resolved: true,
        } as ExtractedEntity,
      })
    }
  }

  return results
}

/**
 * Find all sheet entities in the text by matching against the workbook context.
 */
function extractSheets(text: string, ctx: WorkbookContext): MatchResult[] {
  const results: MatchResult[] = []
  let match: RegExpExecArray | null

  // Pattern 1: "Sheet1", "sheet 1" — match by name (case-insensitive)
  for (const sheet of ctx.sheets) {
    const sheetNameLower = sheet.name.toLowerCase()
    // Match exact sheet name (case-insensitive)
    const namePattern = new RegExp(`\\b${escapeRegex(sheetNameLower)}\\b`, 'gi')
    while ((match = namePattern.exec(text)) !== null) {
      const overlaps = results.some(
        r => match!.index < r.endIndex && match!.index + match![0].length > r.startIndex
      )
      if (overlaps) continue

      results.push({
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        entity: {
          type: 'sheet',
          value: sheet.id,
          originalText: match[0],
          resolved: true,
        } as ExtractedEntity,
      })
    }
  }

  // Pattern 2: "sheet 1", "sheet 2" — match by numeric ordinal with space
  const sheetNumPattern = /\bsheet\s+(\d+)\b/gi
  while ((match = sheetNumPattern.exec(text)) !== null) {
    const overlaps = results.some(
      r => match!.index < r.endIndex && match!.index + match![0].length > r.startIndex
    )
    if (overlaps) continue

    const num = parseInt(match[1], 10)
    const idx = num - 1 // 1-based → 0-based
    if (idx >= 0 && idx < ctx.sheets.length) {
      results.push({
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        entity: {
          type: 'sheet',
          value: ctx.sheets[idx].id,
          originalText: match[0],
          resolved: true,
        } as ExtractedEntity,
      })
    } else {
      results.push({
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        entity: {
          type: 'sheet',
          originalText: match[0],
          resolved: false,
          reason: 'not_found',
        } as UnresolvedEntity,
      })
    }
  }

  // Pattern 3: "the second tab", "second sheet", "first tab" — match by ordinal word
  const ordinalWords = Object.keys(ORDINAL_WORDS).join('|')
  const sheetOrdinalPattern = new RegExp(
    `\\b(?:the\\s+)?(${ordinalWords})\\s+(?:sheet|tab)\\b`,
    'gi'
  )
  while ((match = sheetOrdinalPattern.exec(text)) !== null) {
    const overlaps = results.some(
      r => match!.index < r.endIndex && match!.index + match![0].length > r.startIndex
    )
    if (overlaps) continue

    const ordinal = match[1].toLowerCase()
    const num = ORDINAL_WORDS[ordinal]
    if (num !== undefined) {
      const idx = num - 1
      if (idx >= 0 && idx < ctx.sheets.length) {
        results.push({
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          entity: {
            type: 'sheet',
            value: ctx.sheets[idx].id,
            originalText: match[0],
            resolved: true,
          } as ExtractedEntity,
        })
      } else {
        results.push({
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          entity: {
            type: 'sheet',
            originalText: match[0],
            resolved: false,
            reason: 'not_found',
          } as UnresolvedEntity,
        })
      }
    }
  }

  // Pattern 4: "the expenses sheet", "the {name} sheet/tab" — match by name with suffix
  for (const sheet of ctx.sheets) {
    const sheetNameLower = sheet.name.toLowerCase()
    const namedSheetPattern = new RegExp(
      `\\b(?:the\\s+)?${escapeRegex(sheetNameLower)}\\s+(?:sheet|tab)\\b`,
      'gi'
    )
    while ((match = namedSheetPattern.exec(text)) !== null) {
      const overlaps = results.some(
        r => match!.index < r.endIndex && match!.index + match![0].length > r.startIndex
      )
      if (overlaps) continue

      results.push({
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        entity: {
          type: 'sheet',
          value: sheet.id,
          originalText: match[0],
          resolved: true,
        } as ExtractedEntity,
      })
    }
  }

  return results
}

/**
 * Handle ambiguous column references: when a header name matches multiple columns.
 */
function resolveAmbiguousColumns(text: string, ctx: WorkbookContext): MatchResult[] {
  const results: MatchResult[] = []
  const activeSheet = ctx.sheets.find(s => s.id === ctx.activeSheetId)
  if (!activeSheet) return results

  const columns = activeSheet.columns

  // Group columns by lowercase header name
  const headerGroups = new Map<string, typeof columns>()
  for (const col of columns) {
    if (!col.headerName || col.headerName.trim().length === 0) continue
    const key = col.headerName.toLowerCase()
    const group = headerGroups.get(key) || []
    group.push(col)
    headerGroups.set(key, group)
  }

  // Find ambiguous references (header names with 2+ columns)
  for (const [headerLower, group] of headerGroups) {
    if (group.length < 2) continue

    const headerPattern = new RegExp(
      `\\b(?:the\\s+)?${escapeRegex(headerLower)}\\s+column\\b`,
      'gi'
    )
    let match: RegExpExecArray | null
    while ((match = headerPattern.exec(text)) !== null) {
      results.push({
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        entity: {
          type: 'column',
          originalText: match[0],
          resolved: false,
          reason: 'ambiguous',
          candidates: group.slice(0, 5).map(c => `${c.headerName} (${c.letter})`),
        } as AmbiguousEntity,
      })
    }
  }

  return results
}

/**
 * Handle ambiguous sheet references when multiple sheets could match.
 */
function resolveAmbiguousSheets(text: string, ctx: WorkbookContext): MatchResult[] {
  const results: MatchResult[] = []

  // Group sheets by lowercase name
  const sheetGroups = new Map<string, typeof ctx.sheets>()
  for (const sheet of ctx.sheets) {
    const key = sheet.name.toLowerCase()
    const group = sheetGroups.get(key) || []
    group.push(sheet)
    sheetGroups.set(key, group)
  }

  // Find ambiguous references (sheet names with 2+ matches)
  for (const [nameLower, group] of sheetGroups) {
    if (group.length < 2) continue

    const namePattern = new RegExp(`\\b${escapeRegex(nameLower)}\\b`, 'gi')
    let match: RegExpExecArray | null
    while ((match = namePattern.exec(text)) !== null) {
      results.push({
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        entity: {
          type: 'sheet',
          originalText: match[0],
          resolved: false,
          reason: 'ambiguous',
          candidates: group.slice(0, 5).map(s => s.name),
        } as AmbiguousEntity,
      })
    }
  }

  return results
}

// ─── Utility ────────────────────────────────────────────────────────────────

/** Escape special regex characters in a string */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ─── Main Export ────────────────────────────────────────────────────────────

/**
 * Extract entities from user input text using the workbook context for resolution.
 *
 * Entities are returned in left-to-right order as they appear in the input.
 *
 * @param text - User input text
 * @param _intentType - The classified intent type (reserved for future intent-specific extraction)
 * @param ctx - Active workbook context for entity resolution
 * @returns Array of extracted entities in left-to-right order
 */
export function extractEntities(
  text: string,
  _intentType: IntentType,
  ctx: WorkbookContext
): Entity[] {
  if (!text || text.trim().length === 0) return []

  // Collect all entity matches
  const allMatches: MatchResult[] = []

  // Extract each entity type
  const operators = extractOperators(text)
  const numbers = extractNumbers(text)
  const columns = extractColumns(text, ctx)
  const sheets = extractSheets(text, ctx)

  // Check for ambiguous references (these override resolved ones)
  const ambiguousColumns = resolveAmbiguousColumns(text, ctx)
  const ambiguousSheets = resolveAmbiguousSheets(text, ctx)

  // Merge: ambiguous entities take precedence over resolved for same positions
  allMatches.push(...operators)
  allMatches.push(...numbers)

  // For columns: use ambiguous results where they overlap with resolved results
  for (const col of columns) {
    const hasAmbiguous = ambiguousColumns.some(
      a => col.startIndex < a.endIndex && col.endIndex > a.startIndex
    )
    if (!hasAmbiguous) {
      allMatches.push(col)
    }
  }
  allMatches.push(...ambiguousColumns)

  // For sheets: use ambiguous results where they overlap with resolved results
  for (const sheet of sheets) {
    const hasAmbiguous = ambiguousSheets.some(
      a => sheet.startIndex < a.endIndex && sheet.endIndex > a.startIndex
    )
    if (!hasAmbiguous) {
      allMatches.push(sheet)
    }
  }
  allMatches.push(...ambiguousSheets)

  // Remove duplicates at same position (keep first found)
  const deduped: MatchResult[] = []
  for (const m of allMatches) {
    const exists = deduped.some(
      d => d.startIndex === m.startIndex && d.endIndex === m.endIndex
    )
    if (!exists) {
      deduped.push(m)
    }
  }

  // Sort by start position (left-to-right ordering)
  deduped.sort((a, b) => a.startIndex - b.startIndex)

  // Return just the entities
  return deduped.map(m => m.entity)
}
