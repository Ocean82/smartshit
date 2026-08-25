import { GOAL_REGISTRY } from './registry'
import { explainGoal } from './explain'
import { rolesSatisfied } from './matchGoal'
import type { GoalMatch } from './types'
import type { SheetProfile } from '@/ai/types'

/** Profile-only suggestions: goals whose required roles are uniquely filled. */
export function listSuggestedGoals(profile: SheetProfile | null | undefined): GoalMatch[] {
  if (!profile) return []
  const matches: GoalMatch[] = []
  for (const def of GOAL_REGISTRY) {
    if (!rolesSatisfied(def, profile)) continue
    const slots = {
      amountColumn: profile.columns.find((c) => c.role === 'amount')?.column,
      categoryColumn: profile.columns.find((c) => c.role === 'category')?.column,
      dateColumn: profile.columns.find((c) => c.role === 'date')?.column,
    }
    matches.push({
      status: 'matched',
      goal: def,
      slots,
      output: def.defaultOutput,
      explain: explainGoal(def, slots, def.defaultOutput),
    })
  }
  return matches
}
