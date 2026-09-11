import { describe, expect, it } from 'vitest'
import { normalizeHyperlinkUrl, parseHyperlinkUrl } from './hyperlink'

describe('parseHyperlinkUrl', () => {
  it('accepts http(s) and www', () => {
    expect(parseHyperlinkUrl('https://example.com')).toBe('https://example.com/')
    expect(parseHyperlinkUrl('http://example.com/path')).toBe('http://example.com/path')
    expect(parseHyperlinkUrl('www.example.com')).toBe('https://www.example.com/')
  })

  it('rejects plain text and javascript', () => {
    expect(parseHyperlinkUrl('hello')).toBeNull()
    expect(parseHyperlinkUrl('javascript:alert(1)')).toBeNull()
    expect(parseHyperlinkUrl('Click https://x.com')).toBeNull()
  })
})

describe('normalizeHyperlinkUrl', () => {
  it('adds https when scheme missing', () => {
    expect(normalizeHyperlinkUrl('example.com')).toBe('https://example.com/')
  })

  it('rejects non-http schemes', () => {
    expect(normalizeHyperlinkUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeHyperlinkUrl('ftp://files.example.com')).toBeNull()
  })
})
