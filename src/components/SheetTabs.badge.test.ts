import { describe, it, expect } from 'vitest'
import { auditBadgeColor, auditBadgeTitle } from './SheetTabs'
import type { AuditResult } from '@/auditor/types'

function result(score: number, findingCount: number): AuditResult {
  return {
    timestamp: 0,
    durationMs: 0,
    sheetId: 's1',
    sheetName: 'Sheet1',
    totalCells: 10,
    formulaCells: 1,
    findings: Array.from({ length: findingCount }, (_, i) => ({
      id: `f${i}`,
      ruleId: 'r',
      severity: 'low',
      title: 't',
      message: 'm',
      cells: [],
      autoFixable: false,
    })),
    score,
    summary: '',
  }
}

describe('audit badge helpers', () => {
  it('maps score bands to colours', () => {
    expect(auditBadgeColor(100, false)).toContain('success')
    expect(auditBadgeColor(90, false)).toContain('success')
    expect(auditBadgeColor(89, false)).toContain('warning')
    expect(auditBadgeColor(70, false)).toContain('warning')
    expect(auditBadgeColor(69, false)).toContain('danger')
  })

  it('greys out a stale audit regardless of score', () => {
    expect(auditBadgeColor(100, true)).toBe('var(--neutral-300)')
  })

  it('describes the score, issue count, and staleness', () => {
    expect(auditBadgeTitle(result(87, 2), false)).toBe('Audit score 87/100 · 2 issues')
    expect(auditBadgeTitle(result(100, 1), true)).toBe('Audit score 100/100 · 1 issue · stale')
  })
})
