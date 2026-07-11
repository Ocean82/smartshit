/**
 * Rule: Circular References
 * Detects cells whose formula dependency chains form a cycle.
 * Uses DFS cycle detection on the dependency graph.
 */

import type { AuditRule, AuditFinding, AuditContext } from '../types'
import { findingId, extractCellRefs, cellToRef } from '../utils'

export const circularRefsRule: AuditRule = {
  id: 'circular-refs',
  name: 'Circular References',
  description: 'Detects circular formula dependencies',
  defaultSeverity: 'critical',

  run(ctx: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = []

    // Build adjacency list: cell → cells it references
    const deps = new Map<string, string[]>()
    const formulaMap = new Map<string, string>()

    for (const cell of ctx.formulaCells) {
      if (!cell.formula) continue
      const refs = extractCellRefs(cell.formula)
      deps.set(cell.cellId, refs)
      formulaMap.set(cell.cellId, cell.formula)
    }

    // DFS cycle detection
    const WHITE = 0 // unvisited
    const GRAY = 1  // in current path
    const BLACK = 2 // fully processed

    const color = new Map<string, number>()
    const reportedCycles = new Set<string>()

    function dfs(node: string, path: string[]): string[] | null {
      color.set(node, GRAY)
      path.push(node)

      const neighbors = deps.get(node) ?? []
      for (const neighbor of neighbors) {
        const neighborColor = color.get(neighbor) ?? WHITE

        if (neighborColor === GRAY) {
          // Found a cycle — extract just the cycle portion
          const cycleStart = path.indexOf(neighbor)
          if (cycleStart >= 0) {
            return path.slice(cycleStart)
          }
          return [neighbor, node]
        }

        if (neighborColor === WHITE && deps.has(neighbor)) {
          const cycle = dfs(neighbor, path)
          if (cycle) return cycle
        }
      }

      path.pop()
      color.set(node, BLACK)
      return null
    }

    for (const node of deps.keys()) {
      if ((color.get(node) ?? WHITE) !== WHITE) continue

      const cycle = dfs(node, [])
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
