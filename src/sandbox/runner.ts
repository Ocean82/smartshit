/**
 * Sandbox Execution Engine — Runner
 *
 * Creates a QuickJS VM, exposes the spreadsheet API, executes scripts,
 * and collects mutations. This is the core execution logic.
 */

import { getQuickJS, type QuickJSContext, type QuickJSHandle } from 'quickjs-emscripten'
import { buildHostAPI } from './api'
import type { ScriptContext, ScriptOptions, SandboxResult, MutationCollector } from './types'
import {
  EXECUTION_TIMEOUT_MS,
  MEMORY_LIMIT_BYTES,
  MAX_STACK_SIZE,
} from './limits'

/**
 * Execute a script in a sandboxed QuickJS VM.
 *
 * The script has access to the spreadsheet API (getCell, setCell, etc.)
 * but cannot access the DOM, network, or any browser APIs.
 */
export async function executeScript(
  code: string,
  context: ScriptContext,
  options: ScriptOptions = {},
): Promise<SandboxResult> {
  const timeout = options.timeout ?? EXECUTION_TIMEOUT_MS
  const startTime = performance.now()

  // Initialize mutation collector
  const mutations: MutationCollector = {
    cellUpdates: {},
    formatUpdates: {},
    rowDeletions: [],
    rowInsertions: [],
    logs: [],
    mutationCount: 0,
  }

  let vm: QuickJSContext | undefined

  try {
    // Load the QuickJS WASM module (cached after first load)
    const QuickJS = await getQuickJS()

    // Create a runtime with resource limits
    const runtime = QuickJS.newRuntime()
    runtime.setMemoryLimit(options.memoryLimit ?? MEMORY_LIMIT_BYTES)
    runtime.setMaxStackSize(MAX_STACK_SIZE)

    // Set up interrupt handler for timeout enforcement
    const deadline = startTime + timeout
    runtime.setInterruptHandler(() => {
      return performance.now() > deadline
    })

    // Create the VM context
    vm = runtime.newContext()

    // Build and expose the host API
    const hostAPI = buildHostAPI({
      sheet: context.sheet,
      getComputedValue: context.getComputedValue,
      mutations,
      maxMutations: options.maxMutations,
    })

    // Expose each API function into the sandbox
    exposeFunction(vm, 'getCell', hostAPI.getCell)
    exposeFunction(vm, 'getRawCell', hostAPI.getRawCell)
    exposeFunction(vm, 'getRange', hostAPI.getRange)
    exposeFunction(vm, 'getHeaders', hostAPI.getHeaders)
    exposeFunction(vm, 'getRowCount', hostAPI.getRowCount)
    exposeFunction(vm, 'getColCount', hostAPI.getColCount)
    exposeFunction(vm, 'findCells', hostAPI.findCells)
    exposeFunction(vm, 'setCell', hostAPI.setCell)
    exposeFunction(vm, 'setCells', hostAPI.setCells)
    exposeFunction(vm, 'setFormat', hostAPI.setFormat)
    exposeFunction(vm, 'deleteRow', hostAPI.deleteRow)
    exposeFunction(vm, 'insertRow', hostAPI.insertRow)
    exposeFunction(vm, 'colToIndex', hostAPI.colToIndex)
    exposeFunction(vm, 'indexToCol', hostAPI.indexToCol)
    exposeFunction(vm, 'cellRef', hostAPI.cellRef)
    exposeFunction(vm, 'parseRef', hostAPI.parseRef)
    exposeFunction(vm, 'log', hostAPI.log)

    // Execute the script
    const result = vm.evalCode(code, 'script.js')

    if (result.error) {
      const errorStr = vm.dump(result.error)
      result.error.dispose()
      vm.dispose()
      runtime.dispose()

      const executionTime = performance.now() - startTime

      // Check if this was a timeout
      if (executionTime >= timeout - 50) {
        return {
          success: false,
          error: `Script timed out after ${Math.round(timeout / 1000)}s. Try operating on a smaller range or simplifying the logic.`,
          detail: String(errorStr),
          logs: mutations.logs,
        }
      }

      // Check if it was a mutation limit error
      if (String(errorStr).includes('Mutation limit')) {
        return {
          success: false,
          error: String(errorStr),
          detail: String(errorStr),
          logs: mutations.logs,
        }
      }

      return {
        success: false,
        error: `Script error: ${formatError(errorStr)}`,
        detail: String(errorStr),
        logs: mutations.logs,
      }
    }

    // Success — dispose the return value
    result.value.dispose()
    vm.dispose()
    runtime.dispose()

    const executionTime = performance.now() - startTime

    // Sort row deletions descending for safe application
    mutations.rowDeletions.sort((a, b) => b - a)

    // Build summary
    const parts: string[] = []
    const cellCount = Object.keys(mutations.cellUpdates).length
    const formatCount = Object.keys(mutations.formatUpdates).length
    if (cellCount > 0) parts.push(`${cellCount} cell${cellCount === 1 ? '' : 's'} updated`)
    if (formatCount > 0) parts.push(`${formatCount} cell${formatCount === 1 ? '' : 's'} formatted`)
    if (mutations.rowDeletions.length > 0) parts.push(`${mutations.rowDeletions.length} row${mutations.rowDeletions.length === 1 ? '' : 's'} deleted`)
    if (mutations.rowInsertions.length > 0) parts.push(`${mutations.rowInsertions.length} row${mutations.rowInsertions.length === 1 ? '' : 's'} inserted`)

    return {
      success: true,
      cellUpdates: mutations.cellUpdates,
      formatUpdates: mutations.formatUpdates,
      rowDeletions: mutations.rowDeletions,
      rowInsertions: mutations.rowInsertions,
      logs: mutations.logs,
      summary: parts.length > 0 ? parts.join(', ') : 'Script executed (no changes)',
      executionTime,
    }
  } catch (err) {
    // Cleanup on unexpected errors
    if (vm) {
      try { vm.dispose() } catch { /* already disposed */ }
    }
    const detail = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      error: `Sandbox error: ${detail}`,
      detail,
      logs: mutations.logs,
    }
  }
}

// ─── Helper: Expose a host function into the QuickJS VM ──────────────────────

/**
 * Expose a host function into the QuickJS VM global scope.
 *
 * Handles marshalling arguments from QuickJS handles to JS values and
 * marshalling return values back into QuickJS handles.
 */
function exposeFunction(
  vm: QuickJSContext,
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (...args: any[]) => any,
): void {
  const fnHandle = vm.newFunction(name, (...argHandles: QuickJSHandle[]) => {
    // Unmarshal arguments
    const args = argHandles.map((h) => vm.dump(h))

    try {
      const result = fn(...args)
      // Marshal result back into the VM
      return marshalValue(vm, result)
    } catch (err) {
      // Throw the error inside the QuickJS VM
      const errorMsg = err instanceof Error ? err.message : String(err)
      return { error: vm.newError(errorMsg) }
    }
  })

  vm.setProp(vm.global, name, fnHandle)
  fnHandle.dispose()
}

/**
 * Convert a JS value into a QuickJS handle.
 * Supports: null, undefined, boolean, number, string, arrays, and plain objects.
 */
function marshalValue(vm: QuickJSContext, value: unknown): QuickJSHandle {
  if (value === null || value === undefined) return vm.null
  if (typeof value === 'boolean') return value ? vm.true : vm.false
  if (typeof value === 'number') return vm.newNumber(value)
  if (typeof value === 'string') return vm.newString(value)

  if (Array.isArray(value)) {
    const arr = vm.newArray()
    for (let i = 0; i < value.length; i++) {
      const elem = marshalValue(vm, value[i])
      vm.setProp(arr, i, elem)
      elem.dispose()
    }
    return arr
  }

  if (typeof value === 'object') {
    const obj = vm.newObject()
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const propVal = marshalValue(vm, val)
      vm.setProp(obj, key, propVal)
      propVal.dispose()
    }
    return obj
  }

  // Fallback: convert to string
  return vm.newString(String(value))
}

/** Format a QuickJS error dump into a readable string. */
function formatError(errorDump: unknown): string {
  if (typeof errorDump === 'string') return errorDump
  if (typeof errorDump === 'object' && errorDump !== null) {
    const e = errorDump as Record<string, unknown>
    if (e.message) return String(e.message)
    if (e.stack) return String(e.stack).split('\n')[0]
  }
  return String(errorDump)
}
