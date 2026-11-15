/**
 * The Ollama Modelfiles carry their own copy of the "Available tools" list in
 * the SYSTEM prompt. That copy has drifted from the canonical registry before,
 * which lets the local fallback model advertise tools the app no longer has
 * (or miss tools it does). Keep the copies honest with the registry.
 *
 * These are subset checks, not equality: the Modelfiles intentionally list a
 * curated prompt-sized set, but every name they mention must exist.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOOL_REGISTRY } from '../../shared/toolRegistry.js'

const MODELFILES = ['Modelfile', 'Modelfile.local', 'Modelfile.spreadsheet-rl']

/** Tools the local fallback must always advertise to do useful spreadsheet work. */
const CORE_TOOLS = [
  'set_cell',
  'set_range',
  'apply_formula',
  'format_cells',
  'create_chart',
  'analyze_data',
  'execute_script',
]

const registryNames = new Set(TOOL_REGISTRY.map((tool) => tool.name))

function availableTools(file: string): string[] {
  const text = readFileSync(path.resolve(import.meta.dirname, '..', file), 'utf8')
  const match = text.match(/Available tools:\s*([^\n"]+)/)
  if (!match) throw new Error(`No "Available tools:" line in ${file}`)
  return match[1]
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
}

describe('Ollama Modelfiles stay aligned with shared/toolRegistry', () => {
  for (const file of MODELFILES) {
    it(`${file} only advertises tools that exist in the registry`, () => {
      const stale = availableTools(file).filter((name) => !registryNames.has(name))
      expect(stale).toEqual([])
    })

    it(`${file} advertises the core spreadsheet tools`, () => {
      const tools = new Set(availableTools(file))
      expect(CORE_TOOLS.filter((name) => !tools.has(name))).toEqual([])
    })
  }
})
