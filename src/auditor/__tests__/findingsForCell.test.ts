import { describe, it, expect } from 'vitest'
import { findingsForCell } from '../utils'
import type { AuditFinding } from '../types'

function finding(id: string, cellIds: string[]): AuditFinding {
  return {
    id,
    ruleId: 'test',
    severity: 'medium',
    title: id,
    message: id,
    cells: cellIds.map((cellId, i) => ({ cellId, row: i, col: i })),
    autoFixable: false,
  }
}

describe('findingsForCell', () => {
  const findings = [finding('f1', ['A1']), finding('f2', ['B2', 'A1']), finding('f3', ['C3'])]

  it('returns every finding that references the cell, in order', () => {
    expect(findingsForCell(findings, 'A1').map((f) => f.id)).toEqual(['f1', 'f2'])
  })

  it('matches only exact cell ids', () => {
    expect(findingsForCell(findings, 'A').map((f) => f.id)).toEqual([])
    expect(findingsForCell(findings, 'A10').map((f) => f.id)).toEqual([])
  })

  it('returns an empty list for a cell with no findings', () => {
    expect(findingsForCell(findings, 'Z9')).toEqual([])
  })
})
