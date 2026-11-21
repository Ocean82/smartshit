/**
 * Spreadsheet Auditor — shareable report.
 *
 * Builds one self-contained HTML file from an AuditResult: no scripts beyond a
 * print button, no network, no external assets (the logo is inlined). It is
 * generated and downloaded in the browser, so the "scan stays on your machine"
 * promise holds. The footer links back to the public auditor page.
 */

import type { AuditFinding, AuditResult, Severity } from './types'

/** Where the footer sends the reader. UTM tags let analytics attribute the clicks. */
export const REPORT_LINK =
  'https://smartsht.com/formula-auditor?utm_source=audit-report&utm_medium=referral&utm_campaign=report-footer'

/** Keeps a report with thousands of findings openable. */
const MAX_FINDINGS_RENDERED = 200

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info']
const SEVERITY_COLORS: Record<Severity, { fg: string; bg: string }> = {
  critical: { fg: '#9f1239', bg: '#ffe4e6' },
  high: { fg: '#c2410c', bg: '#ffedd5' },
  medium: { fg: '#a16207', bg: '#fef9c3' },
  low: { fg: '#1d4ed8', bg: '#dbeafe' },
  info: { fg: '#475569', bg: '#f1f5f9' },
}

export interface AuditReportOptions {
  workbookName: string
  /** `data:` URI for the logo. Omit and the header is text only. */
  logoDataUri?: string
  /** True if the sheet changed after this scan. Adds a notice. */
  stale?: boolean
  now?: Date
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function scoreColor(score: number): string {
  return score >= 80 ? '#047857' : score >= 50 ? '#b45309' : '#be123c'
}

function renderFinding(f: AuditFinding): string {
  const c = SEVERITY_COLORS[f.severity]
  const cells = f.cells.map((cell) => `<code>${escapeHtml(cell.cellId)}</code>`).join(' ')
  return `
    <section class="finding">
      <div class="finding-head">
        <span class="badge" style="color:${c.fg};background:${c.bg}">${f.severity}</span>
        <h3>${escapeHtml(f.title)}</h3>
      </div>
      <p>${escapeHtml(f.message)}</p>
      ${f.suggestion ? `<p class="suggestion"><strong>Suggested:</strong> ${escapeHtml(f.suggestion)}</p>` : ''}
      <p class="cells">Cells: ${cells}</p>
    </section>`
}

export function buildAuditReportHtml(result: AuditResult, options: AuditReportOptions): string {
  const now = options.now ?? new Date()
  const date = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const dismissed = result.dismissed ?? []
  const shown = result.findings.slice(0, MAX_FINDINGS_RENDERED)
  const hidden = result.findings.length - shown.length

  const counts = SEVERITIES
    .map((s) => ({ s, n: result.findings.filter((f) => f.severity === s).length }))
    .filter(({ n }) => n > 0)
    .map(({ s, n }) => {
      const c = SEVERITY_COLORS[s]
      return `<span class="badge" style="color:${c.fg};background:${c.bg}">${n} ${s}</span>`
    })
    .join(' ')

  const findingsHtml = result.findings.length === 0
    ? '<p class="clean">No issues found in the checks this scan runs.</p>'
    : shown.map(renderFinding).join('\n') +
      (hidden > 0 ? `<p class="meta">…and ${hidden} more findings not shown.</p>` : '')

  const dismissedHtml = dismissed.length === 0
    ? ''
    : `<h2>Reviewed and dismissed (${dismissed.length})</h2>
       <ul class="dismissed">${dismissed.map((f) => `<li>${escapeHtml(f.title)}</li>`).join('')}</ul>`

  const logo = options.logoDataUri?.startsWith('data:image/')
    ? `<img src="${escapeHtml(options.logoDataUri)}" alt="smartsh!t" width="44" height="44">`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Spreadsheet audit report — ${escapeHtml(options.workbookName)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1e293b; max-width: 820px; margin: 0 auto; padding: 40px 24px; line-height: 1.5; }
  header { display: flex; align-items: center; gap: 14px; margin-bottom: 24px; }
  header img { border-radius: 10px; }
  h1 { font-size: 22px; }
  h2 { font-size: 16px; margin: 28px 0 10px; }
  .meta { font-size: 13px; color: #64748b; }
  .score { display: flex; align-items: baseline; gap: 14px; padding: 18px 20px; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 8px; }
  .score strong { font-size: 40px; line-height: 1; color: ${scoreColor(result.score)}; }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
  .notice { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; padding: 8px 12px; border-radius: 8px; font-size: 13px; margin: 12px 0; }
  .finding { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; break-inside: avoid; }
  .finding-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .finding h3 { font-size: 14px; }
  .finding p { font-size: 13px; margin-top: 4px; word-break: break-word; }
  .suggestion { color: #1e40af; }
  .cells code, code { font-size: 12px; background: #f1f5f9; border-radius: 4px; padding: 1px 5px; }
  .clean { padding: 14px; background: #ecfdf5; border-radius: 10px; color: #065f46; font-size: 14px; }
  .dismissed { font-size: 13px; color: #475569; padding-left: 20px; }
  .scope { font-size: 12px; color: #64748b; margin-top: 28px; }
  footer { margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 13px; color: #64748b; }
  footer a { color: #1d4ed8; font-weight: 600; text-decoration: none; }
  footer a:hover { text-decoration: underline; }
  button { margin-top: 14px; padding: 8px 16px; background: #1e293b; color: #fff; border: 0; border-radius: 8px; font-size: 13px; cursor: pointer; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style>
</head>
<body>
<header>
  ${logo}
  <div>
    <h1>Spreadsheet audit report</h1>
    <p class="meta">${escapeHtml(options.workbookName)} · sheet “${escapeHtml(result.sheetName)}” · ${date}</p>
  </div>
</header>

<div class="score">
  <strong>${result.score}<span style="font-size:16px;opacity:.5">/100</span></strong>
  <div>
    <div>${counts || '<span class="badge" style="color:#047857;background:#d1fae5">no issues</span>'}</div>
    <p class="meta">${result.totalCells} cells checked · ${result.formulaCells} formulas</p>
  </div>
</div>
${options.stale ? '<p class="notice">The sheet was edited after this scan, so some findings may no longer apply.</p>' : ''}

<h2>Findings (${result.findings.length})</h2>
${findingsHtml}
${dismissedHtml}

<p class="scope">This scan checks formula structure and values: skipped ranges, pattern breaks, errors, circular references, outliers and hardcoded numbers. It cannot confirm that the business logic or the input data is right.</p>

<footer>
  Checked with <strong>smartsh!t</strong> · The scan ran in the browser and the file was not uploaded.<br>
  <a href="${REPORT_LINK}" target="_blank" rel="noopener">Audit your own spreadsheet free at smartsht.com/formula-auditor</a>
  <div class="no-print"><button type="button" onclick="window.print()">Print / Save as PDF</button></div>
</footer>
</body>
</html>`
}

/** Logo as a data URI, or undefined if it can't be loaded (the report still works). */
async function loadLogoDataUri(): Promise<string | undefined> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}pwa-icon-192.png`)
    if (!res.ok) return undefined
    const blob = await res.blob()
    return await new Promise<string | undefined>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : undefined)
      reader.onerror = () => resolve(undefined)
      reader.readAsDataURL(blob)
    })
  } catch {
    return undefined
  }
}

function safeFileName(name: string): string {
  return name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'workbook'
}

/** Build the report and download it as an .html file. */
export async function exportAuditReport(
  result: AuditResult,
  options: Pick<AuditReportOptions, 'workbookName' | 'stale'>,
): Promise<void> {
  const html = buildAuditReportHtml(result, { ...options, logoDataUri: await loadLogoDataUri() })
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `audit-report-${safeFileName(options.workbookName)}.html`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
