import type { ColumnProfile, ColumnRole, SheetProfile } from '@/ai/types'
import { letterToCol } from '@/lib/cellRef'
import { explainGoal } from './explain'
import { getGoalDef } from './registry'
import type { GoalDef, GoalId, GoalMatch, GoalOutput, GoalSlots, MatchGoalInput } from './types'

const NOT_COLUMNS = new Set([
  'vs', 'of', 'to', 'in', 'on', 'at', 'by', 'or', 'an', 'do', 'is', 'it',
  'up', 'if', 'so', 'no', 'my', 'me', 'we', 'the', 'for', 'and', 'sum',
])

const EDUCATIONAL_RE = /\b(?:explain|compare|versus|difference\s+between)\b|\bvs\b/i
const TEMPLATE_RE = /\b(?:template|tracker|roster|invoice|budget)\b/i

export function matchGoal(input: MatchGoalInput): GoalMatch {
  const utterance = input.utterance?.trim() ?? ''
  const profile = input.profile ?? null

  if (
    utterance
    && EDUCATIONAL_RE.test(utterance)
    && !TEMPLATE_RE.test(utterance)
    && !/\b(?:sum|add up)\s+(?:column\s+)?[a-z]{1,3}\b/i.test(utterance)
  ) {
    return unmatched()
  }

  const goalId = inferGoalId(utterance)
  if (!goalId && utterance) return unmatched()

  const def = goalId ? getGoalDef(goalId) : null
  if (!def) return unmatched()

  const slots = resolveSlots(def, profile, utterance, input.selection ?? null)
  const output = pickOutput(def, utterance)

  for (const role of def.requiredRoles) {
    if (slotForRole(slots, role)) continue
    const candidates = (profile?.columns ?? []).filter((col) => col.role === role && col.nonNullCount > 0)
    if (candidates.length > 1) {
      const names = candidates.map((col) => `${col.name} (${col.column})`).join(', ')
      return {
        status: 'ambiguous',
        goal: def,
        slots,
        output,
        explain: explainGoal(def, slots, output),
        question: `There are multiple ${role} columns: ${names}. Which should I use?`,
        chips: candidates.map((col) => ambiguousChip(def.id, col.column, col.name)),
      }
    }
    return {
      status: 'unmatched',
      goal: def,
      slots,
      explain: `I need a ${role} column to run ${def.title}.`,
    }
  }

  return {
    status: 'matched',
    goal: def,
    slots,
    output,
    explain: explainGoal(def, slots, output),
  }
}

function unmatched(): GoalMatch {
  return { status: 'unmatched', slots: {}, explain: '' }
}

function ambiguousChip(goalId: GoalId, column: string, name: string): string {
  if (goalId === 'total') return `sum column ${column}`
  if (goalId === 'by_category') return `spending by category using ${name}`
  return `totals by month using ${name}`
}

function inferGoalId(utterance: string): GoalId | null {
  if (!utterance) return null
  const lower = utterance.toLowerCase()

  if (TEMPLATE_RE.test(lower) && /\b(?:create|build|make|new)\b/.test(lower)) return null

  if (
    /\bby\s+month\b/.test(lower)
    || /\bmonthly\s+(?:spend|spending|sales|revenue|total|totals|trend)\b/.test(lower)
    || /\btotals?\s+by\s+month\b/.test(lower)
  ) {
    return 'by_month'
  }

  if (
    /\bby\s+(?:category|product|type|employee)\b/.test(lower)
    || /\b(?:spend(?:ing)?|revenue|hours|totals?)\s+by\b/.test(lower)
    || /\bgroup(?:ed)?\s+(?:totals?\s+)?by\b/.test(lower)
    || /\bbreak\s+down\b/.test(lower)
  ) {
    return 'by_category'
  }

  if (
    /\b(?:sum|add up)\b/.test(lower)
    || /^(?:total|totals)$/.test(lower)
    || /\btotal(?:s)?\s+(?:of\s+)?(?:column\s+)/.test(lower)
    || /\btotal(?:s)?\s+(?:spending|spend|revenue|sales|hours|amount)\b/.test(lower)
  ) {
    return 'total'
  }

  return null
}

function pickOutput(def: GoalDef, utterance: string): GoalOutput {
  const lower = utterance.toLowerCase()
  if (/\b(?:chart|graph|trend|plot)\b/.test(lower) && def.outputs.includes('chart')) return 'chart'
  if (/\bformula\b/.test(lower) && def.outputs.includes('formula')) return 'formula'
  if (
    def.outputs.includes('summary')
    && (/[?]/.test(utterance) || /\b(?:how much|what is|what's)\b/.test(lower))
    && !/\bformula\b/.test(lower)
    && !/\b(?:add|insert|put|write)\b/.test(lower)
  ) {
    return 'summary'
  }
  return def.defaultOutput
}

function resolveSlots(
  def: GoalDef,
  profile: SheetProfile | null,
  utterance: string,
  selection: MatchGoalInput['selection'],
): GoalSlots {
  const slots: GoalSlots = {}
  const columns = profile?.columns ?? []

  const mentioned = columns.filter((col) => columnMentioned(utterance, col))
  const explicitLetter = extractColumnLetter(utterance)

  for (const role of [...def.requiredRoles, ...def.optionalRoles]) {
    const key = slotKey(role)
    if (!key) continue

    const mentionedForRole = mentioned.filter((col) => col.role === role)
    if (mentionedForRole.length === 1) {
      slots[key] = mentionedForRole[0].column
      continue
    }

    if (role === 'amount' && explicitLetter) {
      slots[key] = explicitLetter
      continue
    }

    const selected = columnFromSelection(selection, columns, role)
    if (selected) {
      slots[key] = selected
      continue
    }

    const unique = uniqueRoleColumn(columns, role)
    if (unique) slots[key] = unique.column
  }

  const categoryMention = utterance.match(/\b(?:for|where|equals?|is)\s+([a-z][a-z0-9 _-]{1,40})$/i)
  if (categoryMention && def.id === 'by_category') {
    slots.categoryValue = categoryMention[1].trim()
  }

  return slots
}

function uniqueRoleColumn(columns: ColumnProfile[], role: ColumnRole): ColumnProfile | undefined {
  const matches = columns.filter((col) => col.role === role && col.nonNullCount > 0)
  return matches.length === 1 ? matches[0] : undefined
}

function columnFromSelection(
  selection: MatchGoalInput['selection'],
  columns: ColumnProfile[],
  role: ColumnRole,
): string | undefined {
  if (!selection) return undefined
  if (selection.startCol !== selection.endCol) return undefined
  const letter = columns.find((col) => (
    letterToCol(col.column) === selection.startCol && col.role === role
  ))
  return letter?.column
}

function columnMentioned(utterance: string, column: ColumnProfile | undefined): boolean {
  if (!utterance || !column) return false
  const lower = utterance.toLowerCase()
  const header = column.name.trim().toLowerCase()
  if (header && header.length >= 2 && new RegExp(`\\b${escapeRegex(header)}\\b`, 'i').test(lower)) return true
  return new RegExp(`\\bcolumn\\s+${escapeRegex(column.column)}\\b`, 'i').test(utterance)
}

function extractColumnLetter(utterance: string): string | undefined {
  const match = utterance.match(/\bcolumn\s+([a-z]{1,3})\b/i)
  if (!match) return undefined
  const letter = match[1].toUpperCase()
  if (NOT_COLUMNS.has(letter.toLowerCase())) return undefined
  return letter
}

function slotForRole(slots: GoalSlots, role: ColumnRole): string | undefined {
  const key = slotKey(role)
  return key ? slots[key] : undefined
}

function slotKey(role: ColumnRole): keyof GoalSlots | null {
  if (role === 'amount') return 'amountColumn'
  if (role === 'category') return 'categoryColumn'
  if (role === 'date') return 'dateColumn'
  return null
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function rolesSatisfied(def: GoalDef, profile: SheetProfile): boolean {
  return def.requiredRoles.every((role) => uniqueRoleColumn(profile.columns, role))
}

