/**
 * Client-Side WordPiece Tokenizer for MiniLM (all-MiniLM-L6-v2)
 *
 * Lightweight BERT-compatible tokenizer that runs entirely in the browser.
 * Loads vocabulary from the bundled tokenizer.json and produces input_ids,
 * attention_mask, and token_type_ids tensors for ONNX inference.
 *
 * Mirrors Hugging Face `tokenizers` (the library that wrote tokenizer.json),
 * step for step:
 * - BertNormalizer: clean text, pad CJK ideographs, strip accents, lowercase
 * - BertPreTokenizer: split on whitespace, isolate punctuation
 * - WordPiece: greedy longest-match-first subwords
 * - TemplateProcessing: [CLS] tokens [SEP], padded to max_length
 *
 * Parity is pinned by __tests__/tokenizer.parity.test.ts: 365 strings encoded
 * by Hugging Face from the same tokenizer.json. Character classes use Unicode
 * property escapes rather than hand-kept ranges, so Unicode spaces, invisible
 * characters, and punctuation outside ASCII behave like the reference.
 */

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_LENGTH = 128
const DEFAULT_MAX_INPUT_CHARS_PER_WORD = 100
const DEFAULT_CONTINUING_SUBWORD_PREFIX = '##'

// Character classes, matching the Rust `tokenizers` BERT implementation.
/** Control (Unicode "Other": Cc, Cf, Cs, Co, Cn) except tab, LF and CR, which are whitespace. */
const CONTROL_RE = /\p{C}/u
/** Rust `char::is_whitespace` is the Unicode White_Space property. */
const WHITESPACE_RE = /\p{White_Space}/u
/** BertPreTokenizer splits on ASCII punctuation (incl. $ + < = > ^ ` | ~) and every Unicode P* character. */
const PUNCTUATION_RE = /[!-/:-@[-`{-~]|\p{P}/u
/** Accents left after NFD decomposition. */
const NONSPACING_MARKS_RE = /\p{Mn}/gu

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TokenizerOutput {
  /** Token IDs including [CLS], tokens, [SEP], padding */
  inputIds: BigInt64Array
  /** 1 for real tokens, 0 for padding */
  attentionMask: BigInt64Array
  /** Always 0 for single-sentence input */
  tokenTypeIds: BigInt64Array
}

export interface TokenizerConfig {
  maxLength: number
}

interface SpecialIds {
  cls: number
  sep: number
  pad: number
  unk: number
}

// ─── Tokenizer Class ────────────────────────────────────────────────────────

export class WordPieceTokenizer {
  private vocab: Map<string, number> = new Map()
  private initialized = false
  private config: TokenizerConfig
  private special: SpecialIds = { cls: 0, sep: 0, pad: 0, unk: 0 }
  private subwordPrefix = DEFAULT_CONTINUING_SUBWORD_PREFIX
  private maxInputCharsPerWord = DEFAULT_MAX_INPUT_CHARS_PER_WORD
  /** Longest vocab piece in characters (prefix excluded): no longer substring can match. */
  private maxPieceChars = 0

  constructor(config?: Partial<TokenizerConfig>) {
    const maxLength = config?.maxLength ?? MAX_LENGTH
    if (!Number.isInteger(maxLength) || maxLength < 2) {
      // [CLS] and [SEP] alone need two positions.
      throw new RangeError(`maxLength must be an integer of at least 2, got ${maxLength}`)
    }
    this.config = { maxLength }
  }

  /** Whether the tokenizer has loaded its vocabulary */
  get isReady(): boolean {
    return this.initialized
  }

  /**
   * Initialize the tokenizer by loading vocabulary from a tokenizer.json file.
   * @param tokenizerJson - Parsed tokenizer.json content (HuggingFace format)
   */
  loadFromTokenizerJson(tokenizerJson: TokenizerJsonFormat): void {
    const vocabObj = tokenizerJson.model?.vocab
    if (!vocabObj || typeof vocabObj !== 'object') {
      throw new Error('Invalid tokenizer.json: missing model.vocab')
    }

    const vocab = new Map<string, number>()
    for (const [token, id] of Object.entries(vocabObj)) vocab.set(token, id)
    if (vocab.size === 0) {
      throw new Error('Invalid tokenizer.json: vocab is empty')
    }

    const model = tokenizerJson.model ?? {}
    this.install(vocab, {
      unkToken: model.unk_token,
      padId: tokenizerJson.padding?.pad_id,
      subwordPrefix: model.continuing_subword_prefix,
      maxInputCharsPerWord: model.max_input_chars_per_word,
    })
  }

  /**
   * Initialize from a vocab.txt file (one token per line, ID = line number).
   * @param vocabText - Raw text content of vocab.txt
   */
  loadFromVocabTxt(vocabText: string): void {
    const vocab = new Map<string, number>()
    const lines = vocabText.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const token = lines[i].trimEnd()
      if (token.length > 0) vocab.set(token, i)
    }

    if (vocab.size === 0) {
      throw new Error('Invalid vocab.txt: no tokens found')
    }

    this.install(vocab, {})
  }

  /**
   * Tokenize a single text string into model-ready tensors.
   *
   * Pipeline:
   * 1. Normalize (clean text, pad CJK, strip accents, lowercase)
   * 2. Pre-tokenize (split on whitespace and punctuation)
   * 3. WordPiece subword tokenization
   * 4. Add [CLS] / [SEP] special tokens
   * 5. Truncate to max_length - 2 (accounting for special tokens)
   * 6. Pad to max_length
   *
   * @param text - Input text to tokenize
   * @returns TokenizerOutput with inputIds, attentionMask, tokenTypeIds
   */
  encode(text: string): TokenizerOutput {
    if (!this.initialized) {
      throw new Error('Tokenizer not initialized. Call loadFromTokenizerJson() or loadFromVocabTxt() first.')
    }

    const { maxLength } = this.config
    const words = this.preTokenize(this.normalize(text))

    const tokenIds: number[] = []
    const maxTokens = maxLength - 2 // Reserve space for [CLS] and [SEP]

    for (const word of words) {
      if (tokenIds.length >= maxTokens) break
      for (const id of this.tokenizeWord(word)) {
        if (tokenIds.length >= maxTokens) break
        tokenIds.push(id)
      }
    }

    // [CLS] + tokens + [SEP] + padding. Typed arrays start at zero, so only
    // non-zero values are written. tokenTypeIds stays all zeros: one sentence.
    const inputIds = new BigInt64Array(maxLength)
    const attentionMask = new BigInt64Array(maxLength)
    const tokenTypeIds = new BigInt64Array(maxLength)

    inputIds[0] = BigInt(this.special.cls)
    for (let i = 0; i < tokenIds.length; i++) inputIds[i + 1] = BigInt(tokenIds[i])
    inputIds[tokenIds.length + 1] = BigInt(this.special.sep)
    attentionMask.fill(1n, 0, tokenIds.length + 2)
    if (this.special.pad !== 0) inputIds.fill(BigInt(this.special.pad), tokenIds.length + 2)

    return { inputIds, attentionMask, tokenTypeIds }
  }

  /**
   * Batch encode multiple texts.
   * Returns flat arrays suitable for creating 2D tensors [batch_size, max_length].
   */
  encodeBatch(texts: string[]): {
    inputIds: BigInt64Array
    attentionMask: BigInt64Array
    tokenTypeIds: BigInt64Array
    batchSize: number
  } {
    const batchSize = texts.length
    const totalLength = batchSize * this.config.maxLength

    const inputIds = new BigInt64Array(totalLength)
    const attentionMask = new BigInt64Array(totalLength)
    const tokenTypeIds = new BigInt64Array(totalLength)

    for (let b = 0; b < batchSize; b++) {
      const encoded = this.encode(texts[b])
      const offset = b * this.config.maxLength
      inputIds.set(encoded.inputIds, offset)
      attentionMask.set(encoded.attentionMask, offset)
      tokenTypeIds.set(encoded.tokenTypeIds, offset)
    }

    return { inputIds, attentionMask, tokenTypeIds, batchSize }
  }

  // ─── Private: Setup ─────────────────────────────────────────────────────

  /**
   * Adopt a vocabulary, reading special-token ids from it rather than assuming
   * the bert-base-uncased numbers (101, 102, 100, 0). A vocabulary without
   * them cannot produce valid input, so loading fails instead of guessing.
   */
  private install(
    vocab: Map<string, number>,
    opts: { unkToken?: string; padId?: number; subwordPrefix?: string; maxInputCharsPerWord?: number },
  ): void {
    const need = (token: string): number => {
      const id = vocab.get(token)
      if (id === undefined) throw new Error(`Invalid vocabulary: missing special token ${token}`)
      return id
    }
    const special: SpecialIds = {
      cls: need('[CLS]'),
      sep: need('[SEP]'),
      unk: need(opts.unkToken ?? '[UNK]'),
      pad: opts.padId ?? vocab.get('[PAD]') ?? 0,
    }

    const subwordPrefix = opts.subwordPrefix ?? DEFAULT_CONTINUING_SUBWORD_PREFIX
    let maxPieceChars = 0
    for (const token of vocab.keys()) {
      const piece = token.startsWith(subwordPrefix) ? token.slice(subwordPrefix.length) : token
      maxPieceChars = Math.max(maxPieceChars, [...piece].length)
    }

    this.vocab = vocab
    this.special = special
    this.subwordPrefix = subwordPrefix
    this.maxInputCharsPerWord = opts.maxInputCharsPerWord ?? DEFAULT_MAX_INPUT_CHARS_PER_WORD
    this.maxPieceChars = maxPieceChars
    this.initialized = true
  }

  // ─── Private: Normalization ─────────────────────────────────────────────

  /**
   * BertNormalizer with clean_text, handle_chinese_chars, and lowercase on.
   * strip_accents is unset in tokenizer.json, and Hugging Face then follows
   * `lowercase`, so accents are stripped: "café" → "cafe". Same order as the
   * Rust implementation: clean, pad CJK, strip accents, lowercase.
   */
  private normalize(text: string): string {
    let cleaned = ''
    for (const char of text) {
      const cp = char.codePointAt(0)!
      const isTabOrNewline = cp === 0x09 || cp === 0x0a || cp === 0x0d
      // Removed: NUL, U+FFFD, and control/format characters (zero-width
      // spaces, BOM, soft hyphen, NEL). Tab, LF and CR are kept as whitespace.
      if (cp === 0 || cp === 0xfffd || (!isTabOrNewline && CONTROL_RE.test(char))) continue
      if (isTabOrNewline || WHITESPACE_RE.test(char)) cleaned += ' '
      else cleaned += isChinese(cp) ? ` ${char} ` : char
    }

    return cleaned.normalize('NFD').replace(NONSPACING_MARKS_RE, '').toLowerCase()
  }

  // ─── Private: Pre-tokenization ──────────────────────────────────────────

  /**
   * BertPreTokenizer: split on whitespace; each punctuation character becomes
   * its own token. Symbols (€, °, ©, emoji) are not punctuation and stay in the word.
   */
  private preTokenize(text: string): string[] {
    const tokens: string[] = []
    let current = ''

    for (const char of text) {
      if (WHITESPACE_RE.test(char)) {
        if (current) tokens.push(current)
        current = ''
      } else if (PUNCTUATION_RE.test(char)) {
        if (current) tokens.push(current)
        current = ''
        tokens.push(char)
      } else {
        current += char
      }
    }

    if (current) tokens.push(current)
    return tokens
  }

  // ─── Private: WordPiece ─────────────────────────────────────────────────

  /**
   * WordPiece tokenization: greedy longest-match-first algorithm.
   * Returns an array of token IDs for a single word, or [UNK] when the word is
   * longer than max_input_chars_per_word or has a piece not in the vocabulary.
   *
   * Works on code points, not UTF-16 units, so the length limit counts
   * characters as Hugging Face does. Candidate pieces are capped at the
   * longest vocab entry, which keeps the search linear in practice.
   */
  private tokenizeWord(word: string): number[] {
    const chars = [...word]
    if (chars.length > this.maxInputCharsPerWord) return [this.special.unk]

    const tokens: number[] = []
    let start = 0

    while (start < chars.length) {
      let end = Math.min(chars.length, start + this.maxPieceChars)
      let foundId: number | undefined

      while (start < end) {
        const piece = chars.slice(start, end).join('')
        const id = this.vocab.get(start === 0 ? piece : this.subwordPrefix + piece)
        if (id !== undefined) {
          foundId = id
          break
        }
        end--
      }

      // No piece matched: the whole word is unknown.
      if (foundId === undefined) return [this.special.unk]

      tokens.push(foundId)
      start = end
    }

    return tokens
  }
}

// ─── Character Classification Helpers ─────────────────────────────────────────

/**
 * Check if a code point is a CJK Unified Ideograph.
 * Same blocks as the Hugging Face BERT normalizer.
 */
function isChinese(cp: number): boolean {
  return (
    (cp >= 0x4E00 && cp <= 0x9FFF) ||
    (cp >= 0x3400 && cp <= 0x4DBF) ||
    (cp >= 0x20000 && cp <= 0x2A6DF) ||
    (cp >= 0x2A700 && cp <= 0x2B73F) ||
    (cp >= 0x2B740 && cp <= 0x2B81F) ||
    (cp >= 0x2B820 && cp <= 0x2CEAF) ||
    (cp >= 0xF900 && cp <= 0xFAFF) ||
    (cp >= 0x2F800 && cp <= 0x2FA1F)
  )
}

// ─── Tokenizer JSON Format (minimal type for loading) ─────────────────────────

export interface TokenizerJsonFormat {
  model?: {
    type?: string
    vocab?: Record<string, number>
    unk_token?: string
    continuing_subword_prefix?: string
    max_input_chars_per_word?: number
  }
  padding?: {
    pad_id?: number
  }
  truncation?: {
    max_length?: number
  }
}
