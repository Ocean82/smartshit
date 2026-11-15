# Sandbox Execution Engine — QuickJS-Emscripten Integration

> Agent-generated scripts executed in a sandboxed WASM VM for complex spreadsheet operations.

**Status:** ✅ Implemented (Phases 1-5)
**Dependency:** `quickjs-emscripten` (npm)
**Priority:** After P0 security fixes, before new skill work

---

## 1. Problem Statement

The current agent system has two execution paths:

1. **Deterministic tools** — `src/agent/executor.ts` handles predefined operations (set_cell, sort_sheet, format_cells, etc.) via a `switch` statement. Fast, safe, but limited to operations someone anticipated.
2. **LLM responses** — The LLM returns structured tool calls from the registry, which get parsed and routed to the same executor.

Neither path handles **novel compound operations** — things like:
- "Find all blank cells in column B and fill them with the average of their neighbors"
- "For each row where Status is 'Overdue', calculate the late fee as 1.5% × Days × Amount"
- "Transpose rows 2-10 into columns"
- "Create a running total in column D based on column C values"
- "Highlight every cell that's more than 2 standard deviations from the column mean"

These require **loops, conditionals, and multi-step logic** that can't be expressed as a single tool call. Today, the LLM either emits multiple individual tool calls (slow, fragile) or punts with a text explanation. With a sandbox, the LLM generates a script that executes atomically.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  User Message                                                │
│  "Fill blanks in column B with the row above's value"        │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  brain.ts / intentParser                                     │
│  Classifies as: needs scripted logic (not a single tool)     │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  LLM (via server)                                            │
│  Returns: { tool: "execute_script", params: { code: "..." }} │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  src/sandbox/runner.ts                                        │
│                                                               │
│  1. Creates QuickJS VM instance (in Web Worker)              │
│  2. Exposes spreadsheet API into the VM                      │
│  3. Executes script with timeout + memory limit              │
│  4. Collects mutations (cell writes, format changes)         │
│  5. Returns results or error                                 │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  src/agent/executor.ts (existing)                            │
│  Applies collected mutations to Zustand store                │
│  (same bulkSetCells / setCellFormat path as today)           │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. File Structure

```
src/sandbox/
├── index.ts              # Public API: runScript(code, context) → SandboxResult
├── runner.ts             # QuickJS VM lifecycle: create, expose API, execute, dispose
├── api.ts                # Host functions exposed into the sandbox (the "spreadsheet SDK")
├── types.ts              # SandboxResult, SandboxError, ScriptContext types
├── limits.ts             # Timeout, memory, and iteration limits configuration
├── worker.ts             # Web Worker wrapper for non-blocking execution
└── __tests__/
    ├── runner.test.ts    # Unit tests for sandbox execution
    └── api.test.ts       # Unit tests for exposed API functions
```

---

## 4. Exposed Spreadsheet API (sandbox/api.ts)

These are the **only** functions the script can call. No DOM, no network, no imports.

### Read Operations

```typescript
// Get a single cell's computed (displayed) value
getCell(ref: string): string | number | null

// Get a cell's raw value (before formula computation)
getRawCell(ref: string): { value: string | number | boolean | null; formula?: string }

// Get all computed values in a range → 2D array
getRange(startRef: string, endRef: string): (string | number | null)[][]

// Get column header names (first row values)
getHeaders(): string[]

// Get the number of populated rows
getRowCount(): number

// Get the number of populated columns
getColCount(): number

// Find cells matching a condition
findCells(column: string, condition: 'empty' | 'notEmpty' | 'equals' | 'contains' | 'gt' | 'lt', value?: unknown): string[]
```

### Write Operations (mutations collected, not applied immediately)

```typescript
// Set a cell's value or formula
setCell(ref: string, value: string | number | boolean | null, formula?: string): void

// Set multiple cells at once (most efficient)
setCells(updates: Record<string, { value: string | number | boolean | null; formula?: string }>): void

// Set cell formatting
setFormat(ref: string, format: { bold?: boolean; italic?: boolean; bgColor?: string; fontColor?: string; numberFormat?: string }): void

// Delete a row (0-indexed)
deleteRow(row: number): void

// Insert a row after the given row (0-indexed)
insertRow(afterRow: number): void
```

### Utility Functions

```typescript
// Convert column letter to index: "A" → 0, "B" → 1
colToIndex(letter: string): number

// Convert index to column letter: 0 → "A", 1 → "B"
indexToCol(index: number): string

// Build a cell reference from row/col: (0, 0) → "A1"
cellRef(row: number, col: number): string

// Parse a cell reference: "B3" → { row: 2, col: 1 }
parseRef(ref: string): { row: number; col: number }

// Log a message (captured in output, not console)
log(message: string): void
```

---

## 5. Security & Resource Limits (sandbox/limits.ts)

| Limit | Default | Rationale |
|-------|---------|-----------|
| Execution timeout | 5,000ms | Prevents infinite loops; 5s is generous for any cell-level operation |
| Memory limit | 16 MB | Prevents OOM from accidentally building huge arrays |
| Max mutations | 50,000 | Prevents a script from writing every cell in a 5000×200 sheet multiple times |
| Max iterations | 1,000,000 | Gas-style interrupt counter; prevents tight loops that don't allocate |
| Stack depth | 100 | Prevents recursive bombs |
| Output log lines | 200 | Prevents log spam |

If any limit is hit, execution halts cleanly and returns a `SandboxError` with a user-friendly explanation.

---

## 6. Integration Points

### 6.1 New Tool Definition (shared/toolRegistry.ts)

```typescript
{
  name: 'execute_script',
  category: 'mutate',
  description: 'Execute a JavaScript script against the spreadsheet data. Use for complex operations that need loops, conditions, or multi-step logic.',
  params: [
    { name: 'code', type: 'string', description: 'JavaScript code to execute', required: true },
    { name: 'description', type: 'string', description: 'Human-readable description of what the script does', required: true },
  ],
  examples: [
    'Fill blanks in column B with the average of adjacent cells',
    'Calculate a running total in column D',
    'Transpose the selection',
    'Apply a custom formula to every row based on conditions',
  ],
  hidden: false,
}
```

### 6.2 Executor Integration (src/agent/executor.ts)

Add a new case to the `switch` in `executeToolInner`:

```typescript
case 'execute_script': {
  const code = String(params.code ?? '')
  if (!code.trim()) {
    return { success: false, message: 'execute_script requires code', modified: 0 }
  }
  ctx.pushHistory(String(params.description ?? 'Script execution'))
  const result = await runSandboxScript(code, {
    sheet: ctx.getActiveSheet(),
    getComputedValue: ctx.getComputedValue,
  })
  if (!result.success) {
    return { success: false, message: result.error, modified: 0 }
  }
  // Apply collected mutations
  if (Object.keys(result.cellUpdates).length > 0) {
    ctx.bulkSetCells(result.cellUpdates)
  }
  for (const [cellId, fmt] of Object.entries(result.formatUpdates)) {
    ctx.setCellFormat(cellId, fmt)
  }
  return {
    success: true,
    message: result.summary || `Script executed: ${Object.keys(result.cellUpdates).length} cells modified`,
    modified: Object.keys(result.cellUpdates).length,
  }
}
```

Note: This requires making `executeToolInner` async or adding a separate async execution path for the sandbox case.

### 6.3 LLM System Prompt Addition (server)

Add to the tools section of the LLM system prompt:

```
## execute_script

Use this tool when the user's request requires:
- Looping over many cells with conditional logic
- Multi-step calculations that depend on each other
- Operations not covered by other tools (transpose, custom aggregation, pattern-based fills)

The script runs in a sandbox with access to the spreadsheet API:
- getCell(ref), getRange(start, end), getHeaders(), getRowCount()
- setCell(ref, value, formula?), setCells(updates), setFormat(ref, format)
- cellRef(row, col), parseRef(ref), colToIndex(letter), indexToCol(index)

Write clean, simple JavaScript. Do NOT use imports, fetch, or DOM APIs.
Always include a description explaining what the script does.
```

### 6.4 Preview/Approval Flow

Scripts produce mutations that go through the **same pending-action preview system** as regular tool calls. The user sees:
- Description of what the script will do
- List of cells that would change (diff preview)
- Approve / Reject buttons

This means no script runs without user consent — the sandbox produces a "dry run" changeset that requires approval before applying to the store.

---

## 7. Web Worker Architecture (sandbox/worker.ts)

QuickJS WASM execution runs in a dedicated Web Worker to prevent blocking the main thread:

```
Main Thread                         Web Worker
─────────────                       ──────────
                                    
postMessage({                       onmessage: (msg) => {
  type: 'execute',                    const vm = QuickJS.newContext()
  code: '...',                        // expose API as host functions
  sheetSnapshot: {...}                // execute code
})                                    // collect mutations
                                      postMessage({ mutations, logs, error })
                                      vm.dispose()
onmessage: (result) => {            }
  // apply mutations to store
}
```

The sheet data is **serialized once** into the Worker (read-only snapshot). Write operations are **collected** in the Worker's memory and returned as a mutation set. This means:
- Main thread never blocks
- Sheet state is consistent for the duration of the script
- Mutations are atomic (all-or-nothing when applied to the store)

---

## 8. Implementation Phases

### Phase 1: Core Sandbox (Days 1-2)

- [ ] `npm install quickjs-emscripten`
- [ ] Create `src/sandbox/types.ts` — define `ScriptContext`, `SandboxResult`, `SandboxError`
- [ ] Create `src/sandbox/limits.ts` — resource limit constants
- [ ] Create `src/sandbox/api.ts` — host function implementations (read/write/utility)
- [ ] Create `src/sandbox/runner.ts` — QuickJS VM lifecycle (create context, expose functions, eval, dispose)
- [ ] Create `src/sandbox/index.ts` — public `runScript(code, context)` API
- [ ] Unit tests for `runner.ts`: basic eval, host function calls, timeout, memory limit

### Phase 2: Web Worker Integration (Day 3)

- [ ] Create `src/sandbox/worker.ts` — Web Worker that loads QuickJS WASM and handles messages
- [ ] Update `src/sandbox/index.ts` — communicate via postMessage, handle timeouts
- [ ] Verify WASM loads correctly in Worker context (Vite config may need adjustment)
- [ ] Test non-blocking behavior (main thread stays responsive during execution)

### Phase 3: Tool Registry & Executor (Day 4)

- [ ] Add `execute_script` to `shared/toolRegistry.ts`
- [ ] Add async execution path in `src/agent/executor.ts` for the sandbox case
- [ ] Update `src/agent/parser.ts` to recognize `execute_script` tool calls from LLM
- [ ] Wire mutations from sandbox result into the existing `bulkSetCells` / `setCellFormat` path
- [ ] Test end-to-end: hardcoded script → sandbox → store mutation

### Phase 4: LLM Integration (Day 5)

- [ ] Update server system prompt to include `execute_script` tool docs
- [ ] Add script-generation examples to the prompt (few-shot)
- [ ] Update `src/ai/brain.ts` — detect when the LLM returns a script tool call
- [ ] Wire into the pending-action preview flow (user sees diff before applying)
- [ ] Test with real LLM: "fill blanks with average" → script generated → preview → apply

### Phase 5: Safety & Polish (Day 6)

- [ ] Add input validation: reject scripts containing known dangerous patterns (`eval`, `Function`, `import`)
- [ ] Add execution telemetry (record script executions, failures, timeouts)
- [ ] Handle edge cases: empty sheet, script that reads out-of-bounds, script that writes to formula cells
- [ ] Error messages: friendly explanations when limits are hit ("Script took too long — try a smaller range")
- [ ] Add to release checklist: verify sandbox limits are enforced

---

## 9. Vite Configuration

QuickJS-emscripten ships a `.wasm` file that Vite needs to handle:

```typescript
// vite.config.ts additions
export default defineConfig({
  // ... existing config
  optimizeDeps: {
    exclude: ['quickjs-emscripten'], // Don't pre-bundle WASM
  },
  worker: {
    format: 'es', // Web Workers use ES modules
  },
})
```

The WASM file should be loaded from the public directory or served via Vite's asset handling. Test that `vite build` correctly includes it in the output.

---

## 10. Example Script Outputs

### User: "Fill blank cells in column B with the value above them"

```javascript
const rows = getRowCount()
for (let row = 1; row < rows; row++) {
  const ref = cellRef(row, 1) // Column B = index 1
  const val = getCell(ref)
  if (val === null || val === '') {
    const above = getCell(cellRef(row - 1, 1))
    if (above !== null) {
      setCell(ref, above)
    }
  }
}
```

### User: "Add a running total in column D based on column C"

```javascript
const rows = getRowCount()
let running = 0
for (let row = 1; row < rows; row++) { // Skip header
  const val = Number(getCell(cellRef(row, 2))) // Column C
  if (!isNaN(val)) {
    running += val
    setCell(cellRef(row, 3), running) // Column D
  }
}
```

### User: "Highlight cells in column E that are more than $1000"

```javascript
const rows = getRowCount()
for (let row = 1; row < rows; row++) {
  const ref = cellRef(row, 4) // Column E
  const val = Number(String(getCell(ref)).replace(/[$,]/g, ''))
  if (!isNaN(val) && val > 1000) {
    setFormat(ref, { bgColor: '#FEF3C7', bold: true })
  }
}
```

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| LLM generates broken scripts | Sandbox catches all errors and returns friendly message; user can retry |
| Script produces unexpected mutations | Preview flow shows diff before applying; user approves or rejects |
| WASM binary increases bundle size | Lazy-loaded in Web Worker only when first script executes; doesn't affect initial load |
| QuickJS doesn't support all ES2020+ | Acceptable — scripts are simple loops/conditions; no need for async/generators/etc. |
| Race condition: sheet changes during execution | Sheet is snapshotted into Worker; mutations are atomic on return |
| User becomes dependent on scripts | Existing deterministic tools remain primary path; scripts are the fallback for complex cases |

---

## 12. Success Criteria

- [ ] Script executes in <100ms for typical operations (100-5000 cells)
- [ ] Main thread never blocks during script execution
- [ ] Infinite loop is terminated within 5 seconds with clear error message
- [ ] All mutations go through preview/approval before applying
- [ ] No increase in initial page load time (WASM loads lazily)
- [ ] Existing tool execution is completely unaffected
- [ ] LLM generates correct scripts for common patterns (fill, transform, conditional format)

---

## 13. Dependencies

| Package | Version | Size | Purpose |
|---------|---------|------|---------|
| `quickjs-emscripten` | ^0.31.x | ~400KB WASM (lazy-loaded) | Sandboxed JS execution |

No other new dependencies required.

---

## 14. Non-Goals (This Phase)

- User-written scripts (only agent-generated scripts for now)
- Script editor UI / REPL panel
- Persistent script storage / macro recording
- TypeScript support inside the sandbox
- npm package imports inside scripts
- Multi-sheet operations (single active sheet only)

These are all valid future extensions but are out of scope for the initial integration.
