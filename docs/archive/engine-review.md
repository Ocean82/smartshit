Engine Code Review — src/engine
Architecture Overview
The engine is three files:

File	Role
spreadsheet.ts
SpreadsheetEngine — wraps formualizer (Workbook API), exposes cell read/write, AI formula dispatch, pivot computation, and the function catalogue
aiFunctions.ts
AIFunctionRegistry — async execution, deduplication, LRU-bounded cache, update callback
aiFunctionDefinitions.ts
10 built-in AI functions (CATEGORIZE, SENTIMENT, SUMMARIZE, EXTRACT, TRANSLATE, CLASSIFY, TAG, EXPLAIN, PREDICT, SCORE) + heuristic local fallbacks
A single SpreadsheetEngine lives inside the Zustand store. The store wires the AI registry's update callback to push resolved values into cells and trigger a re-render.

Bugs / Errors
B1 — renameSheet never syncs the engine (
useStore.ts L366
)
renameSheet updates the Zustand workbook but never calls engine.loadWorkbook (or any engine API). The sheetMapping internal to the engine keeps the old name. Any formula that cross-references a sheet by its new name will break immediately; getComputedValue returns null for the renamed sheet.

Fix: Call engine.loadWorkbook(get().workbook) after the set, or add a dedicated engine.renameSheet(sheetId, newName) method.

B2 — deleteSheet never removes the sheet from the engine (
useStore.ts L353
)
The engine's sheetMapping retains the deleted sheet forever; the formualizer Workbook still holds it. Over time this leaks memory and can cause cross-sheet formula confusion.

Fix: Expose a removeSheet(sheetId) on SpreadsheetEngine and call it from deleteSheet.

B3 — deleteSheet guard fires inside set, so immer never sees the early return (
useStore.ts L356
)
ts

set((s) => {
  if (s.workbook.sheets.length <= 1) return;  // ← only returns from the immer callback, not from deleteSheet
  ...
});
deleteSheet continues executing after this (e.g. pushHistory already ran before the guard). The guard should be a pre-check before pushHistory and set.

B4 — executeAIFormula regex does not allow hyphens in function names (
spreadsheet.ts L214
)
ts

const match = formulaText.match(/^=(AI\.[A-Z_]+)\((.*)?\.$/i)
[A-Z_]+ means a custom function named AI.MY-FUNC would return #NAME?. The registry uses dots and underscores but the pattern should also allow digits (e.g. AI.GPT4).

B5 — _resolveRange uses cellToRef (silent A1 fallback) for range bounds (
spreadsheet.ts L263-L264
)
ts

const start = cellToRef(parts[0].toUpperCase());
const end   = cellToRef(parts[1].toUpperCase());
A malformed range like AI.SUMMARIZE(A1:GARBAGE) silently resolves to A1:A1 instead of returning an error. Should use tryCellToRef and return [] (or '#REF!') on bad input.

B6 — computePivotTable treats every row as a data row, including the header (
spreadsheet.ts L457
)
The caller (
PivotDialog.tsx L58
) passes startRow / endRow as 0-based indices of the selected range, which normally includes the header row. The engine iterates startRow..endRow inclusively and includes the header strings in aggregations, causing nonsense numeric outputs (they become NaN, which !isNaN(numVal) filters out, so totals are silently understated rather than crashing).

Areas of Concern
C1 — getComputedValue in the store calls executeAIFormula on every render (
useStore.ts L1268
)
getComputedValue is called per-cell per-render from the grid virtualizer. For AI formulas with a cached displayValue it short-circuits, but before displayValue is populated it calls executeAIFormula which calls registry.execute on every render pass. The registry de-duplicates in-flight calls, but this is still a render-time side-effect: a Zustand selector is firing an async HTTP call. This makes it hard to reason about re-render loops and could trigger dozens of API calls on first mount.

Suggestion: Trigger AI formula execution explicitly (e.g. on loadSheet, on cell commit, on formula change) rather than from a read path.

C2 — Engine is a singleton inside create() — it is never recreated (
useStore.ts L242
)
const engine = new SpreadsheetEngine() runs once at module load. If loadWorkbook is called with a new workbook, the old formualizer Workbook is replaced but the AI cache is not invalidated and the update callback remains pointed at the old closure. This is benign today but fragile; switching workbooks (multiple files) will produce stale cached AI results from the previous workbook.

C3 — loadSheet swallows all errors silently (
spreadsheet.ts L151
)
ts

} catch (err) {
  console.error(`[engine] Failed to load sheet ...`, err)
}
A bad sheet silently loads nothing. The store has no way to surface this to the user. At minimum the error should propagate or be returned as a status.

C4 — computedValueToString object branch uses duck-typing on { value } (
spreadsheet.ts L67-L69
)
It checks typeof detailed.value === 'string' && detailed.value. A DetailedCellError with an empty string code (unlikely but possible) would be swallowed and returned as #ERROR! instead of the real code. Minimal risk but worth tightening with a proper type guard if/when formualizer exports one.

C5 — localFallback in aiFunctionDefinitions.ts only handles three of ten functions (
aiFunctionDefinitions.ts L67
)
AI.SUMMARIZE, AI.TRANSLATE, AI.CLASSIFY, AI.TAG, AI.EXPLAIN, AI.SCORE all return [AI offline] <first 50 chars> when the server is down. This is better than an error string, but could confuse users if the output looks like a summary/translation. Consider a more explicit marker like ⚠ AI offline or returning '' to leave the cell visually empty.

C6 — The global aiFunctionRegistry singleton is exported alongside the per-instance registry (
aiFunctions.ts L308
)
ts

export const aiFunctionRegistry = new AIFunctionRegistry()
This is never used by SpreadsheetEngine (each instance creates its own), but it is exported and imported in aiFunctionDefinitions.ts as the default parameter:

ts

export function registerBuiltinAIFunctions(
  registry: AIFunctionRegistry = aiFunctionRegistry,
If a caller passes no argument, AI functions are registered into the orphaned global rather than any engine instance. This is a footgun: calling registerBuiltinAIFunctions() with no arg does nothing useful.

Fix: Either remove the default parameter and require an explicit registry, or eliminate the exported singleton.

C7 — buildFunctionMap cache is never invalidated (
spreadsheet.ts L286-L295
)
_functionMap is built once and cached. If AI functions are registered after the engine is constructed and buildFunctionMap has been called, they won't appear in getFunctionInfo via the built-in path (they do appear via the AI registry path, so it works today). More dangerous: if built-in function metadata is ever updated at runtime, the cache would serve stale data.

Opportunities for Improvement
O1 — No engine.destroy() call on workbook switch
When loadWorkbook is called (e.g. on import or multi-file navigation), the old formualizer Workbook object is garbage-collected, but engine.destroy() is never called. The AI registry, pending calls, and caches survive the switch. Add a reset() method (lighter than destroy()) that clears the AI cache and pending calls without unregistering functions.

O2 — computePivotTable is stateless and doesn't belong on the class
It takes only raw cell data and a config — no sheetMapping, no formualizer access. It would be cleaner as a standalone exported function and easier to unit test in isolation.

O3 — Function catalogue is a hardcoded static list
getFallbackFunctions() and getExtendedFunctions() return ~80 hardcoded metadata objects. This list will drift from what formualizer actually supports. Consider querying the library's own function registry (if exposed) and falling back to the static list only when unavailable.

O4 — executeAIFormula argument parser is a hand-rolled mini-parser
The regex-split CSV parser at 
spreadsheet.ts L224
 handles quoted strings but not:

Nested parentheses (e.g. =AI.EXPLAIN(IF(A1>0,"pos","neg")))
Single-quoted strings
Named ranges
This is fine for the current use cases but will break as formula complexity grows. Document the limitation explicitly, or defer full parsing to the formualizer engine.

O5 — No rate limiting or request queuing on AI backend calls
Every distinct (function, args) pair fires an immediate fetch. If a user pastes 500 rows and fills =AI.CATEGORIZE down the column with unique values, 500 parallel fetches are issued. The registry deduplicates identical args but not unique ones. Add a concurrency limiter (e.g. max 10 in-flight at once) with a FIFO queue.

O6 — heuristicExtract phone pattern is very loose (
aiFunctionDefinitions.ts L127
)
ts

const phoneMatch = text.match(/[\d()+-][\d() +-]{6,}/)
This matches things like (123) followed by text inside longer strings, and will often match zip codes or invoice numbers. At minimum add word-boundary anchors or require a digit count closer to real phone formats.

Test Coverage Summary
Area	Covered	Missing
Coordinate round-trips	✅ colToLetter/letterToCol up to col 800	—
tryCellToRef null returns	✅	Edge: row 0, non-string input
computedValueToString	✅ all branches	Empty .value string edge case
Formula error codes (#DIV/0!, #NAME?)	✅	#REF!, #VALUE!
Auditor integration	✅ end-to-end	—
Duplicate sheet names	✅	999+ duplicates (timestamp fallback)
AI registry deduplication	✅ multi-cell delivery	—
AI registry cache bounds	✅ 700-entry fill	—
AI registry cache expiry	✅	—
computePivotTable	❌ zero tests	All aggregation modes, header-row bug
renameSheet engine sync	❌ zero tests	—
deleteSheet engine sync	❌ zero tests	—
executeAIFormula parser	❌ zero tests	Edge cases B4, O4