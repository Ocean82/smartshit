import type { GoalDef, GoalOutput, GoalSlots } from './types'

function slotLine(label: string, column: string | undefined): string | null {
  if (!column) return null
  return `${label} = ${column}`
}

export function explainGoal(goal: GoalDef, slots: GoalSlots, output: GoalOutput): string {
  const using = [
    slotLine('Amount column', slots.amountColumn),
    slotLine('Category column', slots.categoryColumn),
    slotLine('Date column', slots.dateColumn),
    slots.categoryValue ? `Filter = ${slots.categoryValue}` : null,
  ].filter(Boolean)

  const usingBlock = using.length > 0 ? `Using:\n${using.join('\n')}` : 'Using: detected columns'
  return `Goal: ${goal.title}\n${usingBlock}\nOutput: ${outputLabel(goal, output)}`
}

function outputLabel(goal: GoalDef, output: GoalOutput): string {
  if (output === 'formula') return `${goal.title} formula`
  if (output === 'chart') return `${goal.title} chart`
  return `${goal.title} summary`
}
