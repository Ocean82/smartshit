/**
 * Scenario 5 — ROUTING REALITY CHECK (deterministic Tier-1 characterization).
 *
 * Drives the two computed-range NL requests through the ACTUAL deterministic
 * parse/route pipeline (`parseMessage`, Tier-1) the way the existing routing
 * tests do (see src/agent/parser.gaps.test.ts). No LLM, no network — pure and
 * deterministic.
 *
 * The invariant that is the POINT of this test: no deterministic branch emits
 * `execute_script`. `execute_script` is only reachable via the Tier-3 (LLM)
 * fallback, which cannot be exercised deterministically.
 *
 * These two assertions now verify the FIX: Tier-1 cannot faithfully represent a
 * computed/aggregate-into-a-cell or a filter-into-a-new-range request, so it
 * DEFERS (`understood === false`, zero calls) instead of emitting a wrong
 * declarative call. Deferral lets the request fall through to Tier-3, where the
 * LLM emits `execute_script` (the prompt guidance in server/src/prompt.ts). They
 * previously documented the mis-serve bug; they now assert defer-to-LLM.
 */

import { describe, expect, it } from 'vitest'
import { parseMessage, type SheetContext } from '../parser'
import type { ColumnProfile } from '@/ai/types'

function column(
  name: string,
  letter: string,
  dtype: 'number' | 'text',
  role: ColumnProfile['role'],
  samples: Array<string | number> = [],
): ColumnProfile {
  return {
    name,
    column: letter,
    dtype,
    role,
    nonNullCount: 4,
    nullCount: 0,
    uniqueCount: 4,
    sampleValues: samples,
  }
}

function context(columns: ColumnProfile[]): SheetContext {
  return {
    headerRow: 0,
    lastDataRow: 4,
    lastDataCol: columns.length - 1,
    headers: columns.map((item) => item.name),
    columns,
  }
}

const ctx = context([
  column('Name', 'A', 'text', 'category', ['Task1', 'Task2']),
  column('Status', 'B', 'text', 'label', ['open', 'closed']),
  column('Price', 'C', 'number', 'amount', [10, 20]),
  column('Weight', 'D', 'number', 'quantity', [1, 2]),
])

describe('computed-range NL routing reality check', () => {
  it('a weighted-average request never routes to execute_script', () => {
    const wavg = parseMessage(
      'calculate the weighted average of column C weighted by column D and put it in F1',
      ctx,
    )

    // Tier-1 cannot faithfully represent "weighted average of C weighted by D"
    // destined for a cell — the pronoun "it" is the only thing the set_cell
    // regex could capture, and that would drop the whole computation. So Tier-1
    // now DEFERS (understood === false, zero calls) instead of mis-serving it as
    // set_cell F1 = "it". Deferral routes the ask to Tier-3, where the LLM emits
    // execute_script. Tier-1 itself still never emits execute_script directly.
    expect(wavg.calls.every((c) => c.tool !== 'execute_script')).toBe(true)
    expect(wavg.understood).toBe(false)
    expect(wavg.calls).toHaveLength(0)
  })

  it('a "filter … into a new range" request never routes to execute_script', () => {
    const filt = parseMessage('filter the rows where status is open into a new range', ctx)

    // A declarative 'filter' narrows the current rows; it has no destination,
    // so "into a new range" is intrinsically beyond it, and "rows where status"
    // is not a real column. Rather than emit the old greedy/nonsense filter
    // call, Tier-1 now DEFERS (understood === false, zero calls). Deferral
    // routes the ask to Tier-3, where the LLM emits execute_script. Tier-1
    // itself still never emits execute_script directly.
    expect(filt.calls.every((c) => c.tool !== 'execute_script')).toBe(true)
    expect(filt.understood).toBe(false)
    expect(filt.calls).toHaveLength(0)
  })
})
