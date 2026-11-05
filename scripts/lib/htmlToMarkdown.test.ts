import { describe, expect, it } from 'vitest'
import { estimateTokens, htmlToMarkdown, normalizeMarkdown } from './htmlToMarkdown.mjs'

describe('htmlToMarkdown', () => {
  it('emits YAML frontmatter, body, and JSON-LD', () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Demo Title</title>
  <meta name="description" content="A short summary." />
  <meta property="og:image" content="https://example.com/cover.png" />
  <link rel="canonical" href="https://example.com/docs/" />
  <script type="application/ld+json">{"@type":"WebPage","name":"Demo"}</script>
</head>
<body>
  <nav><a href="/">Home</a></nav>
  <main>
    <h1>Hello</h1>
    <p>Welcome to <strong>smartsht</strong>.</p>
    <ul><li>One</li><li>Two</li></ul>
  </main>
  <footer>ignore me</footer>
</body>
</html>`

    const { markdown, tokens, frontmatter } = htmlToMarkdown(html)

    expect(frontmatter).toEqual({
      title: 'Demo Title',
      description: 'A short summary.',
      image: 'https://example.com/cover.png',
    })
    expect(markdown.startsWith('---\n')).toBe(true)
    expect(markdown).toContain('title: Demo Title')
    expect(markdown).toContain('# Hello')
    expect(markdown).toContain('Welcome to **smartsht**.')
    expect(markdown).toContain('- One')
    expect(markdown).toContain('- Two')
    expect(markdown).not.toContain('ignore me')
    expect(markdown).not.toContain('<nav')
    expect(markdown).toMatch(/```json\n\{"@type":"WebPage","name":"Demo"\}\n```/)
    expect(tokens).toBe(estimateTokens(markdown))
    expect(tokens).toBeGreaterThan(10)
  })

  it('resolves relative links and images to absolute URLs via canonical', () => {
    const html = `<html><head>
      <link rel="canonical" href="https://smartsht.com/terms" />
    </head><body><main>
      <p><a href="/app">Launch</a> <a href="#section">Jump</a></p>
      <img src="/screenshot.png" alt="Shot" />
      <p><a href="mailto:support@smartsht.com">Email</a></p>
    </main></body></html>`

    const { markdown } = htmlToMarkdown(html)
    expect(markdown).toContain('[Launch](https://smartsht.com/app)')
    expect(markdown).toContain('[Jump](#section)')
    expect(markdown).toContain('![Shot](https://smartsht.com/screenshot.png)')
    expect(markdown).toContain('[Email](mailto:support@smartsht.com)')
  })

  it('collapses excess blank lines and does not glue adjacent links', () => {
    const html = `<html><body><main>
      <div><div>First</div><div>Second</div></div>
      <p><a href="/a">A</a><a href="/b">B</a></p>
    </main></body></html>`

    const { markdown } = htmlToMarkdown(html, { pageUrl: 'https://smartsht.com/' })
    expect(markdown).not.toMatch(/\n{3,}/)
    expect(markdown).toContain('[A](https://smartsht.com/a) [B](https://smartsht.com/b)')
    expect(markdown).toContain('First')
    expect(markdown).toContain('Second')
  })

  it('prefers meta name=title over the title element and Open Graph', () => {
    const html = `<html><head>
      <title>Document Title</title>
      <meta name="title" content="Standard Title" />
      <meta property="og:title" content="OG Title" />
    </head><body><main><p>Body</p></main></body></html>`
    expect(htmlToMarkdown(html).frontmatter.title).toBe('Standard Title')
  })

  it('prefers the title element over Open Graph when both exist', () => {
    const html = `<html><head>
      <title>Document Title</title>
      <meta property="og:title" content="OG Title" />
      <meta name="description" content="Standard desc" />
      <meta property="og:description" content="OG desc" />
    </head><body><main><p>Body</p></main></body></html>`

    const { frontmatter } = htmlToMarkdown(html)
    expect(frontmatter.title).toBe('Document Title')
    expect(frontmatter.description).toBe('Standard desc')
  })

  it('falls back to Open Graph when standard meta is missing', () => {
    const html = `<html><head>
      <meta property="og:title" content="OG Title" />
      <meta property="og:description" content="OG desc" />
    </head><body><main><h2>Section</h2></main></body></html>`

    const { frontmatter, markdown } = htmlToMarkdown(html)
    expect(frontmatter.title).toBe('OG Title')
    expect(frontmatter.description).toBe('OG desc')
    expect(markdown).toContain('## Section')
  })

  it('renders tables as GitHub-flavored markdown', () => {
    const html = `<html><body><main>
      <table>
        <tr><th>A</th><th>B</th></tr>
        <tr><td>1</td><td>2</td></tr>
      </table>
    </main></body></html>`

    const { markdown } = htmlToMarkdown(html)
    expect(markdown).toContain('| A | B |')
    expect(markdown).toContain('| --- | --- |')
    expect(markdown).toContain('| 1 | 2 |')
  })

  it('rejects empty input', () => {
    expect(() => htmlToMarkdown('   ')).toThrow(/non-empty/)
  })
})

describe('normalizeMarkdown', () => {
  it('trims trailing spaces, leading prose spaces, and blank runs', () => {
    expect(normalizeMarkdown('a  \n\n\n\nb  ')).toBe('a\n\nb\n')
    expect(normalizeMarkdown(' [Link](https://x)\n')).toBe('[Link](https://x)\n')
    // Nested list indentation must survive (do not collapse mid-line spaces).
    expect(normalizeMarkdown('- parent\n  - child\n')).toBe('- parent\n  - child\n')
  })
})
