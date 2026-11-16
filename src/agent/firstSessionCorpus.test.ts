/**
 * First-session prompt corpus, client regex parser.
 *
 * Table lives in shared/firstSessionCorpus.ts. The parser runs before the
 * server and may auto-apply low-risk edits, so it must claim only what it can
 * scope, and defer the rest.
 */
import { describe, expect, it } from 'vitest'
import { parseMessage, type SheetContext } from './parser'
import { FIRST_SESSION_CORPUS } from '@shared/firstSessionCorpus'

const ctx: SheetContext = {
  headerRow: 0,
  lastDataRow: 20,
  lastDataCol: 3,
  headers: ['Date', 'Category', 'Amount', 'Notes'],
}

describe('first-session corpus: client parser', () => {
  for (const c of FIRST_SESSION_CORPUS) {
    const want = c.client
    if (!want) continue
    it(`${want.kind === 'defer' ? 'defers' : `→ ${want.tool}`}: "${c.prompt}"`, () => {
      const result = parseMessage(c.prompt, ctx)
      if (want.kind === 'defer') {
        const claimed = result.calls.map((call) => `${call.tool} ${JSON.stringify(call.params)}`)
        expect(claimed).toEqual([])
        return
      }
      expect(result.understood).toBe(true)
      expect(result.calls[0]?.tool).toBe(want.tool)
      if (want.params) expect(result.calls[0].params).toMatchObject(want.params)
    })
  }
})
