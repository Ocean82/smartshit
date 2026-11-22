import { describe, expect, it } from 'vitest'
import { buildAuditReportHtml, REPORT_LINK } from '../report'
import type { AuditFinding, AuditResult } from '../types'

function finding(over: Partial<AuditFinding> = {}): AuditFinding {
  return {
    id: 'f1',
    ruleId: 'range-gaps',
    severity: 'high',
    title: 'Range may exclude adjacent data in C1',
    message: 'C1 uses A2:A3 but A4 is excluded.',
    cells: [{ cellId: 'C1', row: 0, col: 2 }],
    suggestion: 'Extend range to A2:A4',
    autoFixable: true,
    ...over,
  }
}

function result(over: Partial<AuditResult> = {}): AuditResult {
  return {
    timestamp: 1,
    durationMs: 1,
    sheetId: 's1',
    sheetName: 'Budget',
    totalCells: 40,
    formulaCells: 8,
    findings: [finding()],
    score: 90,
    summary: '',
    ...over,
  }
}

describe('buildAuditReportHtml', () => {
  it('includes the score, the finding and the tracked footer link', () => {
    const html = buildAuditReportHtml(result(), { workbookName: 'Q3 Plan' })
    expect(html).toContain('90')
    expect(html).toContain('Range may exclude adjacent data in C1')
    expect(html).toContain('Q3 Plan')
    expect(html).toContain(`href="${REPORT_LINK}"`)
    expect(REPORT_LINK).toMatch(/^https:\/\/smartsht\.com\/formula-auditor\?utm_source=audit-report/)
  })

  it('escapes user-controlled text so a formula cannot inject markup', () => {
    const evil = '<img src=x onerror=alert(1)>'
    const html = buildAuditReportHtml(
      result({ sheetName: evil, findings: [finding({ message: `=${evil}`, title: evil })] }),
      { workbookName: evil },
    )
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
  })

  it('only inlines data:image logos', () => {
    const ok = buildAuditReportHtml(result(), { workbookName: 'w', logoDataUri: 'data:image/png;base64,AAAA' })
    expect(ok).toContain('src="data:image/png;base64,AAAA"')
    const bad = buildAuditReportHtml(result(), { workbookName: 'w', logoDataUri: 'javascript:alert(1)' })
    expect(bad).not.toContain('javascript:')
  })

  it('lists dismissed findings separately and handles a clean sheet', () => {
    const html = buildAuditReportHtml(result({ findings: [], dismissed: [finding({ title: 'Dismissed one' })] }), { workbookName: 'w' })
    expect(html).toContain('No issues found')
    expect(html).toContain('Reviewed and dismissed (1)')
    expect(html).toContain('Dismissed one')
  })

  it('caps rendered findings and says how many were left out', () => {
    const many = Array.from({ length: 230 }, (_, i) => finding({ id: String(i), title: `T${i}` }))
    const html = buildAuditReportHtml(result({ findings: many }), { workbookName: 'w' })
    expect(html).toContain('and 30 more findings not shown')
    expect(html).not.toContain('T229<')
  })

  it('omits the footer and link for Pro but keeps the print button', () => {
    const html = buildAuditReportHtml(result(), { workbookName: 'w', showFooterLink: false })
    expect(html).not.toContain(REPORT_LINK)
    expect(html).not.toContain('Checked with')
    expect(html).toContain('window.print()')
    expect(buildAuditReportHtml(result(), { workbookName: 'w', showFooterLink: true })).toContain(REPORT_LINK)
  })

  it('flags a stale scan', () => {
    expect(buildAuditReportHtml(result(), { workbookName: 'w', stale: true })).toContain('edited after this scan')
  })
})
