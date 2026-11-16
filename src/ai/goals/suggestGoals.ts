import { GOAL_REGISTRY } from './registry'
import { explainGoal } from './explain'
import { rolesSatisfied, uniqueRoleColumn } from './matchGoal'
import type { GoalMatch } from './types'
import type { SheetProfile } from '@/ai/types'

/** Profile-only suggestions: goals whose required roles are uniquely filled. */
export function listSuggestedGoals(profile: SheetProfile | null | undefined): GoalMatch[] {
  if (!profile) return []
  const matches: GoalMatch[] = []
  for (const def of GOAL_REGISTRY) {
    if (!rolesSatisfied(def, profile)) continue
    // Same column choice as matchGoal, so a suggestion runs on the column it names.
    const slots = {
      amountColumn: uniqueRoleColumn(profile.columns, 'amount')?.column,
      categoryColumn: uniqueRoleColumn(profile.columns, 'category')?.column,
      dateColumn: uniqueRoleColumn(profile.columns, 'date')?.column,
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
