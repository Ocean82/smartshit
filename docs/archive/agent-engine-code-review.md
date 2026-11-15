# Code Review — `src/agent` & `src/engine`

**Date:** 2026-07-24
**Commit:** `fb5d6fe`
**Scope:** `src/agent/{index,parser,executor,tools}.ts` (751 LOC) and `src/engine/{spreadsheet,aiFunctions,aiFunctionDefinitions}.ts` (1,159 LOC)
**Method:** Static reading plus ~30 executable probes run against the real modules. Every defect below was **reproduced**, not inferred. All probe files were removed after the review; the workspace is clean and the 242-test baseline still passes.

---

## Part 1 — How These Modules Work

### `src/engine` — the calculation layer

```
spreadsheet.ts
├── colToLetter / letterToCol / cellToRef / refToCell   ← coordinate math (used app-wide)
├── createEmptySheet / createEmptyWorkbook              ← factories
└── class SpreadsheetEngine
    ├── wb: Workbook (Formualizer)          ← the real calc engine
    ├── sheetMapping: Map<appSheetId, sheetName>
    ├── loadWorkbook / loadSheet            ← push cells into Formualizer
    ├── get/setCellValue, getComputedValue  ← read/write bridge
    ├── executeAIFormula                    ← intercepts `=AI.*(…)` before Formualizer sees it
    ├── getFunctionList                     ← autocomplete metadata (Formualizer built-ins + AI)
    ├── computePivotTable
    └── destroy()

aiFunctions.ts        → class AIFunctionRegistry + `aiFunctionRegistry` SINGLETON
aiFunctionDefinitions.ts → 10 `AI.*` definitions, executors, HTTP client, offline heuristics
```

**The AI-formula flow.** `=AI.*` formulas never reach Formualizer. `store.setCellValue` checks `engine.isAIFormula(formula)` and skips the engine write; `store.getComputedValue` detects the AI formula and calls `engine.executeAIFormula(...)`, which parses arguments, resolves cell refs, and delegates to the registry. The registry returns `"⏳ Loading..."` synchronously, fires the HTTP call in the background, then pushes the resolved value back through `setUpdateCallback` (wired in `useStore.ts:248`). This is a sensible design — a sync façade over an async resource.

### `src/agent` — the deterministic fast path

```
index.ts     → public barrel
tools.ts     → thin re-export of shared/toolRegistry (correct: one source of truth)
parser.ts    → parseMessage(text) → ParseResult { calls[], understood }
executor.ts  → executeTool(call, ctx) → ExecutionResult { success, message, modified }
```

`parser.ts` is a **priority-ordered regex cascade**: first pattern to match returns immediately. `executor.ts` is a `switch` over ~20 tools that mutates the sheet through an injected `ExecutionContext` — good dependency inversion; the executor never imports the store, which is why `executor.format.test.ts` can test it with a plain object.

**Intended flow:** message → `parseMessage` → if `understood`, run `executeTool` for each call (instant, no LLM); else fall through to `brain.ts` → server → LLM → same executor via the Apply/Reject preview.

The architecture is sound. The defects are in the implementations.

---

## Part 2 — Defects, Ranked

### 🔴 C1 — The auditor cannot detect *any* formula error (flagship feature is silently dead)

`spreadsheet.ts:160` — `getComputedValue`:

```ts
if (typeof val === 'object') return '#ERROR!';
```

The formula engine returns a `DetailedCellError` object carrying the **real** error code. I inspected it directly:

```
=A1/B1      → ctor: DetailedCellError, .type = DIV_BY_ZERO, .value = "#DIV/0!"
=NOSUCHFN() → ctor: DetailedCellError, .type = NAME,        .value = "#NAME?"
```

That `.value` is thrown away and replaced with the literal string `#ERROR!`. Meanwhile `src/auditor/utils.ts:16` tests:

```ts
/^#(REF|VALUE|DIV\/0|NAME\?|NULL|N\/A|NUM)!?$/i   // "#ERROR!" does NOT match
```

So `isErrorValue()` returns `false` for **every error the app can produce**. End-to-end probe on a sheet with a `#DIV/0!` and a `#NAME?`:

```
computed B1 (=A1/A2)      : "#ERROR!"
isErrorValue("#ERROR!")   : false
--- AUDIT RESULT ---
error-cell findings : 0      ← should be 2
health score        : 100    ← two broken formulas present
summary             : "No issues found. Your spreadsheet looks clean. ✅"
```

The README sells "**Formula Auditor** — Catches broken references… #REF!, #VALUE!, #DIV/0!". It catches none of them, and actively tells the user their broken sheet is clean. This is worse than having no auditor: it manufactures false confidence in exactly the financial-accuracy scenario the product is sold on.

The blast radius is wider than the auditor — `#ERROR!` also reaches the LLM context, cell rendering, and `classifyCellType`, which mislabels every error cell.

**Fix (4 lines), verified:**

```ts
getComputedValue(sheetId: string, row: number, col: number): string {
  const val = this.getCellValue(sheetId, row, col);
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    // Formualizer DetailedCellError — preserve the real Excel error code
    return (val as { value?: string }).value ?? '#ERROR!';
  }
  return String(val);
}
```

Probe result after the fix:

```
fixed B1: "#DIV/0!"   fixed B2: "#NAME?"
error-cell findings: 2 (was 0)     health score: 75 (was 100)
 - critical | #DIV/0! in A2 | Wrap in IFERROR: =IFERROR(A1/B1, 0)
 - medium   | #NAME? in B2  | Check function spelling…
```

The entire auditor pipeline — severities, suggestions, scoring — was already correct and just starved of input. **Add a regression test with this exact sheet.**

---

### 🔴 C2 — `find_and_replace` throws an uncaught `SyntaxError` on ordinary input

`executor.ts:253` interpolates raw user text into a regex:

```ts
const newVal = String(cell.value).replace(new RegExp(find, 'gi'), replace)
```

Reproduced:

```
find "(" on a cell containing "total (net)"  → THREW SyntaxError: Invalid regular expression: /(/gi: Unterminated group
find "+" on a cell containing "a+b"          → THREW SyntaxError: /+/gi: Nothing to repeat
```

`executeTool` has no try/catch, and neither does the fast path in `useStore`, so this propagates to the React tree — the ErrorBoundary swallows the whole app. Any accountant typing *"replace (old) with (new)"* white-screens the editor.

Worse is the **silent** variant, which does not throw:

```
find "." replace "_" on "3.14"  → writes "____"   (every char replaced, reported as "Replaced 1 occurrence(s)")
```

Financial data is silently destroyed and the tool reports success.

Two further bugs in the same 8 lines:
- **Case corruption.** `find` is lowercased at line 249, then used with the `i` flag, so `replace "netflix" → "Hulu"` rewrites the cell but the match is case-insensitive while the stored `find` is not — matching is inconsistent with the echoed description.
- **Formulas are silently converted to literals.** The loop reads `cell.value` and calls `setCellValue(cellId, newVal)` with no `formula` argument. A cell holding `=B1*2` that renders `100` gets overwritten with the string `100`, **destroying the formula**. Confirmed: `writes: [["A1","Hulu",null]]` — the third element (formula) is always dropped.

**Fix:**

```ts
function escapeRegExp(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

case 'find_and_replace': {
  const find = String(params.find ?? '')
  const replace = String(params.replace ?? '')
  if (!find) return { success: false, message: 'find_and_replace requires a "find" value', modified: 0 }
  const re = new RegExp(escapeRegExp(find), 'gi')
  ctx.pushHistory(`Replace "${find}" → "${replace}"`)
  const updates: Record<string, { value: string; formula?: string }> = {}
  for (const [cellId, cell] of Object.entries(sheet.cells)) {
    if (cell.formula) continue                    // never clobber formulas
    if (cell.value == null) continue
    const original = String(cell.value)
    const next = original.replace(re, replace)
    if (next !== original) updates[cellId] = { value: next }
  }
  ctx.bulkSetCells(updates)                       // one store write, not N
  return { success: true, message: `Replaced in ${Object.keys(updates).length} cell(s)`, modified: Object.keys(updates).length }
}
```

---

### 🔴 C3 — Every multi-letter column (`Z`+) silently targets the wrong column

`executor.ts` computes column indices with `charCodeAt(0) - 65` in **five** places (lines 138, 157, 181, 209, 273) — `rename_header`, `apply_formula`, `modify_column`, `sort_sheet`, `find_max`/`find_min`.

This only works for `A`–`Z`. For anything wider it reads the first letter:

```
"AA" via charCodeAt(0) - 65 = 0    ← column A
"AA" via letterToCol        = 26   ← correct
```

Reproduced: `modify_column {column: "AA", factor: 2}` on a sheet whose only data is `AA1` reported `"Modified 0 cells in column AA"` — it scanned column A. Had column A held data, it would have **silently multiplied the wrong column** and reported success.

The correct helper — `letterToCol` — is already imported at line 9 and used correctly in three other spots (`set_checkbox`, `resolveColumnIndex`). This is an inconsistency, not a missing capability.

**Fix:** replace all five occurrences with `letterToCol(col)`. The import already exists. Import limits allow 200 columns, so this is reachable in normal use.

---

### 🟠 H1 — Async AI formulas: identical arguments leave cells stuck on "⏳ Loading..." forever

`aiFunctions.ts:157` keys in-flight deduplication by `funcName + args` — but the resolution callback fires for only the **one** `cellId` captured by the first call:

```
A1: =AI.CATEGORIZE("coffee")   → "⏳ Loading..."
B1: =AI.CATEGORIZE("coffee")   → "⏳ Loading..."   (deduped)
… after resolution …
updates delivered: [["A1","RESULT"]]
>> B1 is STUCK on the loading placeholder forever
```

Deduplication itself is correct and desirable — the bug is that the pending entry tracks a single cell instead of a set. This is a **guaranteed** hit in the primary use case: `=AI.CATEGORIZE(A2)` filled down a transaction column, where duplicate merchant names are the norm. Every duplicate row hangs permanently.

**Fix:** make `_pendingCalls` hold subscribers.

```ts
private _pendingCalls = new Map<string, { promise: Promise<…>; cellIds: Set<string> }>()

const pending = this._pendingCalls.get(cacheKey)
if (pending) { pending.cellIds.add(cellId); return '⏳ Loading...' }

const cellIds = new Set([cellId])
const promise = (entry.executor as AsyncAIFunctionExecutor)(...args)
this._pendingCalls.set(cacheKey, { promise, cellIds })
promise
  .then((result) => {
    this._cache.set(cacheKey, { value: result, key: cacheKey, timestamp: Date.now() })
    for (const id of cellIds) this._onCellUpdate?.(id, result)
  })
  .catch(() => { for (const id of cellIds) this._onCellUpdate?.(id, '#AI_ERROR!') })
  .finally(() => this._pendingCalls.delete(cacheKey))
```

---

### 🟠 H2 — Every executor tool crashes on missing parameters

Server- and LLM-supplied params are cast, never validated: `(params.cell as string).toUpperCase()`. Probing each tool with `{}`:

```
set_cell         THREW TypeError: Cannot read properties of undefined (reading 'toUpperCase')
rename_header    THREW TypeError: …
modify_column    THREW TypeError: …
sort_sheet       THREW TypeError: …
find_and_replace THREW TypeError: … (reading 'toLowerCase')
find_max         THREW TypeError: …
add_row          THREW TypeError: … (reading 'length')
rename_sheet     →  succeeded, renaming the sheet to the string "undefined"
```

Also `set_cell` with a **numeric** value — which the parser itself can produce and an LLM will certainly emit — throws:

```
set_cell {cell:'A1', value: 42} → TypeError: value.startsWith is not a function
```

`executor.ts:61` assumes `params.value` is a string. The `add_row` path handles this correctly (`typeof val === 'string' && val.startsWith('=')`); `set_cell` does not.

An LLM emitting one malformed tool call white-screens the app. The tool registry already declares `required` on params — nothing validates against it.

**Fix:** validate at the top of `executeTool` against `getToolDefinition(tool).params`, returning `{ success: false, … }` instead of throwing; and coerce with `String(params.value ?? '')`. A blanket `try/catch` around the `switch` is a cheap additional backstop:

```ts
export function executeTool(call: ParsedToolCall, ctx: ExecutionContext): ExecutionResult {
  try {
    return executeToolInner(call, ctx)
  } catch (err) {
    console.error(`[executor] ${call.tool} failed:`, err)
    return { success: false, message: `Could not complete "${call.tool}": ${(err as Error).message}`, modified: 0 }
  }
}
```

---

### 🟠 H3 — `apply_formula` generates the exact "range gap" bug the auditor advertises catching

`executor.ts:161` hardcodes the data range to start at row 2:

```ts
const fullFormula = formula.includes('(') ? formula : `${formula}(${target}2:${target}${lastRow + 1})`
```

Two failures, both reproduced:

```
Data in B1:B3, no header  →  "=SUM(B2:B3)" into B4    ← B1 silently excluded
Data in B2:B6 with header →  "=SUM(B2:B6)" into B7    ← correct, by luck
"sum column A" (text col) →  "=SUM(A2:A3)"            ← sums text, yields 0
```

`findHeaderRow(sheet)` is already imported and used by `rename_header` two cases above. Using it here would make the range correct in both layouts. The irony: `rangeGaps.ts` flags "a SUM that skips an adjacent populated cell" as a **high-severity** finding — the agent creates that exact defect.

**Fix:** derive the range from `findHeaderRow` / `findLastDataRowInCol` rather than the constant `2`, and return `success: false` when the target column holds no numerics.

---

### 🟡 M1 — Parser fires on substrings, hijacking unrelated messages

The cascade tests `lower.includes('sort')` and bare keyword regexes with no word boundaries:

```
"resort the data"          → sort_sheet {column: "T"}   ← "T" scraped out of "the"
"remove formatting"        → delete_row {match: "formatting"}
"remove all the duplicate rows" → delete_row {match: "all the duplicate"}
"the lowest hanging fruit" → find_min {column: "B"}
"show me the most expensive item" → find_max            (arguably fine)
```

`"resort the data"` deleting/sorting by a column parsed out of the word *"the"* is a data-loss-class bug: the sort silently reorders rows by an empty column. Because the parser returns `understood: true`, the message **never reaches the LLM** that would have handled it correctly — the fast path shadows the smart path.

Additional confirmed gaps:
- `"sort by amount"` (header name) → falls back to column **A**, wrong and silent. `resolveColumnIndex` already resolves header names and is used by `filter`/`multi_sort` — `sort_sheet` doesn't use it.
- `"sort by column AA"` → column **A**.
- `"set A1 to 5"` → **NOT UNDERSTOOD**, while `"put 5 in A1"` works. The `putIn` regex requires `value` before the cell; `set X to Y` is the more natural phrasing and is unsupported.

**Fix:** anchor with `\b`, require a real column token (`\bcolumn\s+([A-Z]{1,3})\b` or a header-name lookup via `resolveColumnIndex`), add a deny-list for `formatting|duplicates|blank rows|empty rows`, and treat "no explicit column" as *not understood* rather than defaulting to `'B'`/`'A'`. Defaulting to a guessed column is the root pattern behind most of these.

---

### 🟡 M2 — Engine lifecycle is broken by a module-level singleton

`aiFunctionRegistry` is a module singleton, but every `SpreadsheetEngine` registers into it and `destroy()` clears it globally:

```
after e1 ctor         : 10 AI fns
after e2 ctor         : 10 AI fns   (re-registered onto the same singleton)
after e1.destroy()    : 0  AI fns
>> e2 is alive but its registry is EMPTY: has('AI.CATEGORIZE') = false
```

Any second engine instance — a test, a preview pane, a future multi-workbook tab — silently disables AI formulas for the surviving instance. `dispose()` also nulls `_onCellUpdate`, which `useStore` set once at line 248 and never re-establishes, so async results stop landing even if functions are re-registered.

Related: **`loadWorkbook` leaks Formualizer instances.** It calls `this.wb` reset then rebuilds — fine — but if `addSheet` throws mid-loop the mapping is left partially populated (see M3). The `try/catch` in `loadSheet` swallows the error with a bare comment.

**Fix:** make the registry an instance member (`new AIFunctionRegistry()` per engine) rather than a shared singleton, or reference-count registrations. The class is already written to support this; only the export is global.

---

### 🟡 M3 — Duplicate sheet names silently produce an unreadable sheet

`loadSheet` wraps `hf.addSheet` in `try { … } catch { /* Sheet might already exist */ }`. On a name collision the mapping is never written and **every read from that sheet returns empty**, with no error anywhere:

```
s1 A1 = "1"
s2 A1 = ""    ← silently empty; sheet never mapped
```

xlsx imports and "duplicate sheet" flows can both produce colliding names. The user sees a blank sheet with no explanation.

**Fix:** de-duplicate names before calling `addSheet` (`Sheet 1`, `Sheet 1 (2)`, …), capture the name Formualizer actually assigned, and log/surface a warning instead of swallowing.

---

### 🟡 M4 — AI-function cache grows without bound

`_cache` is a `Map` with a TTL that is **checked on read but never swept**:

```
500 distinct calls → cache size: 500      (nothing evicted)
TTL = 1ms, after 20ms → cache size: 1     (expired but still resident)
```

Entries are only removed by `clearCache()`, `clearFunctionCache()`, or `unregister()`. A user filling `=AI.CATEGORIZE` down 5,000 transaction rows retains 5,000 entries — including full `JSON.stringify` of any range arguments — for the session's lifetime.

`_buildCacheKey` also `JSON.stringify`s entire 2D ranges, so one `=AI.SUMMARIZE(A1:A1000)` produces a cache **key** holding a copy of 1,000 cells.

**Fix:** bound the map (LRU, ~500 entries), sweep expired entries on insert, and hash long keys (`djb2`/`FNV`) instead of embedding raw payloads.

---

### 🔵 L1 — Perf: per-cell store writes where a bulk API already exists

`ExecutionContext` declares `bulkSetCells`, `insertRow`, `addSheet`, and `addChart`. **None of the four is ever called** — `bulkSetCells` is implemented in the store (`useStore.ts:1119`) and wired in, but the executor loops with `setCellValue` instead:

```
clear_sheet on 5,000 cells → 5,000 individual setCellValue calls
modify_column (500 rows)   →   500
find_and_replace           → 1,133
```

Each call runs a Formualizer recalc **plus** an immer `produce` **plus** a Zustand notification **plus** a React render pass. Clearing a moderately sized sheet is thousands of synchronous recalcs on the main thread.

**Fix:** accumulate into a record and issue one `ctx.bulkSetCells(updates)` in `clear_sheet`, `modify_column`, `find_and_replace`, `set_range`, and `add_row`. Delete the three genuinely unused context members (`insertRow`, `addSheet`, `addChart`) or wire them up — dead interface members mislead every future implementer.

### 🔵 L2 — Silent-failure coordinate helpers

`cellToRef` returns `{row: 0, col: 0}` — a **valid-looking A1** — for every unparseable input:

```
cellToRef("b2")      → {row:0, col:0}   ← lowercase not handled; the regex is /^([A-Z]+)(\d+)$/ with no `i`
cellToRef("garbage") → {row:0, col:0}
cellToRef("")        → {row:0, col:0}
```

Callers cannot distinguish "A1" from "malformed". Combined with the lowercase gap, any code path that forgets `.toUpperCase()` silently writes to A1. `letterToCol("b")` returns `33`; `letterToCol("")` returns `-1`; `refToCell(0, -1)` returns the string `"1"`.

**Fix:** add the `i` flag, and return `null` on failure so `strictNullChecks` forces callers to handle it. If that ripples too far, add a `tryCellToRef(): {row,col} | null` and migrate incrementally.

### 🔵 L3 — Smaller items

| Item | Location | Note |
|---|---|---|
| `clear_sheet` leaves formatting behind | `executor.ts:240` | Sets values to `null`; bold/fills/number formats persist. "Clear" implies a clean slate. |
| N+1 history entries | `executor.ts` (14 × `pushHistory`) | Fine today (one call per tool), but multi-call parses (`clear` + `create_budget`) push two undo points for one user action. |
| Unused imports/params | `parser.ts:20-24` | `CELL_REF`, `COL_REF`, `RANGE_REF`, `NUMBER`, `PERCENT` are all declared and never used. `executor.ts` destructures `cell` in two `for` loops without using it. A linter would catch both (see the repo-level review — there is no ESLint). |
| `SheetContext` is exported but barely used | `parser.ts:288` | Only `headerRow` is read, by exactly one branch (bold headers). Most branches would benefit from `headers` for name→column resolution (see M1). |
| `getFunctionInfo` is O(n) per call | `spreadsheet.ts` | Rebuilds the full function list (hundreds of entries) on every lookup; autocomplete calls it per keystroke. `buildFunctionMap` is already memoized — use it here too. |
| `precisionRounding: 10` undocumented | `spreadsheet.ts:65,80` | Duplicated in two places; extract to a shared const so the two `buildEmpty` calls cannot drift. |
| `computePivotTable` returns `grandTotals: []` | `spreadsheet.ts` | Always empty — the field is in the `PivotResult` type but never populated. Either implement or drop. |

---

## Part 3 — Recommended Order of Work

**Ship this week — correctness and crashes:**
1. **C1** `getComputedValue` error passthrough (4 lines) — restores the entire auditor. Highest value-per-line in the codebase.
2. **C2** escape the regex + skip formula cells in `find_and_replace` — stops a white-screen crash and silent data destruction.
3. **C3** swap five `charCodeAt(0) - 65` for the already-imported `letterToCol`.
4. **H2** wrap `executeTool` in try/catch and coerce `set_cell` values.

**Next — correctness under real use:**
5. **H1** per-cell subscriber sets in `_pendingCalls`.
6. **H3** derive `apply_formula` ranges from `findHeaderRow`.
7. **M1** word-boundary anchors, header-name column resolution, and *stop defaulting to a guessed column*.

**Then — robustness and hygiene:**
8. **M2** per-engine registry instance; **M3** sheet-name de-duplication; **M4** bounded cache.
9. **L1** route bulk mutations through `bulkSetCells`; delete dead context members.
10. **L2** strict coordinate parsing returning `null`.

**Testing gap.** `src/engine` has **zero** tests and `src/agent` has 23 (parser 13, executor-format 10) covering only the formatting path. Every defect above was reproducible in a handful of lines — these modules are pure and injectable, so they are cheap to cover. Minimum additions:
- `spreadsheet.test.ts` — coordinate round-trips across `A`→`ZZ`, `DetailedCellError` passthrough (the C1 regression), duplicate sheet names.
- `executor.test.ts` — every tool with `{}` params, regex metacharacters, multi-letter columns, formula preservation.
- `aiFunctions.test.ts` — the two-cells-same-args dedup case, cache bounds.

---

## Verdict

The **architecture of both folders is good** — dependency-injected executor, single-source tool registry, a clean sync façade over async AI, a deliberate no-LLM fast path. Nothing here needs redesigning.

The **implementations are under-defended**. One pattern recurs: *degrade silently instead of failing loudly*. `cellToRef` returns A1 for garbage; `loadSheet` swallows collisions; `getComputedValue` flattens typed errors to a string nothing matches; the parser invents a default column rather than deferring to the LLM; `executeTool` casts unvalidated input. Individually each looks defensive. Collectively they mean **the app confidently does the wrong thing to financial data** — sorting by a column parsed out of the word "the", multiplying column A when told AA, and certifying a broken spreadsheet as clean.

For a product whose pitch is *"feel confident your numbers are correct,"* C1 and C2 are existential rather than cosmetic. The good news: C1 is four lines, C2 is one helper plus a guard, and C3 is a find-and-replace to a function already imported at the top of the file. A focused day of work removes the entire critical tier.
