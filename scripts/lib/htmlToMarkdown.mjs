/**
 * Convert landing-page HTML into agent-friendly Markdown.
 *
 * Output layout matches Cloudflare Markdown for Agents:
 *   1. YAML frontmatter from title / description / og:image
 *   2. Body markdown from <main> (nav/footer/scripts/styles stripped)
 *   3. JSON-LD preserved as a trailing fenced json block
 *
 * Relative links/images are resolved against the page canonical URL
 * (falling back to https://smartsht.com/) so agents get absolute targets.
 *
 * Token estimate uses chars/4 (common agent budgeting heuristic).
 */

import { parse } from 'node-html-parser'

const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'aside', 'header', 'footer',
  'main', 'figure', 'figcaption', 'blockquote', 'pre', 'hr',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br',
])

const DEFAULT_BASE_URL = 'https://smartsht.com/'

/**
 * @param {string} html
 * @param {{ pageUrl?: string }} [options]
 * @returns {{ markdown: string, tokens: number, frontmatter: Record<string, string> }}
 */
export function htmlToMarkdown(html, options = {}) {
  if (typeof html !== 'string' || html.trim() === '') {
    throw new Error('htmlToMarkdown requires a non-empty HTML string')
  }

  const root = parse(html, {
    comment: false,
    blockTextElements: {
      script: true,
      style: true,
      noscript: true,
    },
  })

  const canonical = root.querySelector('link[rel="canonical"]')?.getAttribute('href')
  const pageUrl = options.pageUrl || canonical || DEFAULT_BASE_URL
  const context = { pageUrl }

  const frontmatter = extractFrontmatter(root)
  const jsonLdBlocks = extractJsonLd(root)
  const main = root.querySelector('main') ?? root.querySelector('body') ?? root

  // Drop non-content chrome that can leak into <main> copies.
  for (const el of main.querySelectorAll('script, style, noscript, nav, footer, template')) {
    el.remove()
  }
  for (const el of main.querySelectorAll('.skip-link, #mobile-nav')) {
    el.remove()
  }

  const body = renderNode(main, context).trim()
  const parts = []

  if (Object.keys(frontmatter).length > 0) {
    parts.push(formatFrontmatter(frontmatter))
  }
  if (body) parts.push(body)
  if (jsonLdBlocks.length > 0) {
    parts.push('```json\n' + jsonLdBlocks.join('\n') + '\n```')
  }

  const markdown = normalizeMarkdown(parts.join('\n\n'))
  const tokens = estimateTokens(markdown)
  return { markdown, tokens, frontmatter }
}

/**
 * @param {string} markdown
 * @returns {number}
 */
export function estimateTokens(markdown) {
  if (!markdown) return 0
  return Math.max(1, Math.ceil(markdown.length / 4))
}

/**
 * Collapse blank lines and trailing spaces so agent context stays compact.
 * @param {string} markdown
 * @returns {string}
 */
export function normalizeMarkdown(markdown) {
  return markdown
    .replace(/[ \t]+\n/g, '\n')
    // Drop accidental leading spaces on prose/links/headings, but keep
    // indented lists (`  -`), blockquotes, and code fences alone.
    .replace(/^[ \t]+(?=[A-Za-z0-9#[*!`])/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n'
}

/**
 * @param {import('node-html-parser').HTMLElement} root
 */
function extractFrontmatter(root) {
  /** @type {Record<string, string>} */
  const fm = {}
  const title =
    metaContent(root, 'name', 'title')
    || textOf(root.querySelector('title'))
    || metaContent(root, 'property', 'og:title')
  const description =
    metaContent(root, 'name', 'description')
    || metaContent(root, 'property', 'og:description')
  const image = metaContent(root, 'property', 'og:image')

  if (title) fm.title = decodeEntities(title)
  if (description) fm.description = decodeEntities(description)
  if (image) fm.image = image
  return fm
}

/**
 * @param {import('node-html-parser').HTMLElement} root
 * @returns {string[]}
 */
function extractJsonLd(root) {
  const blocks = []
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    const raw = script.text.trim()
    if (!raw) continue
    try {
      blocks.push(JSON.stringify(JSON.parse(raw)))
    } catch {
      blocks.push(raw)
    }
  }
  return blocks
}

/**
 * @param {import('node-html-parser').HTMLElement} root
 * @param {string} attr
 * @param {string} value
 */
function metaContent(root, attr, value) {
  const el = root.querySelector(`meta[${attr}="${value}"]`)
  return el?.getAttribute('content')?.trim() || ''
}

/**
 * @param {import('node-html-parser').HTMLElement | null} el
 */
function textOf(el) {
  return el?.text?.replace(/\s+/g, ' ').trim() || ''
}

/**
 * @param {Record<string, string>} fm
 */
function formatFrontmatter(fm) {
  const lines = ['---']
  for (const [key, value] of Object.entries(fm)) {
    lines.push(`${key}: ${yamlEscape(value)}`)
  }
  lines.push('---')
  return lines.join('\n')
}

/**
 * @param {string} value
 */
function yamlEscape(value) {
  if (/[:#{}[\],&*?|>!%@`]/.test(value) || value.includes('\n') || value.includes('"')) {
    return JSON.stringify(value)
  }
  return value
}

/**
 * Resolve href/src against the page URL. Leaves mailto/tel/hash-only alone.
 * @param {string} href
 * @param {string} pageUrl
 */
function resolveUrl(href, pageUrl) {
  const trimmed = (href || '').trim()
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) {
    return trimmed
  }
  try {
    return new URL(trimmed, pageUrl).href
  } catch {
    return trimmed
  }
}

/**
 * @param {import('node-html-parser').HTMLElement} node
 */
function hasBlockChild(node) {
  for (const child of node.childNodes) {
    if (child.nodeType !== 1) continue
    const tag = (child.rawTagName || '').toLowerCase()
    if (BLOCK_TAGS.has(tag) && tag !== 'br') return true
  }
  return false
}

/**
 * @param {import('node-html-parser').Node} node
 * @param {{ pageUrl: string }} context
 * @returns {string}
 */
function renderNode(node, context) {
  if (!node) return ''

  if (node.nodeType === 3) {
    return collapseInlineWhitespace(node.text || '')
  }

  if (node.nodeType !== 1) return ''

  const tag = (node.rawTagName || '').toLowerCase()
  if (!tag || tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'template') {
    return ''
  }

  if (tag === 'br') return '\n'
  if (tag === 'hr') return '\n\n---\n\n'
  if (tag === 'img') {
    const alt = decodeEntities(node.getAttribute('alt') || '')
    const src = resolveUrl(node.getAttribute('src') || '', context.pageUrl)
    if (!src) return alt
    return `![${alt}](${src})`
  }

  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag[1])
    const text = renderInlineChildren(node, context).trim()
    if (!text) return ''
    return `\n\n${'#'.repeat(level)} ${text}\n\n`
  }

  if (tag === 'p' || tag === 'figcaption') {
    const text = renderInlineChildren(node, context).trim()
    return text ? `\n\n${text}\n\n` : ''
  }

  if (tag === 'blockquote') {
    const inner = renderChildren(node, context).trim()
    if (!inner) return ''
    const quoted = inner.split('\n').map((line) => `> ${line}`).join('\n')
    return `\n\n${quoted}\n\n`
  }

  if (tag === 'pre') {
    const code = node.querySelector('code')
    const lang = (code?.getAttribute('class') || '').match(/language-([\w-]+)/)?.[1] || ''
    const text = (code || node).text.replace(/\n$/, '')
    return `\n\n\`\`\`${lang}\n${text}\n\`\`\`\n\n`
  }

  if (tag === 'code') {
    const text = decodeEntities(node.text)
    return `\`${text.replace(/`/g, '\\`')}\``
  }

  if (tag === 'a') {
    const href = resolveUrl(node.getAttribute('href') || '', context.pageUrl)
    const text = renderInlineChildren(node, context).trim() || href
    if (!href) return text
    return `[${text}](${href})`
  }

  if (tag === 'strong' || tag === 'b') {
    const text = renderInlineChildren(node, context).trim()
    return text ? `**${text}**` : ''
  }

  if (tag === 'em' || tag === 'i') {
    const text = renderInlineChildren(node, context).trim()
    return text ? `*${text}*` : ''
  }

  if (tag === 's' || tag === 'del' || tag === 'strike') {
    const text = renderInlineChildren(node, context).trim()
    return text ? `~~${text}~~` : ''
  }

  if (tag === 'ul' || tag === 'ol') {
    const items = []
    let index = 1
    for (const child of node.childNodes) {
      if (child.nodeType !== 1 || (child.rawTagName || '').toLowerCase() !== 'li') continue
      const body = renderInlineChildren(child, context).trim()
      if (!body) continue
      const bullet = tag === 'ol' ? `${index}.` : '-'
      items.push(`${bullet} ${body}`)
      index += 1
    }
    return items.length ? `\n\n${items.join('\n')}\n\n` : ''
  }

  if (tag === 'table') {
    return `\n\n${renderTable(node, context)}\n\n`
  }

  // Text-only containers become paragraphs so sibling divs do not glue.
  if (BLOCK_TAGS.has(tag) || tag === 'body' || tag === 'html') {
    if (!hasBlockChild(node)) {
      const text = renderInlineChildren(node, context).trim()
      return text ? `\n\n${text}\n\n` : ''
    }
    return renderChildren(node, context)
  }

  return renderInlineChildren(node, context)
}

/**
 * @param {import('node-html-parser').HTMLElement} node
 * @param {{ pageUrl: string }} context
 */
function renderChildren(node, context) {
  let out = ''
  for (const child of node.childNodes) out += renderNode(child, context)
  return out
}

/**
 * @param {import('node-html-parser').HTMLElement} node
 * @param {{ pageUrl: string }} context
 */
function renderInlineChildren(node, context) {
  let out = ''
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      out += collapseInlineWhitespace(child.text || '')
      continue
    }
    if (child.nodeType !== 1) continue
    const tag = (child.rawTagName || '').toLowerCase()
    if (tag === 'br') {
      out += ' '
      continue
    }
    if (BLOCK_TAGS.has(tag) && tag !== 'br') {
      const nested = renderInlineChildren(child, context).trim()
      if (nested) out = joinInline(out, nested)
      continue
    }
    out = joinInline(out, renderNode(child, context))
  }
  return out.replace(/[ \t]{2,}/g, ' ')
}

/**
 * Keep adjacent markdown tokens from gluing: `](...)[` → `](...) [`.
 * @param {string} left
 * @param {string} right
 */
function joinInline(left, right) {
  if (!left) return right
  if (!right) return left
  if (/\S$/.test(left) && /^\S/.test(right)) return `${left} ${right}`
  return left + right
}

/**
 * @param {import('node-html-parser').HTMLElement} table
 * @param {{ pageUrl: string }} context
 */
function renderTable(table, context) {
  const rows = []
  for (const tr of table.querySelectorAll('tr')) {
    const cells = []
    for (const cell of tr.childNodes) {
      if (cell.nodeType !== 1) continue
      const tag = (cell.rawTagName || '').toLowerCase()
      if (tag !== 'th' && tag !== 'td') continue
      cells.push(renderInlineChildren(cell, context).trim().replace(/\|/g, '\\|'))
    }
    if (cells.length) rows.push(cells)
  }
  if (rows.length === 0) return ''

  const width = Math.max(...rows.map((r) => r.length))
  const normalized = rows.map((r) => {
    const copy = [...r]
    while (copy.length < width) copy.push('')
    return copy
  })

  const header = normalized[0]
  const body = normalized.slice(1)
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((r) => `| ${r.join(' | ')} |`),
  ]
  return lines.join('\n')
}

/**
 * @param {string} text
 */
function collapseInlineWhitespace(text) {
  return decodeEntities(text).replace(/\s+/g, ' ')
}

/**
 * @param {string} text
 */
function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}
