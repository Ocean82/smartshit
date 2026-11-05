/**
 * Write the markdown siblings nginx serves for Accept: text/markdown.
 *
 * HTML stays the default. This only refreshes landing/*.md and the
 * x-markdown-tokens counts in landing/smartsht.nginx.conf.
 * Run: npm run markdown:pages
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { htmlToMarkdown } from './lib/htmlToMarkdown.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LANDING_DIR = path.join(ROOT, 'landing')
const NGINX_CONF = path.join(LANDING_DIR, 'smartsht.nginx.conf')

/** Same check as `map $http_accept $wants_markdown { ~*text/markdown 1; }`. */
const MARKDOWN_ACCEPT = /text\/markdown/i

export const PAGES = [
  { htmlFile: 'index.html', markdownFile: 'index.md', tokenMarker: '/index.md' },
  { htmlFile: 'terms.html', markdownFile: 'terms.md', tokenMarker: '/terms.md' },
  { htmlFile: 'privacy.html', markdownFile: 'privacy.md', tokenMarker: '/privacy.md' },
  { htmlFile: 'excel-alternative.html', markdownFile: 'excel-alternative.md', tokenMarker: '/excel-alternative.md' },
  { htmlFile: 'formula-auditor.html', markdownFile: 'formula-auditor.md', tokenMarker: '/formula-auditor.md' },
]

/**
 * @param {string | undefined | null} accept
 * @returns {boolean}
 */
export function wantsMarkdown(accept) {
  return MARKDOWN_ACCEPT.test(accept || '')
}

/**
 * @param {string} [landingDir]
 * @returns {{ htmlFile: string, markdownFile: string, tokenMarker: string, markdown: string, tokens: number }[]}
 */
export function renderLandingMarkdown(landingDir = LANDING_DIR) {
  return PAGES.map((page) => {
    const html = fs.readFileSync(path.join(landingDir, page.htmlFile), 'utf8')
    const { markdown, tokens } = htmlToMarkdown(html)
    return { ...page, markdown, tokens }
  })
}

/**
 * @param {string} conf
 * @param {{ tokenMarker: string, tokens: number }[]} pages
 * @returns {string}
 */
export function applyTokenMarkers(conf, pages) {
  let next = conf
  for (const page of pages) {
    const pattern = tokenMarkerPattern(page.tokenMarker)
    if (!pattern.test(next)) {
      throw new Error(`nginx conf is missing x-markdown-tokens marker for ${page.tokenMarker}`)
    }
    next = next.replace(pattern, `$1${page.tokens}$2`)
  }
  return next
}

/**
 * @param {string} marker
 * @returns {RegExp}
 */
function tokenMarkerPattern(marker) {
  const comment = `# md-tokens:${marker}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(add_header x-markdown-tokens ")\\d+(" always; ${comment})`)
}

/**
 * @param {string} file
 * @param {string} contents
 */
function writeIfChanged(file, contents) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
  if (current === contents) return
  fs.writeFileSync(file, contents)
}

function main() {
  const pages = renderLandingMarkdown()
  for (const page of pages) {
    writeIfChanged(path.join(LANDING_DIR, page.markdownFile), page.markdown)
    console.log(`Wrote ${page.markdownFile} (${page.tokens} tokens)`)
  }
  const conf = fs.readFileSync(NGINX_CONF, 'utf8')
  writeIfChanged(NGINX_CONF, applyTokenMarkers(conf, pages))
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (invokedDirectly) main()
