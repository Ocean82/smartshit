import { describe, expect, it } from 'vitest'
import {
  isUrlBoundHyperlink,
  normalizeHyperlinkUrl,
  parseHyperlinkUrl,
  resolveHyperlinkOnEdit,
} from './hyperlink'

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

describe('resolveHyperlinkOnEdit', () => {
  const link = { url: 'https://example.com/' }

  it('auto-links bare URLs', () => {
    expect(resolveHyperlinkOnEdit({
      prevValue: null,
      prevHyperlink: undefined,
      nextValue: 'https://example.com',
    })).toEqual({ url: 'https://example.com/' })
  })

  it('clears URL-bound link when edited to plain text', () => {
    expect(resolveHyperlinkOnEdit({
      prevValue: 'https://example.com',
      prevHyperlink: link,
      nextValue: 'hello',
    })).toBeUndefined()
  })

  it('keeps labeled link when display text changes', () => {
    expect(resolveHyperlinkOnEdit({
      prevValue: 'Click here',
      prevHyperlink: link,
      nextValue: 'Click me',
    })).toEqual(link)
  })

  it('clears on formula or non-string', () => {
    expect(resolveHyperlinkOnEdit({
      prevValue: 'Click',
      prevHyperlink: link,
      nextValue: null,
      formula: '=A1',
    })).toBeUndefined()
    expect(resolveHyperlinkOnEdit({
      prevValue: 'Click',
      prevHyperlink: link,
      nextValue: 42,
    })).toBeUndefined()
  })
})

describe('isUrlBoundHyperlink', () => {
  it('matches normalized URL values', () => {
    expect(isUrlBoundHyperlink('https://example.com', { url: 'https://example.com/' })).toBe(true)
    expect(isUrlBoundHyperlink('Click', { url: 'https://example.com/' })).toBe(false)
  })
})
