/**
 * First-session prompt corpus, server path.
 *
 * Runs the real `resolveIntent` (mode gate, then act templates). The server
 * returns these actions without calling the LLM, so a wrong guess here reaches
 * the user's sheet. Table lives in shared/firstSessionCorpus.ts.
 */
import { describe, expect, it } from 'vitest'
import { resolveIntent } from './intent.js'
import { FIRST_SESSION_CORPUS, STYLING_VERB_PROMPTS } from '../../shared/firstSessionCorpus.js'

describe('first-session corpus: server (mode gate + act templates)', () => {
  for (const c of FIRST_SESSION_CORPUS) {
    const want = c.server
    if (!want) continue
    it(`${want.kind === 'defer' ? 'defers' : `→ ${want.tool}`}: "${c.prompt}"`, () => {
      const { actions } = resolveIntent(c.prompt)
      if (want.kind === 'defer') {
        expect(actions.map((a) => `${a.tool} ${JSON.stringify(a.params)}`)).toEqual([])
        return
      }
      expect(actions[0]?.tool).toBe(want.tool)
      if (want.params) expect(actions[0].params).toMatchObject(want.params)
    })
  }

  it('a prompt that opens with a styling verb never writes formulas, builds templates, or wipes the sheet', () => {
    expect(STYLING_VERB_PROMPTS.length).toBeGreaterThan(20)
    for (const prompt of STYLING_VERB_PROMPTS) {
      for (const a of resolveIntent(prompt).actions) {
        expect(a.tool, prompt).not.toBe('apply_formula')
        expect(a.tool, prompt).not.toBe('clear_sheet')
        expect(a.tool, prompt).not.toMatch(/^create_/)
      }
    }
  })

  it('every format_cells action is scoped (range or condition) unless the prompt names no target', () => {
    // Prompts the corpus pins as "no target named, applies to the selection".
    const selectionOnly = new Set(
      FIRST_SESSION_CORPUS.filter(
        (c) => c.server?.kind === 'tool' && c.server.tool === 'format_cells' && !c.server.params?.range && !c.server.params?.condition,
      ).map((c) => c.prompt),
    )
    for (const c of FIRST_SESSION_CORPUS) {
      for (const a of resolveIntent(c.prompt).actions) {
        if (a.tool !== 'format_cells') continue
        const p = a.params as Record<string, unknown>
        const scoped = p.range !== undefined || p.condition !== undefined
        expect(scoped || selectionOnly.has(c.prompt), `unscoped format_cells for "${c.prompt}"`).toBe(true)
      }
    }
  })
})
