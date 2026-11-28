/**
 * Rule: Circular References
 * Detects cells whose formula dependency chains form a cycle.
 * Uses DFS cycle detection on the dependency graph.
 *
 * With workbook context the graph spans every sheet, so a loop that runs
 * through another sheet (Alpha!A1 -> Beta!A1 -> Alpha!A1) is found. Only
 * cycles that include a cell on the audited sheet are reported.
 */

import type { AuditRule, AuditFinding, AuditContext } from '../types'
import {
  findingId,
  cellToRef,
  buildFormulaCellIndex,
  indexFormulaCells,
  referencedFormulaNodes,
  MAX_REFERENCE_EDGES,
  type WorkbookFormulaIndex,
} from '../utils'

export const circularRefsRule: AuditRule = {
  id: 'circular-refs',
  name: 'Circular References',
  description: 'Detects circular formula dependencies',
  defaultSeverity: 'critical',

  run(ctx: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = []
    const ownName = ctx.sheetName
    const ownKey = ownName.toLowerCase()

    // Formula-cell index per sheet (only formula cells can close a cycle), plus
    // the formulas of the other sheets. The audited sheet comes from the audit
    // context, which already holds its cells.
    const sheets: WorkbookFormulaIndex = new Map([[ownKey, { name: ownName, index: buildFormulaCellIndex(ctx.formulaCells) }]])
    const otherFormulas: Array<{ sheet: string; cellId: string; formula: string }> = []
    for (const other of ctx.workbook?.sheets ?? []) {
      if (other.name.toLowerCase() === ownKey) continue
      sheets.set(other.name.toLowerCase(), { name: other.name, index: indexFormulaCells(other.cells) })
      for (const [cellId, cell] of Object.entries(other.cells)) {
        if (cell.formula) otherFormulas.push({ sheet: other.name, cellId, formula: cell.formula.replace(/^=/, '') })
      }
    }

    // Adjacency list: formula cell -> formula cells it references ("Sheet!A1" keys).
    const deps = new Map<string, string[]>()
    let budget = MAX_REFERENCE_EDGES
    const addDeps = (sheet: string, cellId: string, formula: string) => {
      const refs = budget > 0 ? referencedFormulaNodes(formula, sheet, sheets, budget) : []
      budget -= refs.length
      deps.set(`${sheet}!${cellId}`, refs)
    }
    for (const cell of ctx.formulaCells) if (cell.formula) addDeps(ownName, cell.cellId, cell.formula)
    for (const { sheet, cellId, formula } of otherFormulas) addDeps(sheet, cellId, formula)

    // DFS cycle detection
    const WHITE = 0 // unvisited
    const GRAY = 1  // in current path
    const BLACK = 2 // fully processed
    const color = new Map<string, number>()
    const reportedCycles = new Set<string>()

    // Iterative so long fill-down chains can't overflow the call stack.
    function findCycle(start: string): string[] | null {
      const path = [start]
      const nextNeighbor = [0]
      color.set(start, GRAY)

      while (path.length > 0) {
        const top = path.length - 1
        const node = path[top]
        const neighbors = deps.get(node) ?? []

        if (nextNeighbor[top] >= neighbors.length) {
          color.set(node, BLACK)
          path.pop()
          nextNeighbor.pop()
          continue
        }

        const neighbor = neighbors[nextNeighbor[top]++]
        const neighborColor = color.get(neighbor) ?? WHITE
        if (neighborColor === GRAY) {
          const cycle = path.slice(path.indexOf(neighbor))
          for (const n of path) color.set(n, BLACK)
          return cycle
        }
        if (neighborColor === WHITE && deps.has(neighbor)) {
          color.set(neighbor, GRAY)
          path.push(neighbor)
          nextNeighbor.push(0)
        }
      }
      return null
    }

    const ownPrefix = `${ownName}!`
    const isOwn = (node: string) => node.startsWith(ownPrefix)
    const label = (node: string) => (isOwn(node) ? node.slice(ownPrefix.length) : node)

    // Start from the audited sheet's cells so unrelated cycles elsewhere cost nothing to report.
    for (const node of deps.keys()) {
      if (!isOwn(node) || (color.get(node) ?? WHITE) !== WHITE) continue
      const cycle = findCycle(node)
      if (!cycle || cycle.length === 0) continue
      // ponytail: one cycle per DFS start, so a second loop behind the same path is found only
      // after an edit breaks the first. Upgrade path: Tarjan's SCC if multi-loop reports matter.
      // A cycle found from here may live entirely on another sheet.
      if (!cycle.some(isOwn)) continue

      // Deduplicate: sort the cycle members and use as a key
      const cycleKey = [...cycle].sort().join(',')
      if (reportedCycles.has(cycleKey)) continue
      reportedCycles.add(cycleKey)

      const names = cycle.map(label)
      const cycleDisplay = names.join(' → ') + ' → ' + names[0]
      const cells = cycle.filter(isOwn).map((n) => {
        const cellId = n.slice(ownPrefix.length)
        const ref = cellToRef(cellId)
        return { cellId, row: ref.row, col: ref.col }
      })

      findings.push({
        id: findingId(),
        ruleId: 'circular-refs',
        severity: 'critical',
        title: `Circular reference: ${cycleDisplay}`,
        message: `Cells ${names.join(', ')} form a circular dependency. This prevents correct calculation.`,
        cells,
        suggestion: 'Break the circular chain by removing or restructuring one of the dependencies',
        autoFixable: false,
      })
    }

    return findings
  },
}
