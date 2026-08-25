import type { GoalDef, GoalId } from './types'

export const GOAL_REGISTRY: GoalDef[] = [
  {
    id: 'total',
    title: 'Total',
    requiredRoles: ['amount'],
    optionalRoles: [],
    outputs: ['formula', 'summary'],
    defaultOutput: 'formula',
  },
  {
    id: 'by_category',
    title: 'By Category',
    requiredRoles: ['amount', 'category'],
    optionalRoles: [],
    outputs: ['chart', 'summary', 'formula'],
    defaultOutput: 'chart',
  },
  {
    id: 'by_month',
    title: 'By Month',
    requiredRoles: ['amount', 'date'],
    optionalRoles: ['category'],
    outputs: ['chart', 'summary', 'formula'],
    defaultOutput: 'chart',
  },
]

export function getGoalDef(id: GoalId): GoalDef {
  const def = GOAL_REGISTRY.find((goal) => goal.id === id)
  if (!def) throw new Error(`Unknown goal: ${id}`)
  return def
}
