/**
 * Tests for reasoning-block tag stripping.
 *
 * Covers both the complete-string path (stripThinkingTags) and the streaming
 * filter path (createThinkingTagFilter), with emphasis on chunk-boundary
 * edge cases that previously leaked thinking tokens.
 *
 * Tag format: open `&lt;think&gt;`, close `&lt;/think&gt;`.
 */

import { describe, it, expect, vi } from 'vitest'
import { stripThinkingTags, createThinkingTagFilter } from './thinkingTagStripper.js'

// Exact bytes of the real tags (no leading space): <think> and </think>
const OPEN = String.fromCharCode(60, 116, 104, 105, 110, 107, 62)
const CLOSE = String.fromCharCode(60, 47, 116, 104, 105, 110, 107, 62)

describe('stripThinkingTags', () => {
  it('returns unchanged text when there are no thinking tags', () => {
    expect(stripThinkingTags('{"message":"hello","actions":[]}'))
      .toBe('{"message":"hello","actions":[]}')
  })

  it('removes a simple thinking block', () => {
    const input = `${OPEN}I need to reason about this${CLOSE}{"message":"hi","actions":[]}`
    expect(stripThinkingTags(input)).toBe('{"message":"hi","actions":[]}')
  })

  it('removes thinking blocks that contain newlines and special chars', () => {
    const input = `${OPEN}line1\nline2 <>\n&\tthe${CLOSE}{"ok":1}`
    expect(stripThinkingTags(input)).toBe('{"ok":1}')
  })

  it('removes multiple thinking blocks, preserving content between them', () => {
    const input = `\n${OPEN}A${CLOSE}\n{"a":1}\n${OPEN}B${CLOSE}\nX{"b":2}`
    expect(stripThinkingTags(input)).toBe('{"a":1}\n\nX{"b":2}')
  })

  it('strips an unclosed trailing thinking tag', () => {
    const input = `{"msg":"x"}${OPEN}this never closed`
    expect(stripThinkingTags(input)).toBe('{"msg":"x"}')
  })

  it('handles plain text with no tags by returning it', () => {
    expect(stripThinkingTags('just some text')).toBe('just some text')
  })

  it('trims surrounding whitespace', () => {
    expect(stripThinkingTags('  \n hi there  ')).toBe('hi there')
  })
})

describe('createThinkingTagFilter — basic behavior', () => {
  it('forwards normal content untouched', () => {
    const onChunk = vi.fn()
    const filter = createThinkingTagFilter(onChunk)
    filter('hello')
    filter(' world')
    expect(onChunk).toHaveBeenNthCalledWith(1, 'hello')
    expect(onChunk).toHaveBeenNthCalledWith(2, ' world')
  })

  it('suppresses a thinking block split across many chunks', () => {
    const out: string[] = []
    const filter = createThinkingTagFilter((c) => out.push(c))
    const chunks = [
      'pre', 'amble ',
      '<t', 'hink>', 'hidden', ' reason',
      'ing',
      CLOSE,
      'visible', 'tail',
    ]
    for (const c of chunks) filter(c)
    expect(out.join('')).toBe('preamble visibletail')
  })

  it('flushes content before thinking and after closing', () => {
    const out: string[] = []
    const filter = createThinkingTagFilter((c) => out.push(c))
    filter(`A${OPEN}hidden${CLOSE}B`)
    expect(out.join('')).toBe('AB')
  })
})

describe('createThinkingTagFilter — opening tag at buffer position 0', () => {
  // Regression: partial open tag at index 0 used to flush as content.
  const cases: Array<[string[], string]> = [
    [['<t', 'hink>hidden' + CLOSE + 'C'], 'C'],
    [['<', 'think>hidden' + CLOSE + 'D'], 'D'],
    [['<th', 'ink>h' + CLOSE + 'E'], 'E'],
    [['<thi', 'nk>h' + CLOSE + 'F'], 'F'],
    [['<thin', 'k>h' + CLOSE + 'G'], 'G'],
    [['<think', '>h' + CLOSE + 'H'], 'H'],
  ]

  it.each(cases)('handles open split as %j', (chunks, expected) => {
    const out: string[] = []
    const filter = createThinkingTagFilter((c) => out.push(c))
    for (const c of chunks) filter(c)
    expect(out.join('')).toBe(expected)
  })
})

describe('createThinkingTagFilter — closing tag at buffer position 0', () => {
  const cases: Array<[string[], string]> = [
    [['<think>x', '</', 'think>tail'], 'tail'],
    [['<think>x', '</th', 'ink>tail'], 'tail'],
    [['<think>x', '</thi', 'nk>tail'], 'tail'],
    [['<think>x', '</thin', 'k>tail'], 'tail'],
    [['<think>x', '</think', '>tail'], 'tail'],
  ]

  it.each(cases)('handles close split as %j', (chunks, expected) => {
    const out: string[] = []
    const filter = createThinkingTagFilter((c) => out.push(c))
    for (const c of chunks) filter(c)
    expect(out.join('')).toBe(expected)
  })
})

describe('createThinkingTagFilter — mixed content and boundaries', () => {
  it('interleaves thinking and content correctly', () => {
    const out: string[] = []
    const filter = createThinkingTagFilter((c) => out.push(c))
    filter(`start${OPEN}one${CLOSE}mid${OPEN}two${CLOSE}end`)
    expect(out.join('')).toBe('startmidend')
  })

  it('handles single-char chunks for the whole sequence', () => {
    const out: string[] = []
    const filter = createThinkingTagFilter((c) => out.push(c))
    for (const ch of `ab${OPEN}cnt${CLOSE}cd`) filter(ch)
    expect(out.join('')).toBe('abcd')
  })

  it('holds back a trailing < as a possible tag opener (by design)', () => {
    // A lone trailing "<" could be the start of a thinking tag, so it is
    // held back until a later chunk disambiguates it.
    const out: string[] = []
    const filter = createThinkingTagFilter((c) => out.push(c))
    filter('a < bxx') // "< bxx" held back awaiting disambiguation
    expect(out.join('')).toBe('a ')
  })

  it('flushes held-back content once later data shows no tag', () => {
    const out: string[] = []
    const filter = createThinkingTagFilter((c) => out.push(c))
    filter('a < b')     // "< b" held back
    expect(out.join('')).toBe('a ')
    filter(' > x')      // "< b > x" contains a '>' so not an unclosed tag
    expect(out.join('')).toBe('a < b > x')
  })

  it('keeps holding back content with no closing > (still ambiguous)', () => {
    const out: string[] = []
    const filter = createThinkingTagFilter((c) => out.push(c))
    filter('<')          // held back
    filter('notatag')    // "<notatag" still no '>' → still ambiguous, held back
    expect(out.join('')).toBe('')
    // Once a '>' arrives and no thinking opener is formed, it flushes.
    filter('!>')         // "<notatag!>" — not a thinking tag → flushed
    expect(out.join('')).toBe('<notatag!>')
  })
})

describe('createThinkingTagFilter — no leak of thinking to client', () => {
  it('never emits the substrings "<think" or "</think"', () => {
    const out: string[] = []
    const filter = createThinkingTagFilter((c) => out.push(c))
    filter(`aa${OPEN}bb${CLOSE}cc`)
    expect(out.join('')).toBe('aacc')
    expect(out.join('')).not.toContain('think')
  })

  it('emits nothing when the entire stream is thinking', () => {
    const out: string[] = []
    const filter = createThinkingTagFilter((c) => out.push(c))
    filter(`${OPEN}hidden${CLOSE}`)
    expect(out.join('')).toBe('')
  })
})
