/**
 * Browser WordPiece tokenizer vs Hugging Face `tokenizers`.
 *
 * tokenizer.golden.json holds the ids Hugging Face produces from the same
 * public/models/minilm/tokenizer.json for 365 strings: every capability and
 * intent phrase the model embeds, the first-session prompts, and edge cases
 * (accents, Unicode spaces, invisible characters, punctuation vs symbols,
 * CJK, emoji, long words, truncation). Regenerate with
 * `node scripts/gen-tokenizer-golden.mjs`.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { WordPieceTokenizer, type TokenizerJsonFormat } from '../tokenizer'
import golden from './tokenizer.golden.json'

const tokenizerJson = JSON.parse(
  readFileSync(join(__dirname, '../../../../public/models/minilm/tokenizer.json'), 'utf8'),
) as TokenizerJsonFormat

const tokenizer = new WordPieceTokenizer()
tokenizer.loadFromTokenizerJson(tokenizerJson)

/** Ids up to and including [SEP], i.e. without the padding. */
function realIds(text: string): number[] {
  const { inputIds, attentionMask } = tokenizer.encode(text)
  const ids: number[] = []
  for (let i = 0; i < inputIds.length && attentionMask[i] === 1n; i++) ids.push(Number(inputIds[i]))
  return ids
}

describe('WordPiece tokenizer matches Hugging Face', () => {
  const cases = golden.cases as Array<[string, number[]]>

  it('covers a few hundred strings', () => {
    expect(cases.length).toBeGreaterThan(300)
  })

  it.each(cases.map(([text, ids], i) => [i, JSON.stringify(text).slice(0, 60), text, ids] as const))(
    '#%i %s',
    (_i, _label, text, ids) => {
      expect(realIds(text)).toEqual(ids)
    },
  )
})
