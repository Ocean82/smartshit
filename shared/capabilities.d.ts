/**
 * Capability catalog types — see capabilities.js for the runtime catalog.
 */

export type CapabilityKind = 'tool' | 'goal' | 'recipe'

export type ParamStrategy =
  | 'none'
  | 'amount_column_desc'
  | 'header_row_bold'
  | 'currency_selection'
  | 'contains_value'
  | 'filter_predicate'
  | 'negatives'
  | 'goal_by_category'

export interface CapabilityDef {
  id: string
  kind: CapabilityKind
  description: string
  examples: string[]
  tool?: string
  goalId?: string
  staticParams?: Record<string, unknown>
  requiresParams?: string[]
  paramStrategy?: ParamStrategy
}

export declare const CAPABILITIES: CapabilityDef[]

export declare function capabilityExamplesMap(): Record<string, string[]>

export declare function capabilityPhrasesHash(
  phrases?: Record<string, string[]>,
): number

export declare function getCapability(id: string): CapabilityDef | undefined
