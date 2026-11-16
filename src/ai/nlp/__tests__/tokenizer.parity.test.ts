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
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { WordPieceTokenizer, type TokenizerJsonFormat } from '../tokenizer'
import golden from './tokenizer.golden.json'

// The model's tokenizer.json is gitignored and downloaded at deploy, so CI uses
// its vocabulary, committed as minilm-vocab.txt by the generator. The generator
// checks the json's settings equal the vocab.txt defaults.
const tokenizer = new WordPieceTokenizer()
tokenizer.loadFromVocabTxt(readFileSync(join(__dirname, 'minilm-vocab.txt'), 'utf8'))

/** Where the deployed tokenizer.json is present (a dev machine), check the production loading path too. */
const DEPLOYED_JSON = join(__dirname, '../../../../public/models/minilm/tokenizer.json')
const jsonTokenizer = existsSync(DEPLOYED_JSON) ? new WordPieceTokenizer() : null
jsonTokenizer?.loadFromTokenizerJson(JSON.parse(readFileSync(DEPLOYED_JSON, 'utf8')) as TokenizerJsonFormat)

/** Ids up to and including [SEP], i.e. without the padding. */
function realIds(text: string, t: WordPieceTokenizer = tokenizer): number[] {
  const { inputIds, attentionMask } = t.encode(text)
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

  it.skipIf(!jsonTokenizer)('the tokenizer.json loading path gives the same ids (dev machines only)', () => {
    for (const [text, ids] of cases) expect(realIds(text, jsonTokenizer!), text).toEqual(ids)
  })
})
