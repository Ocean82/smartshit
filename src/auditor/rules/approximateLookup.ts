/**
 * Rule: Approximate Lookup
 * Detects VLOOKUP/HLOOKUP calls that match approximately (last argument
 * missing, TRUE or 1) and MATCH calls that default to sorted-order matching.
 * Approximate matching on unsorted data returns a wrong row without any error,
 * and leaving the argument out is the usual way it happens by accident.
 *
 * No automatic fix: switching to exact match changes which row is returned.
 */

import type { AuditRule, AuditFinding, AuditContext } from '../types'
import { findingId, findFunctionCalls } from '../utils'

const APPROXIMATE_VALUES = new Set(['TRUE', '1', '-1'])

/** Whether this lookup call matches approximately, and how to describe it. */
function approximateReason(name: string, args: string[]): string | null {
  const isLookup = name === 'VLOOKUP' || name === 'HLOOKUP'
  const modeIndex = isLookup ? 3 : 2
  const required = isLookup ? 3 : 2
  if (args.length < required) return null // malformed; the engine reports it
  const mode = args[modeIndex]?.toUpperCase()
  if (mode === undefined) {
    return isLookup ? 'leaves out the match-mode argument, so it matches approximately' : 'leaves out the match type, so it assumes sorted data'
  }
  if (APPROXIMATE_VALUES.has(mode)) return `uses ${args[modeIndex]} for the match mode, which matches approximately`
  return null
}

export const approximateLookupRule: AuditRule = {
  id: 'approximate-lookup',
  name: 'Approximate Lookup',
  description: 'Detects lookups that match approximately, often by accident',
  defaultSeverity: 'medium',

  run(ctx: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = []

    for (const cell of ctx.formulaCells) {
      if (!cell.formula) continue
      for (const call of findFunctionCalls(cell.formula, ['VLOOKUP', 'HLOOKUP', 'MATCH'])) {
        const reason = approximateReason(call.name, call.args)
        if (!reason) continue
        findings.push({
          id: findingId(),
          ruleId: 'approximate-lookup',
          severity: 'medium',
          title: `Approximate ${call.name} in ${cell.cellId}`,
          message: `${cell.cellId} ${call.name} ${reason}. If the lookup range is not sorted ascending, it can return the wrong row with no error. Formula: =${cell.formula}`,
          cells: [{ cellId: cell.cellId, row: cell.row, col: cell.col }],
          suggestion: call.name === 'MATCH'
            ? 'Add 0 as the third argument for an exact match, unless the range is sorted and a nearest-value match is intended'
            : 'Add FALSE as the last argument for an exact match, unless the range is sorted and a nearest-value match is intended',
          autoFixable: false,
        })
        break // one finding per cell
      }
    }

    return findings
  },
}
