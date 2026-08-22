/**
 * Client-Side WordPiece Tokenizer for MiniLM (all-MiniLM-L6-v2)
 *
 * Lightweight BERT-compatible tokenizer that runs entirely in the browser.
 * Loads vocabulary from the bundled tokenizer.json and produces input_ids,
 * attention_mask, and token_type_ids tensors for ONNX inference.
 *
 * Implements:
 * - BertNormalizer: lowercase, clean text, handle Chinese chars
 * - BertPreTokenizer: whitespace + punctuation splitting
 * - WordPiece model: greedy longest-match-first subword tokenization
 * - Template processing: [CLS] tokens [SEP] with padding to max_length
 */

// ─── Constants ──────────────────────────────────────────────────────────────

const CLS_TOKEN_ID = 101
const SEP_TOKEN_ID = 102
const PAD_TOKEN_ID = 0
const UNK_TOKEN_ID = 100
const MAX_LENGTH = 128
const MAX_INPUT_CHARS_PER_WORD = 100
const CONTINUING_SUBWORD_PREFIX = '##'

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

// ─── Tokenizer Class ────────────────────────────────────────────────────────

export class WordPieceTokenizer {
  private vocab: Map<string, number> = new Map()
  private initialized = false
  private config: TokenizerConfig

  constructor(config?: Partial<TokenizerConfig>) {
    this.config = {
      maxLength: config?.maxLength ?? MAX_LENGTH,
    }
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

    this.vocab.clear()
    for (const [token, id] of Object.entries(vocabObj)) {
      this.vocab.set(token, id as number)
    }

    if (this.vocab.size === 0) {
      throw new Error('Invalid tokenizer.json: vocab is empty')
    }

    this.initialized = true
  }

  /**
   * Initialize from a vocab.txt file (one token per line, ID = line number).
   * @param vocabText - Raw text content of vocab.txt
   */
  loadFromVocabTxt(vocabText: string): void {
    this.vocab.clear()
    const lines = vocabText.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const token = lines[i].trimEnd()
      if (token.length > 0) {
        this.vocab.set(token, i)
      }
    }

    if (this.vocab.size === 0) {
      throw new Error('Invalid vocab.txt: no tokens found')
    }

    this.initialized = true
  }

  /**
   * Tokenize a single text string into model-ready tensors.
   *
   * Pipeline:
   * 1. Normalize (lowercase, clean control chars, handle Chinese chars)
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

    // 1. Normalize
    const normalized = this.normalize(text)

    // 2. Pre-tokenize (split into words)
    const words = this.preTokenize(normalized)

    // 3. WordPiece tokenization
    const tokenIds: number[] = []
    const maxTokens = this.config.maxLength - 2 // Reserve space for [CLS] and [SEP]

    for (const word of words) {
      if (tokenIds.length >= maxTokens) break

      const wordTokens = this.tokenizeWord(word)
      for (const id of wordTokens) {
        if (tokenIds.length >= maxTokens) break
        tokenIds.push(id)
      }
    }

    // 4. Build final sequence: [CLS] + tokens + [SEP] + padding
    const seqLength = tokenIds.length + 2 // +2 for [CLS] and [SEP]
    const paddingLength = this.config.maxLength - seqLength

    const inputIds = new BigInt64Array(this.config.maxLength)
    const attentionMask = new BigInt64Array(this.config.maxLength)
    const tokenTypeIds = new BigInt64Array(this.config.maxLength)

    // [CLS]
    inputIds[0] = BigInt(CLS_TOKEN_ID)
    attentionMask[0] = 1n

    // Tokens
    for (let i = 0; i < tokenIds.length; i++) {
      inputIds[i + 1] = BigInt(tokenIds[i])
      attentionMask[i + 1] = 1n
    }

    // [SEP]
    inputIds[tokenIds.length + 1] = BigInt(SEP_TOKEN_ID)
    attentionMask[tokenIds.length + 1] = 1n

    // Padding (already zeros from initialization, but be explicit for attention_mask)
    for (let i = 0; i < paddingLength; i++) {
      inputIds[seqLength + i] = BigInt(PAD_TOKEN_ID)
      // attentionMask and tokenTypeIds already 0n
    }

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

  // ─── Private: Normalization ─────────────────────────────────────────────

  /**
   * BERT normalization:
   * - Strip control characters (except whitespace)
   * - Replace whitespace variants with space
   * - Lowercase
   * - Add spaces around Chinese characters (CJK Unified Ideographs)
   */
  private normalize(text: string): string {
    let result = ''

    for (let i = 0; i < text.length; i++) {
      const cp = text.codePointAt(i)!
      const char = String.fromCodePoint(cp)

      // Handle surrogate pairs
      if (cp > 0xFFFF) i++

      // Remove control characters (except whitespace)
      if (isControl(cp)) continue

      // Collapse whitespace to single space
      if (isWhitespace(cp)) {
        result += ' '
        continue
      }

      // Pad Chinese characters with spaces
      if (isChinese(cp)) {
        result += ` ${char} `
        continue
      }

      result += char
    }

    return result.toLowerCase().trim()
  }

  // ─── Private: Pre-tokenization ──────────────────────────────────────────

  /**
   * BERT pre-tokenization: split on whitespace and punctuation.
   * Punctuation characters become their own tokens.
   */
  private preTokenize(text: string): string[] {
    const tokens: string[] = []
    let current = ''

    for (let i = 0; i < text.length; i++) {
      const cp = text.codePointAt(i)!
      const char = String.fromCodePoint(cp)

      if (cp > 0xFFFF) i++

      if (isWhitespace(cp)) {
        if (current.length > 0) {
          tokens.push(current)
          current = ''
        }
      } else if (isPunctuation(cp)) {
        if (current.length > 0) {
          tokens.push(current)
          current = ''
        }
        tokens.push(char)
      } else {
        current += char
      }
    }

    if (current.length > 0) {
      tokens.push(current)
    }

    return tokens
  }

  // ─── Private: WordPiece ─────────────────────────────────────────────────

  /**
   * WordPiece tokenization: greedy longest-match-first algorithm.
   * Returns an array of token IDs for a single word.
   * If the word exceeds max_input_chars_per_word, returns [UNK].
   */
  private tokenizeWord(word: string): number[] {
    if (word.length > MAX_INPUT_CHARS_PER_WORD) {
      return [UNK_TOKEN_ID]
    }

    const tokens: number[] = []
    let start = 0

    while (start < word.length) {
      let end = word.length
      let foundId: number | undefined

      while (start < end) {
        const substr = start === 0
          ? word.slice(start, end)
          : CONTINUING_SUBWORD_PREFIX + word.slice(start, end)

        const id = this.vocab.get(substr)
        if (id !== undefined) {
          foundId = id
          break
        }
        end--
      }

      if (foundId === undefined) {
        // No subword found — entire word is unknown
        return [UNK_TOKEN_ID]
      }

      tokens.push(foundId)
      start = end
    }

    return tokens
  }
}

// ─── Character Classification Helpers ─────────────────────────────────────────

/** Check if a code point is a control character (not whitespace) */
function isControl(cp: number): boolean {
  if (cp === 0x09 || cp === 0x0A || cp === 0x0D) return false // tab, LF, CR are whitespace
  return (cp >= 0x00 && cp <= 0x1F) || (cp >= 0x7F && cp <= 0x9F)
}

/** Check if a code point is whitespace */
function isWhitespace(cp: number): boolean {
  return (
    cp === 0x20 || // space
    cp === 0x09 || // tab
    cp === 0x0A || // line feed
    cp === 0x0D || // carriage return
    cp === 0xA0 || // non-breaking space
    cp === 0x3000  // ideographic space
  )
}

/**
 * Check if a code point is punctuation (Unicode categories Pc, Pd, Pe, Pf, Pi, Po, Ps,
 * plus ASCII symbols commonly treated as punctuation by BERT).
 */
function isPunctuation(cp: number): boolean {
  // ASCII punctuation ranges
  if (
    (cp >= 0x21 && cp <= 0x2F) || // ! " # $ % & ' ( ) * + , - . /
    (cp >= 0x3A && cp <= 0x40) || // : ; < = > ? @
    (cp >= 0x5B && cp <= 0x60) || // [ \ ] ^ _ `
    (cp >= 0x7B && cp <= 0x7E)    // { | } ~
  ) {
    return true
  }

  // Unicode General Punctuation block
  if (cp >= 0x2000 && cp <= 0x206F) return true
  // CJK Symbols and Punctuation
  if (cp >= 0x3000 && cp <= 0x303F) return true

  return false
}

/**
 * Check if a code point is a CJK Unified Ideograph.
 * Covers the main CJK blocks used by BERT.
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
  truncation?: {
    max_length?: number
  }
}
