/**
 * Macro Planner
 *
 * Decomposes multi-step natural-language commands into ordered action sequences.
 * Detects sequential conjunctions, punctuation, and numbered lists to segment
 * user input into individual clauses, then maps each clause to a recognized
 * intent using the intent classifier and entity extractor.
 *
 * Pure-logic module — no DOM, no Worker APIs.
 */

import type { IntentType } from '@shared/intentTypes'
import type { WorkbookContext, ActionStep, MacroPlan } from './types'
import { classifyIntent } from './intentClassifier'
import { extractEntities } from './entityExtractor'

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default maximum steps returned in a plan */
const DEFAULT_MAX_STEPS = 5

/** Hard maximum steps the planner will ever process */
const HARD_MAX_STEPS = 10

/** Intents that don't map to actionable tools */
const NON_ACTIONABLE_INTENTS: Set<IntentType> = new Set(['unknown', 'chat'])

// ─── Clause Segmentation ────────────────────────────────────────────────────

/**
 * Action verbs that indicate the start of a new command clause.
 * Used to disambiguate commas (only split on comma if followed by an action verb).
 */
const ACTION_VERBS = new Set([
  'filter', 'sort', 'clean', 'remove', 'delete', 'add', 'create', 'make',
  'format', 'highlight', 'color', 'bold', 'italic', 'underline',
  'calculate', 'compute', 'sum', 'total', 'average', 'count',
  'find', 'search', 'locate', 'lookup',
  'export', 'download', 'save', 'convert',
  'compare', 'diff', 'match',
  'summarize', 'analyze', 'examine', 'report',
  'read', 'show', 'display', 'view', 'open',
  'write', 'edit', 'update', 'change', 'modify', 'set',
  'chart', 'graph', 'plot', 'visualize',
])

/**
 * Segment user text into individual action clauses.
 *
 * Splitting strategy:
 * 1. Semicolons always split
 * 2. Periods split (when not part of a number like "500.00")
 * 3. Commas split when followed by an action verb
 * 4. Conjunctions ("and then", "after that", "then", "next", "also") split
 * 5. Numbered lists ("1. ..., 2. ...") split
 * 6. "first...then" pattern splits
 *
 * Returns clauses in order as they appear in the text.
 */
export function segmentClauses(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  // First, handle numbered list patterns: "1. do X 2. do Y 3. do Z"
  const numberedPattern = /(?:^|\s)\d+\.\s/g
  const numberedMatches: number[] = []
  let nMatch: RegExpExecArray | null
  while ((nMatch = numberedPattern.exec(trimmed)) !== null) {
    numberedMatches.push(nMatch.index)
  }

  if (numberedMatches.length >= 2) {
    // Split on numbered list items
    const clauses: string[] = []
    for (let i = 0; i < numberedMatches.length; i++) {
      const start = numberedMatches[i]
      const end = i + 1 < numberedMatches.length ? numberedMatches[i + 1] : trimmed.length
      // Remove the number prefix (e.g., "1. ")
      let clause = trimmed.slice(start, end).replace(/^\s*\d+\.\s*/, '').trim()
      if (clause) clauses.push(clause)
    }
    return clauses.filter(c => c.length > 0)
  }

  // Split on semicolons
  let segments = [trimmed]
  segments = splitOnDelimiter(segments, /\s*;\s*/)

  // Split on periods that are not part of numbers (e.g., not "500.00")
  segments = splitOnNonNumericPeriods(segments)

  // Split on conjunctions
  segments = splitOnConjunctions(segments)

  // Split on commas followed by action verbs
  segments = splitOnActionCommas(segments)

  // Clean up and filter empty clauses
  return segments
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

/**
 * Split segments on a simple delimiter pattern.
 */
function splitOnDelimiter(segments: string[], delimiter: RegExp): string[] {
  const result: string[] = []
  for (const seg of segments) {
    result.push(...seg.split(delimiter))
  }
  return result
}

/**
 * Split on periods that are sentence-ending (not part of decimal numbers).
 */
function splitOnNonNumericPeriods(segments: string[]): string[] {
  const result: string[] = []
  for (const seg of segments) {
    // Split on period followed by a space and a letter (sentence boundary)
    // but not on period between digits (e.g., "500.00")
    const parts = seg.split(/\.(?=\s+[A-Za-z])/)
    result.push(...parts)
  }
  return result
}

/**
 * Split on conjunction patterns that separate actions.
 */
function splitOnConjunctions(segments: string[]): string[] {
  const result: string[] = []

  for (const seg of segments) {
    let current = seg
    let didSplit = false

    // Try "first...then" pattern
    const firstThenMatch = current.match(/\bfirst\b\s+(.*?)\s+\bthen\b\s+(.*)/i)
    if (firstThenMatch && firstThenMatch[1] && firstThenMatch[2]) {
      result.push(firstThenMatch[1].trim())
      result.push(firstThenMatch[2].trim())
      didSplit = true
      current = ''
    }

    // Split on "after that", "and then" (longer patterns first)
    if (current) {
      const longConjunctions = [/\bafter that\b/i, /\band then\b/i]
      for (const conj of longConjunctions) {
        const parts = current.split(conj)
        if (parts.length > 1) {
          for (const part of parts) {
            const trimmedPart = part.trim()
            if (trimmedPart) result.push(trimmedPart)
          }
          didSplit = true
          current = ''
          break
        }
      }
    }

    if (current && !didSplit) {
      // Split on "then", "next", "also" but only as sentence connectors
      const shortConjunctions = [
        /,\s*\bthen\b\s*/i,
        /,\s*\bnext\b\s*/i,
        /,\s*\balso\b\s*/i,
        /\bthen\b\s*/i,
        /\bnext\b\s*/i,
        /\balso\b\s*/i,
      ]

      for (const conj of shortConjunctions) {
        const parts = current.split(conj)
        if (parts.length > 1) {
          for (const part of parts) {
            const trimmedPart = part.trim()
            if (trimmedPart) result.push(trimmedPart)
          }
          didSplit = true
          current = ''
          break
        }
      }
    }

    if (current && !didSplit) {
      // Handle "and" between action verbs
      // Only split on "and" if what follows starts with an action verb
      const andParts = current.split(/\band\b/i)
      if (andParts.length > 1) {
        const validParts: string[] = []
        let accumulator = andParts[0].trim()

        for (let i = 1; i < andParts.length; i++) {
          const part = andParts[i].trim()
          const firstWord = part.split(/\s+/)[0]?.toLowerCase()
          if (firstWord && ACTION_VERBS.has(firstWord)) {
            // This "and" separates actions
            if (accumulator) validParts.push(accumulator)
            accumulator = part
          } else {
            // This "and" is part of the same clause (e.g., "column A and column B")
            accumulator += ' and ' + part
          }
        }
        if (accumulator) validParts.push(accumulator)

        if (validParts.length > 1) {
          result.push(...validParts)
          didSplit = true
          current = ''
        }
      }
    }

    if (current && !didSplit) {
      result.push(current)
    }
  }

  return result
}

/**
 * Split on commas when followed by an action verb.
 */
function splitOnActionCommas(segments: string[]): string[] {
  const result: string[] = []

  for (const seg of segments) {
    const commaParts = seg.split(/,\s*/)
    if (commaParts.length <= 1) {
      result.push(seg)
      continue
    }

    const merged: string[] = []
    let accumulator = commaParts[0]

    for (let i = 1; i < commaParts.length; i++) {
      const part = commaParts[i]
      const firstWord = part.split(/\s+/)[0]?.toLowerCase()
      if (firstWord && ACTION_VERBS.has(firstWord)) {
        // Comma before action verb → split
        if (accumulator.trim()) merged.push(accumulator.trim())
        accumulator = part
      } else {
        // Comma is part of a list within the same clause
        accumulator += ', ' + part
      }
    }
    if (accumulator.trim()) merged.push(accumulator.trim())

    result.push(...merged)
  }

  return result
}

// ─── Description Generation ─────────────────────────────────────────────────

/**
 * Generate a human-readable description for an action step.
 * Description must be 10-120 characters.
 */
function generateDescription(clauseText: string, intentType: IntentType): string {
  // Capitalize first letter and clean up
  let desc = clauseText.trim()

  // Remove leading conjunctions/connectors left over
  desc = desc.replace(/^(?:and|then|also|next|after that)\s+/i, '')

  // Capitalize first letter
  desc = desc.charAt(0).toUpperCase() + desc.slice(1)

  // Truncate to 120 chars
  if (desc.length > 120) {
    desc = desc.slice(0, 117) + '...'
  }

  // Pad to minimum 10 chars if too short
  if (desc.length < 10) {
    desc = `${desc} (${intentType})`
    if (desc.length < 10) {
      desc = desc.padEnd(10, ' ')
    }
  }

  return desc
}

// ─── Entity to Params Mapping ───────────────────────────────────────────────

/**
 * Convert extracted entities into a params record for the ActionStep.
 */
function entitiesToParams(
  entities: ReturnType<typeof extractEntities>
): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  const columns: string[] = []
  const numbers: number[] = []
  const operators: string[] = []
  let sheet: string | undefined

  for (const entity of entities) {
    if (!entity.resolved) continue
    const resolved = entity as { type: string; value: string | number }

    switch (entity.type) {
      case 'column':
        columns.push(resolved.value as string)
        break
      case 'number':
        numbers.push(resolved.value as number)
        break
      case 'operator':
        operators.push(resolved.value as string)
        break
      case 'sheet':
        sheet = resolved.value as string
        break
    }
  }

  if (columns.length > 0) params.columns = columns
  if (numbers.length > 0) params.values = numbers
  if (operators.length > 0) params.operators = operators
  if (sheet) params.sheet = sheet

  return params
}

// ─── Main Export ────────────────────────────────────────────────────────────

/**
 * Decompose a multi-step natural-language command into an ordered MacroPlan.
 *
 * Algorithm:
 * 1. Segment the input text into clauses
 * 2. Classify each clause using the intent classifier
 * 3. Extract entities from each clause
 * 4. If any clause maps to an unrecognized intent → treat as single-step
 * 5. Apply step limits (max 5 default, hard max 10)
 * 6. Return MacroPlan with ordered steps
 *
 * @param text - User input text
 * @param ctx - Active workbook context for entity resolution
 * @param intentVocabulary - List of valid intent types to match against
 * @returns MacroPlan with ordered action steps
 */
export function planMacro(
  text: string,
  ctx: WorkbookContext,
  intentVocabulary: IntentType[]
): MacroPlan {
  const trimmed = text.trim()

  // Empty input → empty plan
  if (!trimmed) {
    return {
      steps: [],
      originalText: text,
      truncated: false,
    }
  }

  // Build a set of actionable intents from the vocabulary (excluding unknown/chat)
  const actionableIntents = new Set(
    intentVocabulary.filter(i => !NON_ACTIONABLE_INTENTS.has(i))
  )

  // Step 1: Segment into clauses
  const clauses = segmentClauses(trimmed)

  // If segmentation produced 0 or 1 clauses, it's not multi-step
  if (clauses.length <= 1) {
    // Single clause: classify and return as single step if actionable
    if (clauses.length === 1) {
      const classification = classifyIntent(clauses[0], ctx)
      if (actionableIntents.has(classification.intentType)) {
        const entities = extractEntities(clauses[0], classification.intentType, ctx)
        const params = entitiesToParams(entities)
        const description = generateDescription(clauses[0], classification.intentType)
        return {
          steps: [{
            tool: classification.intentType,
            params,
            description,
          }],
          originalText: text,
          truncated: false,
        }
      }
    }
    // Not actionable or empty → empty plan for caller to handle via standard flow
    return {
      steps: [],
      originalText: text,
      truncated: false,
    }
  }

  // Step 2-3: Classify and extract entities for each clause
  const steps: ActionStep[] = []

  // Limit to hard max for processing
  const clausesToProcess = clauses.slice(0, HARD_MAX_STEPS)

  for (const clause of clausesToProcess) {
    const classification = classifyIntent(clause, ctx)

    // Step 4: If any clause can't map to a recognized actionable intent → treat as single-step
    if (!actionableIntents.has(classification.intentType)) {
      return {
        steps: [],
        originalText: text,
        truncated: false,
      }
    }

    const entities = extractEntities(clause, classification.intentType, ctx)
    const params = entitiesToParams(entities)
    const description = generateDescription(clause, classification.intentType)

    steps.push({
      tool: classification.intentType,
      params,
      description,
    })
  }

  // Step 5: Apply truncation limits
  const totalDetected = clauses.length
  const truncated = totalDetected > DEFAULT_MAX_STEPS
  const truncatedSteps = steps.slice(0, DEFAULT_MAX_STEPS)
  const truncatedCount = truncated ? totalDetected - DEFAULT_MAX_STEPS : undefined

  return {
    steps: truncatedSteps,
    originalText: text,
    truncated,
    truncatedCount,
  }
}
