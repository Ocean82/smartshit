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
 * fallback, which cannot be exercised deterministically. These assertions were
 * written to match the OBSERVED behaviour of the current code, and PASS by
 * documenting it — not by changing production code.
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

    // Characterization: NL computed-range requests do not currently route to
    // execute_script via Tier-1/Tier-2; closing this is the prompt-guidance
    // follow-up.
    //
    // The TRUTH (observed from the deterministic router): the "put it in F1"
    // tail wins a set_cell pattern, so the request is mis-served as
    // set_cell F1 = "it". The weighting — indeed the whole computation — is
    // dropped. It is NOT an =AVERAGE, and crucially NOT execute_script.
    expect(wavg.calls.every((c) => c.tool !== 'execute_script')).toBe(true)
    expect(wavg.understood).toBe(true)
    expect(wavg.calls).toHaveLength(1)
    expect(wavg.calls[0]).toMatchObject({
      tool: 'set_cell',
      params: { cell: 'F1', value: 'it' },
    })
  })

  it('a "filter … into a new range" request never routes to execute_script', () => {
    const filt = parseMessage('filter the rows where status is open into a new range', ctx)

    // Characterization: 'filter … into a new range' routes to the declarative
    // 'filter' tool, never to execute_script. The TRUTH (observed): the filter
    // regex is greedy — it swallows the leading "rows where status" into the
    // column group and the trailing "into a new range" into the value group,
    // producing a semantically wrong but deterministic 'filter' call. There is
    // no deterministic path that reaches the sandbox / execute_script.
    expect(filt.calls.every((c) => c.tool !== 'execute_script')).toBe(true)
    expect(filt.understood).toBe(true)
    expect(filt.calls).toHaveLength(1)
    expect(filt.calls[0]).toMatchObject({
      tool: 'filter',
      params: {
        column: 'rows where status',
        condition: 'equals',
        value: 'open into a new range',
      },
    })
  })
})
