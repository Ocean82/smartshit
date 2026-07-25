/**
 * Sandbox Execution Engine — Public API
 *
 * Entry point for executing agent-generated scripts in a sandboxed QuickJS VM.
 *
 * Usage:
 *   import { runScript } from '@/sandbox'
 *   const result = await runScript(code, { sheet, getComputedValue })
 */

export { executeScript as runScript } from './runner'
export type {
  ScriptContext,
  ScriptOptions,
  SandboxResult,
  SandboxSuccess,
  SandboxFailure,
} from './types'
