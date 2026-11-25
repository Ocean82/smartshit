#!/usr/bin/env node
/**
 * Count visits that came from the audit report footer link, from the web
 * server's existing access logs. No cookies, no scripts on the page, no third
 * party: the footer link carries ?utm_campaign=report-footer and nginx already
 * logs the request line (disclosed in the privacy policy as server logs, kept
 * 30 days).
 *
 * Privacy: the IP address and any other visitor identifier are never read or
 * printed, only the date. Unique-visitor counts are deliberately not offered.
 * The output is aggregate counts, which are safe to keep after the logs rotate,
 * so run this monthly and save the numbers.
 *
 *   node scripts/utmClicks.mjs /var/log/nginx/access.log [more.log other.log.gz]
 *   node scripts/utmClicks.mjs access.log --campaign=report-footer --json
 */
import fs from 'node:fs'
import zlib from 'node:zlib'
import { pathToFileURL, URLSearchParams } from 'node:url'

const PAGE_PATH = '/formula-auditor'
const BOT_UA = /bot|crawl|spider|slurp|preview|headless|monitor|curl|wget|python|go-http|java\//i

// nginx "combined": addr - user [time] "METHOD path HTTP/x" status bytes "referer" "user-agent"
// The address is skipped on purpose.
const LINE = /^\S+ \S+ \S+ \[(\d{2})\/(\w{3})\/(\d{4}):[^\]]*\] "(\w+) (\S+) [^"]*" (\d{3}) \S+ "[^"]*" "([^"]*)"/

const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' }

/**
 * Parse one nginx "combined" access-log line. The address is skipped on purpose.
 * @param {string} line
 * @returns {{ day: string, month: string, year: string, method: string, target: string, status: string, userAgent: string } | null}
 */
export function parseAccessLine(line) {
  const m = LINE.exec(line)
  if (!m) return null
  const [, day, month, year, method, target, status, userAgent] = m
  return { day, month, year, method, target, status, userAgent }
}

/**
 * @param {Iterable<string>} lines access-log lines
 * @param {{ campaign?: string }} [options]
 * @returns {{ total: number, byDay: Record<string, number>, bySource: Record<string, number> }}
 */
export function summarizeUtmClicks(lines, { campaign = 'report-footer' } = {}) {
  const byDay = {}
  const bySource = {}
  let total = 0
  for (const line of lines) {
    const entry = parseAccessLine(line)
    if (!entry) continue
    const { day, month, year, method, target, status, userAgent } = entry
    if (method !== 'GET' || (status !== '200' && status !== '304')) continue
    const [path, query = ''] = target.split('?')
    if (path !== PAGE_PATH) continue
    const params = new URLSearchParams(query)
    if (params.get('utm_campaign') !== campaign) continue
    if (BOT_UA.test(userAgent)) continue
    const key = `${year}-${MONTHS[month] ?? '??'}-${day}`
    byDay[key] = (byDay[key] ?? 0) + 1
    const source = params.get('utm_source') ?? '(none)'
    bySource[source] = (bySource[source] ?? 0) + 1
    total++
  }
  return { total, byDay, bySource }
}
function readLines(file) {
  const raw = fs.readFileSync(file)
  const text = file.endsWith('.gz') ? zlib.gunzipSync(raw).toString('utf8') : raw.toString('utf8')
  return text.split(/\r?\n/)
}

function main(argv) {
  const files = argv.filter((a) => !a.startsWith('--'))
  const flag = (name) => argv.find((a) => a.startsWith(`--${name}`))
  const campaign = flag('campaign')?.split('=')[1] ?? 'report-footer'
  if (files.length === 0) {
    console.error('Usage: node scripts/utmClicks.mjs <access.log> [more logs] [--campaign=name] [--json]')
    process.exit(2)
  }
  const summary = summarizeUtmClicks(files.flatMap(readLines), { campaign })
  if (flag('json')) {
    console.log(JSON.stringify({ campaign, ...summary }, null, 2))
    return
  }
  console.log(`Visits to ${PAGE_PATH} from utm_campaign=${campaign}: ${summary.total}`)
  for (const day of Object.keys(summary.byDay).sort()) console.log(`  ${day}  ${summary.byDay[day]}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2))
