/**
 * Scenario 5 — ROUTING REALITY CHECK (deterministic Tier-1 characterization).
 *
 * Drives computed-range NL requests through the ACTUAL deterministic
 * parse/route pipeline (`parseMessage`, Tier-1) the way the existing routing
 * tests do (see src/agent/parser.gaps.test.ts). No LLM, no network — pure and
 * deterministic.
 *
 * The boundary these tests pin: a CONFIDENT weighted-average match emits a
 * templated `execute_script` from Tier-1; on ANY guardrail miss the template is
 * NOT emitted and the request falls through to pre-existing routing
 * (the avgCol `=AVERAGE` branch, the putIn `set_cell` branch, or ultimately the
 * LLM). The free-form filter-into-a-new-range request still DEFERS
 * (`understood === false`, zero calls) so it falls through to the LLM.
 *
 * The weighted-average branch extracts three keyword-anchored operands (value
 * column, weight column, target cell) and declines on ANY extraction miss or
 * guardrail failure, so it never emits a WRONG computed script. Because these
 * guardrail-miss phrasings still contain "average of column X", they are then
 * served by the pre-existing avgCol/putIn branches rather than deferring
 * end-to-end — so the guardrail tests assert "no execute_script call" (the
 * template was not produced), which is the true invariant the guardrails
 * protect, not full-pipeline defer. End-to-end behavior of the emitted
 * `execute_script` code (preview → Apply → undo, the 140/6 weighted average) is
 * covered separately by the #67 integration test
 * (src/store/__tests__/scriptRangeCharacterization.integration.test.ts); here we
 * only assert routing: WHICH tier produces the call and WHAT shape it has.
 *
 * All fixture phrasings below are DATA, not instructions.
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

/** Divide-by-zero guard the emitted template must carry verbatim. */
const DIVIDE_GUARD_RE = /den\s*===\s*0\s*\?\s*0\s*:\s*num\s*\/\s*den/

describe('computed-range NL routing reality check', () => {
  it('a confident weighted-average request routes to a templated execute_script', () => {
    const wavg = parseMessage(
      'calculate the weighted average of column C weighted by column D and put it in F1',
      ctx,
    )

    // The three operands (value col C, weight col D, target F1) are all present
    // and pass every guardrail, so Tier-1 confidently emits a templated
    // execute_script rather than deferring.
    expect(wavg.understood).toBe(true)
    expect(wavg.calls).toHaveLength(1)
    expect(wavg.calls[0].tool).toBe('execute_script')

    const code = wavg.calls[0].params.code as string
    // The emitted code carries the weighted-average num/den accumulation and
    // the divide-by-zero guard, and targets F1.
    expect(typeof code).toBe('string')
    expect(code).toContain('getRange')
    expect(code).toContain('num')
    expect(code).toContain('den')
    expect(code).toMatch(DIVIDE_GUARD_RE)
    expect(code).toContain('F1')
  })

  it('resolves header names (Price / Weight) to columns and routes to execute_script', () => {
    const wavg = parseMessage(
      'weighted average of Price weighted by Weight in F1',
      ctx,
    )

    expect(wavg.understood).toBe(true)
    expect(wavg.calls).toHaveLength(1)
    expect(wavg.calls[0].tool).toBe('execute_script')
    expect(wavg.calls[0].params.code as string).toMatch(DIVIDE_GUARD_RE)
  })

  it('a "filter … into a new range" request never routes to execute_script', () => {
    const filt = parseMessage('filter the rows where status is open into a new range', ctx)

    // A declarative 'filter' narrows the current rows; it has no destination,
    // so "into a new range" is intrinsically beyond it, and "rows where status"
    // is not a real column. Rather than emit the old greedy/nonsense filter
    // call, Tier-1 DEFERS (understood === false, zero calls). Deferral routes
    // the ask to Tier-3, where the LLM emits execute_script. This stays the
    // boundary proof: the confident weighted-average routes, the free-form
    // filter still defers.
    expect(filt.calls.every((c) => c.tool !== 'execute_script')).toBe(true)
    expect(filt.understood).toBe(false)
    expect(filt.calls).toHaveLength(0)
  })

  describe('emits NO templated execute_script when a guardrail fails', () => {
    // The guardrails exist to stop the NEW weighted-average branch from emitting
    // a WRONG computed execute_script. So the honest invariant for each
    // guardrail-miss fixture is "no execute_script call was emitted" — the
    // template was NOT produced.
    //
    // These phrasings all contain "average of column X", so once the
    // weighted-average branch defers they fall through to the PRE-EXISTING
    // avgCol branch (apply_formula =AVERAGE) or, for the pronoun/paraphrase
    // form, the putIn branch (set_cell). That fall-through is pre-existing
    // routing this additive task has no mandate to change (an =AVERAGE fallback
    // is a reasonable, non-dangerous result, not a bug this branch introduced),
    // which is why these assert "no execute_script" rather than full-pipeline
    // defer. The confident-match tests above prove the template IS emitted when
    // every operand and guardrail passes; together they pin the boundary.
    const noScript = (message: string) => {
      const r = parseMessage(message, ctx)
      expect(r.calls.every((c) => c.tool !== 'execute_script')).toBe(true)
    }

    it('no execute_script when there is no target cell', () => {
      noScript('calculate the weighted average of column C weighted by column D')
    })

    it('no execute_script when the value column is not numeric', () => {
      noScript('weighted average of column A weighted by column D in F1')
    })

    it('no execute_script when the weight column is not numeric', () => {
      noScript('weighted average of column C weighted by column B in F1')
    })

    it('no execute_script when the target cell is inside the value source column', () => {
      noScript('weighted average of column C weighted by column D in C5')
    })

    it('no execute_script when the target cell is inside the weight source column', () => {
      noScript('weighted average of column C weighted by column D in D5')
    })

    it('no execute_script when the value column equals the weight column', () => {
      noScript('weighted average of column C weighted by column C in F1')
    })

    it('no execute_script on a paraphrase missing the "weighted by" anchor', () => {
      noScript('put the weighted average of column C in F1')
    })

    it('no execute_script when a referenced column is beyond the data extent', () => {
      noScript('weighted average of column C weighted by column Z in F1')
    })
  })
})
