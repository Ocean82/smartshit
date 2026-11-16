import { describe, expect, it } from 'vitest'
import { WordPieceTokenizer } from '../tokenizer'

/** A vocabulary that does NOT use bert-base-uncased's 101/102/100/0 numbering. */
const vocabJson = {
  model: {
    vocab: { '[PAD]': 7, '[UNK]': 3, '[CLS]': 1, '[SEP]': 2, hello: 10, world: 11, '##s': 12 },
    unk_token: '[UNK]',
  },
  padding: { pad_id: 7 },
}

function ids(t: WordPieceTokenizer, text: string): number[] {
  return [...t.encode(text).inputIds].map(Number)
}

describe('WordPieceTokenizer setup', () => {
  it('reads special-token ids from the vocabulary', () => {
    const t = new WordPieceTokenizer({ maxLength: 6 })
    t.loadFromTokenizerJson(vocabJson)
    // [CLS] hello worlds?→[UNK] [SEP] [PAD]
    expect(ids(t, 'hello worlds xyz')).toEqual([1, 10, 11, 12, 3, 2])
    expect(ids(t, 'hello')).toEqual([1, 10, 2, 7, 7, 7])
  })

  it('rejects a vocabulary without [CLS], [SEP] or [UNK] instead of guessing ids', () => {
    const t = new WordPieceTokenizer()
    expect(() => t.loadFromTokenizerJson({ model: { vocab: { hello: 1 } } })).toThrow(/missing special token/)
    expect(() => t.loadFromVocabTxt('[PAD]\n[CLS]\n[SEP]\nhello')).toThrow(/\[UNK\]/)
  })

  it('rejects a max length that cannot hold [CLS] and [SEP]', () => {
    expect(() => new WordPieceTokenizer({ maxLength: 1 })).toThrow(RangeError)
    expect(() => new WordPieceTokenizer({ maxLength: 2.5 })).toThrow(RangeError)
    expect(() => new WordPieceTokenizer({ maxLength: 2 })).not.toThrow()
  })

  it('truncates to [CLS] + (maxLength - 2) tokens + [SEP]', () => {
    const t = new WordPieceTokenizer({ maxLength: 4 })
    t.loadFromTokenizerJson(vocabJson)
    expect(ids(t, 'hello world hello world')).toEqual([1, 10, 11, 2])
    expect([...t.encode('hello world hello').attentionMask].map(Number)).toEqual([1, 1, 1, 1])
  })
})
