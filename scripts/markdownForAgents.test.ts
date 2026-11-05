import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  applyTokenMarkers,
  renderLandingMarkdown,
  wantsMarkdown,
} from './markdownForAgents.mjs'

const landing = path.resolve(import.meta.dirname, '../landing')

describe('wantsMarkdown', () => {
  it('matches the nginx map: text/markdown anywhere in Accept', () => {
    expect(wantsMarkdown(undefined)).toBe(false)
    expect(wantsMarkdown('')).toBe(false)
    expect(wantsMarkdown('text/html')).toBe(false)
    expect(wantsMarkdown('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')).toBe(false)
    expect(wantsMarkdown('text/markdown')).toBe(true)
    expect(wantsMarkdown('text/html, text/markdown;q=0.9')).toBe(true)
    expect(wantsMarkdown('TEXT/MARKDOWN')).toBe(true)
  })
})

describe('landing markdown files', () => {
  const pages = renderLandingMarkdown(landing)
  const conf = readFileSync(path.join(landing, 'smartsht.nginx.conf'), 'utf8')
  const headers = readFileSync(path.join(landing, 'security-headers.inc'), 'utf8')

  it('stays in sync with the HTML and the nginx token markers', () => {
    expect(applyTokenMarkers(conf, pages)).toBe(conf)
    for (const page of pages) {
      const committed = readFileSync(path.join(landing, page.markdownFile), 'utf8').replace(/\r\n/g, '\n')
      expect(committed).toBe(page.markdown)
      expect(page.markdown.startsWith('---\n')).toBe(true)
      expect(page.markdown).not.toContain('<main')
      expect(page.markdown).not.toContain('<style')
      expect(page.markdown).not.toMatch(/\n{3,}/)
      expect(conf).toContain(`add_header x-markdown-tokens "${page.tokens}" always; # md-tokens:${page.tokenMarker}`)
    }
  })

  it('emits absolute https links for agents (no site-relative /app paths)', () => {
    const home = pages.find((page) => page.markdownFile === 'index.md')
    expect(home).toBeTruthy()
    expect(home!.markdown).toContain('https://smartsht.com/app')
    expect(home!.markdown).not.toMatch(/\]\(\/app/)
    expect(home!.markdown).not.toMatch(/\]\(\/screenshot/)
  })

  it('negotiates markdown without dropping the CSP used on HTML responses', () => {
    expect(conf).toContain('map $http_accept $wants_markdown')
    expect(conf).toContain('~*text/markdown 1;')
    expect(conf).not.toContain('"~*text/markdown"')
    expect(conf).toContain('rewrite ^ /index.md last;')
    expect(conf).toContain('rewrite ^ /terms.md last;')
    expect(conf).toContain('rewrite ^ /privacy.md last;')
    expect(conf).toContain('rewrite ^ /excel-alternative.md last;')
    expect(conf).toContain('rewrite ^ /formula-auditor.md last;')
    expect(conf).toContain('include /etc/nginx/snippets/smartsht-security-headers.conf;')
    const csp = (text: string): string[] => text.match(/add_header Content-Security-Policy "[^"]+" always;/g) ?? []
    const snippetCsp = csp(headers)
    expect(snippetCsp).toHaveLength(1)
    expect(csp(conf)).toContain(snippetCsp[0])
  })
})
