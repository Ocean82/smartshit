/**
 * Rule: Circular References
 * Detects cells whose formula dependency chains form a cycle.
 * Uses DFS cycle detection on the dependency graph.
 */

import type { AuditRule, AuditFinding, AuditContext } from '../types'
import {
  findingId,
  cellToRef,
  buildFormulaCellIndex,
  referencedFormulaCells,
  MAX_REFERENCE_EDGES,
} from '../utils'

export const circularRefsRule: AuditRule = {
  id: 'circular-refs',
  name: 'Circular References',
  description: 'Detects circular formula dependencies',
  defaultSeverity: 'critical',

  run(ctx: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = []

    // Build adjacency list: formula cell → formula cells it references
    // (only formula cells can close a cycle).
    const index = buildFormulaCellIndex(ctx.formulaCells)
    const deps = new Map<string, string[]>()
    let budget = MAX_REFERENCE_EDGES

    for (const cell of ctx.formulaCells) {
      if (!cell.formula) continue
      const refs = budget > 0 ? referencedFormulaCells(cell.formula, ctx.sheetName, index, budget) : []
      budget -= refs.length
      deps.set(cell.cellId, refs)
    }

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

    for (const node of deps.keys()) {
      if ((color.get(node) ?? WHITE) !== WHITE) continue

      const cycle = findCycle(node)
      if (cycle && cycle.length > 0) {
        // Deduplicate: sort the cycle members and use as a key
        const cycleKey = [...cycle].sort().join(',')
        if (reportedCycles.has(cycleKey)) continue
        reportedCycles.add(cycleKey)

        const cycleDisplay = cycle.join(' → ') + ' → ' + cycle[0]
        const cells = cycle.map((cellId) => {
          const ref = cellToRef(cellId)
          return { cellId, row: ref.row, col: ref.col }
        })

        findings.push({
          id: findingId(),
          ruleId: 'circular-refs',
          severity: 'critical',
          title: `Circular reference: ${cycleDisplay}`,
          message: `Cells ${cycle.join(', ')} form a circular dependency. This prevents correct calculation.`,
          cells,
          suggestion: 'Break the circular chain by removing or restructuring one of the dependencies',
          autoFixable: false,
        })
      }
    }

    return findings
  },
}
