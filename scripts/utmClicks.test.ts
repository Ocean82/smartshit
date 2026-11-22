import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs script without type declarations
import { summarizeUtmClicks } from './utmClicks.mjs'

const UA = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537.36'
const line = (when: string, target: string, status = 200, ua = UA, method = 'GET') =>
  `203.0.113.7 - - [${when} +0000] "${method} ${target} HTTP/2.0" ${status} 5120 "-" "${ua}"`

describe('summarizeUtmClicks', () => {
  it('counts report-footer visits per day and per source, ignoring everything else', () => {
    const lines = [
      line('21/Nov/2026:10:00:00', '/formula-auditor?utm_source=audit-report&utm_medium=referral&utm_campaign=report-footer'),
      line('21/Nov/2026:11:00:00', '/formula-auditor?utm_source=audit-report&utm_campaign=report-footer', 304),
      line('22/Nov/2026:09:00:00', '/formula-auditor?utm_campaign=report-footer'),
      line('22/Nov/2026:09:01:00', '/formula-auditor'), // no campaign
      line('22/Nov/2026:09:02:00', '/formula-auditor?utm_campaign=newsletter'), // other campaign
      line('22/Nov/2026:09:03:00', '/pricing?utm_campaign=report-footer'), // other page
      line('22/Nov/2026:09:04:00', '/formula-auditor?utm_campaign=report-footer', 404),
      line('22/Nov/2026:09:05:00', '/formula-auditor?utm_campaign=report-footer', 200, UA, 'POST'),
      line('22/Nov/2026:09:06:00', '/formula-auditor?utm_campaign=report-footer', 200, 'Googlebot/2.1 (+http://www.google.com/bot.html)'),
      'not a log line at all',
    ]
    expect(summarizeUtmClicks(lines)).toEqual({
      total: 3,
      byDay: { '2026-11-21': 2, '2026-11-22': 1 },
      bySource: { 'audit-report': 2, '(none)': 1 },
    })
  })

  it('never exposes the visitor address', () => {
    const out = JSON.stringify(summarizeUtmClicks([line('21/Nov/2026:10:00:00', '/formula-auditor?utm_campaign=report-footer')]))
    expect(out).not.toContain('203.0.113.7')
  })

  it('can count another campaign', () => {
    const lines = [line('21/Nov/2026:10:00:00', '/formula-auditor?utm_campaign=newsletter')]
    expect(summarizeUtmClicks(lines, { campaign: 'newsletter' }).total).toBe(1)
  })
})
