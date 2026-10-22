import { describe, expect, it } from 'vitest'
import { parseAgentResponse } from '../server/src/parseResponse.js'
import {
  TOOL_REGISTRY,
  MUTATION_TOOL_NAMES,
  ACTION_TOOL_NAMES,
  TEMPLATE_TOOL_NAMES,
  PARSE_ACTION_TOOL_NAMES,
  READ_PROBE_TOOL_NAMES,
  getToolDefinition,
  resolveToolName,
  formatToolsForPrompt,
  isReadProbeTool,
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
    expect(ACTION_TOOL_NAMES).not.toContain('count_rows')
    expect(ACTION_TOOL_NAMES).not.toContain('export_data')
    expect(ACTION_TOOL_NAMES).not.toContain('analyze_data')
    expect(ACTION_TOOL_NAMES).not.toContain('aggregate')
    expect(ACTION_TOOL_NAMES).not.toContain('top_n')
    expect(ACTION_TOOL_NAMES).not.toContain('summary')
    expect(ACTION_TOOL_NAMES).not.toContain('find_duplicates')
  })

  it('registers execute_macro as a hidden mutate tool', () => {
    const def = getToolDefinition('execute_macro')
    expect(def?.category).toBe('mutate')
    expect(def?.hidden).toBe(true)
    expect(MUTATION_TOOL_NAMES).toContain('execute_macro')
    expect(ACTION_TOOL_NAMES).toContain('execute_macro')
    expect(formatToolsForPrompt()).not.toContain('execute_macro')
  })

  it('read probes are parse-only, not Apply action tools', () => {
    for (const tool of READ_PROBE_TOOL_NAMES) {
      expect(isReadProbeTool(tool)).toBe(true)
      expect(ACTION_TOOL_NAMES).not.toContain(tool)
      expect(PARSE_ACTION_TOOL_NAMES).toContain(tool)
    }
  })

  it('formatToolsForPrompt excludes templates and hidden tools', () => {
    const prompt = formatToolsForPrompt()
    expect(prompt).toContain('format_cells')
    expect(prompt).toContain('execute_script')
    expect(prompt).not.toContain('create_budget_template')
    expect(prompt).not.toContain('create_wedding_budget')
    expect(prompt).not.toContain('format_range')
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

  it('prompt listing documents canonical mutate tools only', () => {
    const prompt = formatToolsForPrompt()
    expect(prompt).toContain('format_cells')
    expect(prompt).toContain('execute_script')
    expect(prompt).not.toContain('format_range')
    expect(prompt).not.toContain('conditional_format')
    expect(prompt).not.toContain('create_budget_template')
  })

  it('all templates are registered but excluded from the LLM prompt', () => {
    const hiddenTemplates = TOOL_REGISTRY.filter((t) => t.category === 'template')
    expect(hiddenTemplates.length).toBeGreaterThan(120)
    for (const tool of hiddenTemplates) {
      expect(tool.hidden, tool.name).toBe(true)
      expect(TEMPLATE_TOOL_NAMES, tool.name).toContain(tool.name)
      expect(ACTION_TOOL_NAMES, tool.name).toContain(tool.name)
    }
    const prompt = formatToolsForPrompt()
    expect(prompt).not.toContain('create_wedding_budget')
    expect(prompt).not.toContain('create_workout_log')
    expect(prompt).not.toContain('save_preference')
  })

  it('server allowlist accepts hidden template tools', () => {
    const raw = JSON.stringify({
      message: 'ok',
      actions: [
        { tool: 'create_wedding_budget', params: {}, description: 'Wedding budget' },
      ],
    })
    const parsed = parseAgentResponse(raw)
    expect(parsed.actions.map((a) => a.tool)).toEqual(['create_wedding_budget'])
  })
})
