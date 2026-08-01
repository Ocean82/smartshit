export type IntentType =
  | 'read'
  | 'analyze'
  | 'write'
  | 'format'
  | 'create_chart'
  | 'create_formula'
  | 'summarize'
  | 'filter'
  | 'sort'
  | 'clean'
  | 'budget'
  | 'report'
  | 'compare'
  | 'find'
  | 'calculate'
  | 'export'
  | 'chat'
  | 'unknown'

export type EntityType = 'column' | 'sheet' | 'number' | 'operator' | 'range'

export interface ExtractedEntity {
  type: EntityType
  value: string | number
  originalText: string
  resolved: true
}

export interface UnresolvedEntity {
  type: EntityType
  originalText: string
  resolved: false
  reason: 'not_found'
}

export interface AmbiguousEntity {
  type: EntityType
  originalText: string
  resolved: false
  reason: 'ambiguous'
  candidates: string[] // up to 5
}

export type Entity = ExtractedEntity | UnresolvedEntity | AmbiguousEntity

export interface UserIntent {
  intentType: IntentType
  targetSheet?: string
  targetColumns: string[]
  targetRows?: string
  filters: Record<string, unknown>
  parameters: Record<string, unknown>
  rawQuery: string
  confidence: number

  // NLP metadata (optional, backward-compatible)
  routingSource?: 'nlp' | 'llm' | 'regex'
  entities?: Entity[]
  unresolvedEntities?: Array<UnresolvedEntity | AmbiguousEntity>
}

export interface IntentDeserializationError {
  success: false
  error: 'parse_failure' | 'schema_validation_failure'
  message: string
  raw: string
}

export interface ActTemplateAction {
  tool: string
  params: Record<string, unknown>
  description: string
}

export interface ActTemplateResult {
  message: string
  actions: ActTemplateAction[]
}
