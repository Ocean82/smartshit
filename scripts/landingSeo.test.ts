/**
 * Guards for the public landing pages: search metadata stays well formed, the
 * FAQ structured data matches the visible FAQ (search engines compare them),
 * dateModified agrees with the sitemap, and no target phrase is overused.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const LANDING = path.join(__dirname, '..', 'landing')
const SITEMAP = fs.readFileSync(path.join(__dirname, '..', 'public', 'sitemap.xml'), 'utf8')

interface Page {
  file: string
  url: string
  /** Phrases the page should plainly contain (a search engine reads the visible text). */
  phrases: string[]
}

const PAGES: Page[] = [
  { file: 'index.html', url: 'https://smartsht.com/', phrases: ['excel alternative', 'ai spreadsheet', 'formula auditor', 'google sheets alternative'] },
  { file: 'excel-alternative.html', url: 'https://smartsht.com/excel-alternative', phrases: ['excel alternative', 'google sheets alternative', 'ai spreadsheet'] },
  { file: 'formula-auditor.html', url: 'https://smartsht.com/formula-auditor', phrases: ['formula auditor', 'formula checker', 'error checker', 'excel'] },
]

/** A single phrase above this share of the words reads as stuffing. */
const MAX_PHRASE_DENSITY = 0.025

function decode(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}

function visibleText(html: string): string {
  const body = html.slice(html.indexOf('<body'))
  return decode(body.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function meta(html: string, re: RegExp): string {
  const m = re.exec(html)
  if (!m) throw new Error(`missing ${re}`)
  return decode(m[1])
}

function jsonLd(html: string): Array<Record<string, unknown>> {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  return blocks.flatMap((b) => {
    const data = JSON.parse(b[1]) as { '@graph'?: Array<Record<string, unknown>> }
    return data['@graph'] ?? [data as Record<string, unknown>]
  })
}

describe.each(PAGES)('$file', ({ file, url, phrases }) => {
  const html = fs.readFileSync(path.join(LANDING, file), 'utf8')
  const text = visibleText(html)
  const lower = text.toLowerCase()
  const graph = jsonLd(html)

  it('has a title, description and canonical of sensible length that match the social tags', () => {
    const title = meta(html, /<title>([^<]*)<\/title>/)
    const description = meta(html, /<meta name="description" content="([^"]*)"/)
    expect(title.length).toBeLessThanOrEqual(70)
    expect(description.length).toBeGreaterThanOrEqual(70)
    expect(description.length).toBeLessThanOrEqual(165)
    expect(meta(html, /<meta property="og:title" content="([^"]*)"/)).toBe(title)
    expect(meta(html, /<meta property="og:description" content="([^"]*)"/)).toBe(description)
    expect(meta(html, /<link rel="canonical" href="([^"]*)"/)).toBe(url)
  })

  it('has exactly one h1', () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
  })

  it('FAQ structured data matches the visible FAQ', () => {
    const faq = graph.find((n) => n['@type'] === 'FAQPage') as { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> } | undefined
    expect(faq).toBeDefined()
    expect(faq!.mainEntity.length).toBeGreaterThan(0)
    for (const q of faq!.mainEntity) {
      expect(text, `question: ${q.name}`).toContain(q.name)
      expect(text, `answer to: ${q.name}`).toContain(q.acceptedAnswer.text)
    }
  })

  it('dateModified agrees with the sitemap', () => {
    const modified = (graph.find((n) => n['@type'] === 'WebPage') as { dateModified: string }).dateModified
    const entry = SITEMAP.slice(SITEMAP.indexOf(`<loc>${url}</loc>`))
    const lastmod = /<lastmod>([^<]*)<\/lastmod>/.exec(entry)?.[1]
    expect(modified).toBe(lastmod)
  })

  it('uses its target phrases in the visible text, none of them excessively', () => {
    const words = lower.split(' ').length
    for (const phrase of phrases) {
      const count = lower.split(phrase).length - 1
      expect(count, `"${phrase}" should appear`).toBeGreaterThan(0)
      const density = (count * phrase.split(' ').length) / words
      expect(density, `"${phrase}" density`).toBeLessThanOrEqual(MAX_PHRASE_DENSITY)
    }
  })
})

describe('Pro footer perk', () => {
  it('is stated on the pricing page and in llms.txt', () => {
    const index = visibleText(fs.readFileSync(path.join(LANDING, 'index.html'), 'utf8'))
    expect(index).toContain('Audit reports without the smartsht footer')
    const llms = fs.readFileSync(path.join(__dirname, '..', 'public', 'llms.txt'), 'utf8')
    expect(llms).toContain('audit reports without the smartsht footer')
  })
})
