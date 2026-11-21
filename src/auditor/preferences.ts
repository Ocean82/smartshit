/**
 * Spreadsheet Auditor — user preferences (localStorage).
 *
 * - On/off switch for the whole auditor.
 * - Per-workbook dismissed findings. Each finding is dismissed on its own; a
 *   dismissal lapses automatically when any of its cells is edited.
 */

import type { DismissedFindingEntry } from './types'

const ENABLED_KEY = 'smartsht-auditor-enabled'
const DISMISSED_KEY_PREFIX = 'smartsht-audit-dismissed:'

/** The auditor is on unless the user turned it off. */
export function isAuditorEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== '0'
  } catch {
    return true
  }
}

export function saveAuditorEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0')
  } catch {
    // storage unavailable — the choice lasts for this session only
  }
}

function isValidEntry(e: unknown): e is DismissedFindingEntry {
  if (typeof e !== 'object' || e === null) return false
  const entry = e as Record<string, unknown>
  return (
    Array.isArray(entry.cellIds) &&
    entry.cellIds.every((id) => typeof id === 'string') &&
    typeof entry.dismissedAt === 'number' &&
    (entry.valueSnapshot === undefined || (typeof entry.valueSnapshot === 'object' && entry.valueSnapshot !== null))
  )
}

/** Dismissed findings for a workbook, keyed by `findingKey`. */
export function loadDismissed(workbookId: string): Record<string, DismissedFindingEntry> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY_PREFIX + workbookId)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const out: Record<string, DismissedFindingEntry> = {}
    for (const [key, entry] of Object.entries(parsed)) {
      if (isValidEntry(entry)) out[key] = entry
    }
    return out
  } catch {
    return {}
  }
}

export function saveDismissed(workbookId: string, dismissed: Record<string, DismissedFindingEntry>): void {
  try {
    const key = DISMISSED_KEY_PREFIX + workbookId
    if (Object.keys(dismissed).length === 0) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(dismissed))
  } catch {
    // storage unavailable — dismissals last for this session only
  }
}
