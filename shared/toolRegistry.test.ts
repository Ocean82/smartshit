import { describe, expect, it } from 'vitest'
import { parseAgentResponse } from '../server/src/parseResponse.js'
import {
  TOOL_REGISTRY,
  MUTATION_TOOL_NAMES,
  ACTION_TOOL_NAMES,
  TEMPLATE_TOOL_NAMES,
  getToolDefinition,
  resolveToolName,
  formatToolsForPrompt,
} from './toolRegistry'

describe('shared toolRegistry', () => {
  it('has unique tool names', () => {
    const names = TOOL_REGISTRY.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('every alias points to an existing canonical tool', () => {
    for (const tool of TOOL_REGISTRY) {
      if (!tool.aliasFor) continue
      const target = getToolDefinition(tool.aliasFor)
      expect(target, `${tool.name} → ${tool.aliasFor}`).toBeDefined()
      expect(target?.aliasFor).toBeUndefined()
    }
  })

  it('format_cells schema includes range, fontColor, and condition', () => {
    const def = getToolDefinition('format_cells')
    expect(def).toBeDefined()
    const paramNames = def!.params.map((p) => p.name)
    expect(paramNames).toContain('range')
    expect(paramNames).toContain('fontColor')
    expect(paramNames).toContain('bgColor')
    expect(paramNames).toContain('condition')
  })

  it('resolves aliases to format_cells', () => {
    expect(resolveToolName('format_range')).toBe('format_cells')
    expect(resolveToolName('conditional_format')).toBe('format_cells')
    expect(resolveToolName('format_cells')).toBe('format_cells')
    expect(resolveToolName('sort_sheet')).toBe('sort_sheet')
  })

  it('excludes read-only and query tools from action tool names', () => {
    expect(ACTION_TOOL_NAMES).not.toContain('find_max')
    expect(ACTION_TOOL_NAMES).not.toContain('find_min')
    expect(ACTION_TOOL_NAMES).not.toContain('analyze_data')
    expect(ACTION_TOOL_NAMES).not.toContain('aggregate')
    expect(ACTION_TOOL_NAMES).not.toContain('top_n')
    expect(ACTION_TOOL_NAMES).not.toContain('summary')
    expect(ACTION_TOOL_NAMES).not.toContain('find_duplicates')
  })

  it('action tools are the union of mutate and template tools', () => {
    expect(new Set(ACTION_TOOL_NAMES)).toEqual(
      new Set([...MUTATION_TOOL_NAMES, ...TEMPLATE_TOOL_NAMES]),
    )
  })

  it('mutation tools include format_cells, filter, and both aliases', () => {
    expect(MUTATION_TOOL_NAMES).toContain('format_cells')
    expect(MUTATION_TOOL_NAMES).toContain('format_range')
    expect(MUTATION_TOOL_NAMES).toContain('conditional_format')
    expect(MUTATION_TOOL_NAMES).toContain('filter')
  })

  it('server allowlist accepts registry action tools and drops query-only tools', () => {
    const raw = JSON.stringify({
      message: 'ok',
      actions: [
        { tool: 'format_cells', params: { fontColor: '#FF0000' }, description: 'Red text' },
        { tool: 'aggregate', params: { column: 'B', agg: 'sum' }, description: 'Sum B' },
        { tool: 'top_n', params: { column: 'B', n: 5 }, description: 'Top 5' },
      ],
    })
    const parsed = parseAgentResponse(raw)
    expect(parsed.actions.map((a) => a.tool)).toEqual(['format_cells'])
  })

  it('prompt listing documents canonical tools only', () => {
    const prompt = formatToolsForPrompt()
    expect(prompt).toContain('format_cells')
    expect(prompt).not.toContain('format_range')
    expect(prompt).not.toContain('conditional_format')
    expect(prompt).toContain('create_budget_template')
  })
})
