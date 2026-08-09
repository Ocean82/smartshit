# Engine Fix Plan — Based on docs/engine-review.md

> **⚠️ ARCHIVED** — This plan has been executed. See `MAJOR_CHANGES.md` for the implementation record and `ARCHIVE.md` for context.

This plan addresses all issues identified in the engine code review, organized by severity and dependency order.

---

## 🔴 CRITICAL BUGS (B1–B6) — Must Fix First

These cause data corruption, silent failures, or broken formulas.

---

### B1 — `renameSheet` never syncs the engine (`useStore.ts:366`)

**Problem:** `renameSheet` updates the Zustand workbook but never calls `engine.loadWorkbook` or a dedicated `engine.renameSheet`. The engine's `sheetMapping` retains the old name, so any formula cross-referencing the renamed sheet breaks immediately.

**Location:** `src/store/useStore.ts` lines 366–372

**Fix Options:**

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| A | Call `engine.loadWorkbook(get().workbook)` after `set()` | Simple, reuses existing logic | Reloads entire workbook (heavy) |
| B | Add `engine.renameSheet(sheetId, newName)` | Targeted, O(1) update | New API surface |
| C | Add `engine.updateSheetName(sheetId, newName)` + update `sheetMapping` | Precise, minimal | Need to handle name collision in formualizer |

**Recommended: Option B** — Add a dedicated method to `SpreadsheetEngine`:

```typescript
// src/engine/spreadsheet.ts
renameSheet(sheetId: string, newName: string): void {
  const oldName = this.sheetMapping.get(sheetId);
  if (!oldName) return;
  
  // Handle name collision in formualizer
  const uniqueName = this.uniqueSheetName(newName);
  
  // formualizer doesn't have renameSheet; must remove + re-add
  // But we can't easily remove a sheet from formualizer Workbook.
  // Simpler: reload the single sheet's data into the new name.
  const sheetData = this.getSheetData(sheetId); // Need to expose or pass
  this.wb.addSheet(uniqueName);
  // ... re-populate cells from sheetData
  this.sheetMapping.set(sheetId, uniqueName);
}
```

**Actually simpler approach:** Since `loadWorkbook` rebuilds everything and is already used elsewhere, **Option A is acceptable for now** — just call `engine.loadWorkbook(get().workbook)` after the `set()` in `renameSheet`. Performance is fine for typical sheet counts (<20).

**Implementation in `useStore.ts`:**
```typescript
renameSheet: (sheetId, name) => {
  set((s) => {
    const sheet = s.workbook.sheets.find((sh) => sh.id === sheetId);
    if (sheet) sheet.name = name;
    s.workbook.updatedAt = Date.now();
  });
  get().engine.loadWorkbook(get().workbook); // ← ADD THIS LINE
},
```

---

### B2 — `deleteSheet` never removes sheet from engine (`useStore.ts:353`)

**Problem:** The engine's `sheetMapping` and formualizer `Workbook` retain the deleted sheet forever. Memory leak + cross-sheet formula confusion.

**Location:** `src/store/useStore.ts` lines 353–364

**Fix:** Add `removeSheet(sheetId)` to `SpreadsheetEngine` and call it from `deleteSheet`.

**Engine method:**
```typescript
// src/engine/spreadsheet.ts
removeSheet(sheetId: string): void {
  const sheetName = this.sheetMapping.get(sheetId);
  if (!sheetName) return;
  
  // formualizer Workbook has no removeSheet — we must rebuild
  // Option A: Rebuild workbook without this sheet (clean but O(n))
  // Option B: Mark sheet as deleted, filter in evaluateCell (messy)
  // Option C: Create new Workbook, reload remaining sheets (same as A)
  
  this.sheetMapping.delete(sheetId);
  // Rebuild workbook from current workbook data
  const workbook = this.getWorkbookData(); // Need to expose or pass
  this.loadWorkbook(workbook);
}
```

**Simpler approach (Option A):** Just call `engine.loadWorkbook(get().workbook)` after the `set()` in `deleteSheet`, same as B1.

**Implementation in `useStore.ts`:**
```typescript
deleteSheet: (sheetId) => {
  get().pushHistory('Delete sheet');
  set((s) => {
    if (s.workbook.sheets.length <= 1) return;
    s.workbook.sheets = s.workbook.sheets.filter((sh) => sh.id !== sheetId);
    if (s.activeSheetId === sheetId) {
      s.activeSheetId = s.workbook.sheets[0].id;
      s.workbook.activeSheetId = s.workbook.sheets[0].id;
    }
    s.workbook.updatedAt = Date.now();
  });
  get().engine.loadWorkbook(get().workbook); // ← ADD THIS LINE
},
```

---

### B3 — `deleteSheet` guard fires inside `set`, so Immer never sees the early return (`useStore.ts:356`)

**Problem:** The `if (s.workbook.sheets.length <= 1) return;` is inside the Immer producer. It returns from the producer callback, not from `deleteSheet`. `pushHistory` already ran, and the function continues.

**Location:** `src/store/useStore.ts` lines 353–364

**Fix:** Move guard **before** `pushHistory` and `set()`:

```typescript
deleteSheet: (sheetId) => {
  const sheets = get().workbook.sheets;
  if (sheets.length <= 1) return; // ← GUARD FIRST
  
  get().pushHistory('Delete sheet');
  set((s) => {
    s.workbook.sheets = s.workbook.sheets.filter((sh) => sh.id !== sheetId);
    if (s.activeSheetId === sheetId) {
      s.activeSheetId = s.workbook.sheets[0].id;
      s.workbook.activeSheetId = s.workbook.sheets[0].id;
    }
    s.workbook.updatedAt = Date.now();
  });
  get().engine.loadWorkbook(get().workbook);
},
```

---

### B4 — `executeAIFormula` regex doesn't allow hyphens in function names (`spreadsheet.ts:214`)

**Problem:** Regex `/^=(AI\.[A-Z_]+)\((.*)?\.$/i` matches `AI.CATEGORIZE` but not `AI.MY-FUNC` or `AI.GPT4`. The registry uses dots/underscores; pattern should allow hyphens and digits.

**Location:** `src/engine/spreadsheet.ts` line 214

**Current:**
```typescript
const match = formulaText.match(/^=(AI\.[A-Z_]+)\((.*)?\.$/i)
```

**Fix:**
```typescript
// Allow letters, digits, underscores, hyphens after the dot
const match = formulaText.match(/^=(AI\.[A-Z0-9_-]+)\((.*)?\)$/i)
```

**Note:** Also fixes the trailing `.$` typo (should be `\)$`).

**Test cases to add:**
- `=AI.CATEGORIZE(A1)` ✓
- `=AI.MY-FUNC(A1)` ✓ (was broken)
- `=AI.GPT4(A1)` ✓ (was broken)
- `=AI.CLASSIFY_V2(A1)` ✓

---

### B5 — `_resolveRange` uses `cellToRef` (silent A1 fallback) for range bounds (`spreadsheet.ts:263-264`)

**Problem:** `cellToRef` returns `{row:0, col:0}` (A1) for invalid input. `AI.SUMMARIZE(A1:GARBAGE)` silently becomes `A1:A1` instead of returning `#REF!`.

**Location:** `src/engine/spreadsheet.ts` lines 263–264

**Current:**
```typescript
const start = cellToRef(parts[0].toUpperCase());
const end   = cellToRef(parts[1].toUpperCase());
```

**Fix:** Use `tryCellToRef` and return error on failure:

```typescript
private _resolveRange(
  rangeRef: string,
  resolveArg: (ref: string) => string | number | boolean | null,
): (string | number | boolean | null)[][] {
  const parts = rangeRef.split(':');
  if (parts.length !== 2) return []; // or return error marker
  
  const start = tryCellToRef(parts[0].toUpperCase());
  const end = tryCellToRef(parts[1].toUpperCase());
  
  if (!start || !end) {
    // Return a special marker that executeAIFormula can convert to #REF!
    return [[{ __refError: true }]]; // or throw and catch upstream
  }
  
  // ... rest unchanged
}
```

**Upstream handling in `executeAIFormula`:**
```typescript
const resolvedRange = this._resolveRange(arg, resolveArg);
if (resolvedRange[0]?.[0]?.__refError) return '#REF!';
```

---

### B6 — `computePivotTable` treats header row as data (`spreadsheet.ts:457`)

**Problem:** Caller (`PivotDialog.tsx:58`) passes 0-based `startRow`/`endRow` including header. Engine iterates inclusively and includes header strings in aggregations → numeric values become `NaN`, filtered by `!isNaN(numVal)`, totals silently understated.

**Location:** `src/engine/spreadsheet.ts` lines 448–522

**Fix Options:**

| Option | Approach |
|--------|----------|
| A | Add `hasHeader: boolean` to `PivotConfig`, skip first row if true |
| B | Change caller to pass `startRow + 1` when header present |
| C | Auto-detect: if first row contains non-numeric strings, treat as header |

**Recommended: Option A** — Explicit config is clearest and matches UX (user checks "has header" in dialog).

**Changes:**

1. **Update `PivotConfig` type** (`src/types/index.ts`):
   ```typescript
   export interface PivotConfig {
     rows: PivotField[];
     columns: PivotField[];
     values: PivotValueField[];
     hasHeader?: boolean; // ← ADD
   }
   ```

2. **Update `computePivotTable` signature and logic:**
   ```typescript
   computePivotTable(
     cells: Record<string, { value: string | number | boolean | null }>,
     config: PivotConfig,
     startRow: number,
     endRow: number,
     startCol: number,
     endCol: number
   ): PivotResult {
     const dataStartRow = config.hasHeader ? startRow + 1 : startRow;
     // ... use dataStartRow instead of startRow in the loop
   }
   ```

3. **Update `PivotDialog.tsx`** to pass `hasHeader: true` when user checks the box.

---

## 🟠 AREAS OF CONCERN (C1–C7) — Important Fixes

---

### C1 — `getComputedValue` calls `executeAIFormula` on every render (`useStore.ts:1268`)

**Problem:** `getComputedValue` is a Zustand selector called per-cell per-render. For uncached AI formulas, it fires async HTTP calls during render — side effects in a read path. Registry deduplicates in-flight calls, but first mount can trigger dozens of parallel requests.

**Location:** `src/store/useStore.ts` lines 1256–1280

**Current flow:**
```
Grid renders → getComputedValue(cell) → executeAIFormula → fetch("/api/ai-function")
```

**Fix:** Move AI execution to **explicit triggers**:
- On `loadWorkbook` / `loadSheet` — pre-warm all AI formulas
- On `setCellValue` with AI formula — trigger execution
- On formula change — trigger execution
- **Remove** execution from `getComputedValue`; only return cached `displayValue` or placeholder

**Implementation plan:**

1. **Add `executeAllAIFormulas(sheetId?)` to `SpreadsheetEngine`** — scans workbook for AI formulas and fires them.

2. **Call from `loadWorkbookData` and `importWorkbook` in store:**
   ```typescript
   loadWorkbookData: (workbook) => {
     const eng = get().engine;
     eng.loadWorkbook(workbook);
     eng.executeAllAIFormulas(); // ← NEW
     // ...
   },
   ```

3. **Modify `setCellValue`** to trigger AI execution when formula is set:
   ```typescript
   setCellValue: (cellId, value, formula) => {
     const state = get();
     const isAI = formula && state.engine.isAIFormula(formula);
     if (!isAI) { /* ... */ }
     set((s) => { /* ... */ });
     if (isAI) {
       // Fire and forget — registry handles caching/dedup
       state.engine.executeAIFormula(cellId, formula, /* resolver */);
     }
   },
   ```

4. **Simplify `getComputedValue`** to only return cached values:
   ```typescript
   getComputedValue: (row, col) => {
     const state = get();
     const sheet = state.getActiveSheet();
     const cellId = refToCell(row, col);
     const cell = sheet.cells[cellId];
     
     if (cell?.formula && state.engine.isAIFormula(cell.formula)) {
       return cell.displayValue ?? '⏳ Loading...';
     }
     return state.engine.getComputedValue(state.activeSheetId, row, col);
   },
   ```

**Note:** The `displayValue` is set by the AI registry's update callback (already wired in store init).

---

### C2 — Engine is a singleton; AI cache not invalidated on workbook switch (`useStore.ts:242`)

**Problem:** `const engine = new SpreadsheetEngine()` runs once at module load. `loadWorkbook` replaces the formualizer `Workbook` but **does not clear AI cache/pending calls**. Switching workbooks leaks stale AI results.

**Location:** `src/store/useStore.ts` line 242 (initialization) and `SpreadsheetEngine.loadWorkbook`

**Fix:** Add `reset()` method to `SpreadsheetEngine` and call it in `loadWorkbook`:

```typescript
// src/engine/spreadsheet.ts
reset(): void {
  this._aiRegistry.clearCache();        // Clear AI results
  // Pending calls will resolve to old cells — acceptable, or we could track workbookId
  this._aiRegistry.dispose();           // Optional: full reset
  this._aiRegistry = new AIFunctionRegistry();
  this._disposeAIFunctions = registerBuiltinAIFunctions(this._aiRegistry);
  this.wb = new Workbook();
  this.sheetMapping.clear();
}

// In loadWorkbook:
loadWorkbook(workbook: WorkbookData): void {
  this.reset(); // ← ADD THIS
  // ... rest unchanged
}
```

**In store:** No change needed — `loadWorkbook` now self-resets.

**Also:** Consider adding `workbookId` to cache keys for true isolation, but `reset()` is sufficient for now.

---

### C3 — `loadSheet` swallows all errors silently (`spreadsheet.ts:151`)

**Problem:** Try/catch logs to console but doesn't propagate. Bad sheet loads as empty; UI shows no error.

**Location:** `src/engine/spreadsheet.ts` lines 151–153

**Current:**
```typescript
} catch (err) {
  console.error(`[engine] Failed to load sheet "${sheet.name}":`, err)
}
```

**Fix:** Return error info or throw a typed error:

```typescript
loadSheet(sheet: SheetData): { success: boolean; error?: Error } {
  try {
    // ... existing logic
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[engine] Failed to load sheet "${sheet.name}":`, error);
    return { success: false, error };
  }
}
```

**Callers** (`loadWorkbook`, store's `loadWorkbookData`, `importWorkbook`) should check and surface to UI (toast/notification).

---

### C4 — `computedValueToString` object branch uses duck-typing on `{ value }` (`spreadsheet.ts:67-69`)

**Problem:** Checks `typeof detailed.value === 'string' && detailed.value`. A `DetailedCellError` with empty string code would return `#ERROR!` instead of the real code.

**Location:** `src/engine/spreadsheet.ts` lines 64–72

**Current:**
```typescript
if (typeof val === 'object') {
  const detailed = val as { value?: unknown };
  if (typeof detailed.value === 'string' && detailed.value) return detailed.value;
  return '#ERROR!';
}
```

**Fix:** Use proper type guard when formualizer exports one, or check for known error shape:

```typescript
if (typeof val === 'object' && val !== null) {
  const detailed = val as { value?: unknown; type?: string };
  // formualizer errors have { value: '#DIV/0!', type: 'DIV_BY_ZERO' }
  if (typeof detailed.value === 'string' && detailed.value.startsWith('#')) {
    return detailed.value;
  }
  return '#ERROR!';
}
```

**Low risk** — formualizer error codes always start with `#`. This fix is defensive.

---

### C5 — `localFallback` in `aiFunctionDefinitions.ts` only handles 3 of 10 functions (`aiFunctionDefinitions.ts:67`)

**Problem:** `AI.SUMMARIZE`, `AI.TRANSLATE`, `AI.CLASSIFY`, `AI.TAG`, `AI.EXPLAIN`, `AI.SCORE`, `AI.PREDICT` all return `[AI offline] <first 50 chars>` — looks like real output, confusing users.

**Location:** `src/engine/aiFunctionDefinitions.ts` lines 61–70

**Current:**
```typescript
function localFallback(functionName: string, args: Record<string, unknown>): string | number | null {
  const input = String(args.input ?? args.text ?? '');
  switch (functionName) {
    case 'AI.CATEGORIZE': return heuristicCategorize(input);
    case 'AI.SENTIMENT': return heuristicSentiment(input);
    case 'AI.EXTRACT': return heuristicExtract(input, args);
    default: return `[AI offline] ${input.slice(0, 50)}`;
  }
}
```

**Fix:** Add explicit offline markers for all functions:

```typescript
const OFFLINE_MARKER = '⚠ AI offline';

function localFallback(functionName: string, args: Record<string, unknown>): string | number | null {
  const input = String(args.input ?? args.text ?? '');
  
  switch (functionName) {
    case 'AI.CATEGORIZE': return heuristicCategorize(input);
    case 'AI.SENTIMENT': return heuristicSentiment(input);
    case 'AI.EXTRACT': return heuristicExtract(input, args);
    case 'AI.SUMMARIZE': return `${OFFLINE_MARKER} Summary unavailable`;
    case 'AI.TRANSLATE': return `${OFFLINE_MARKER} Translation unavailable`;
    case 'AI.CLASSIFY': return `${OFFLINE_MARKER} Classification unavailable`;
    case 'AI.TAG': return `${OFFLINE_MARKER} Tags unavailable`;
    case 'AI.EXPLAIN': return `${OFFLINE_MARKER} Explanation unavailable`;
    case 'AI.PREDICT': return `${OFFLINE_MARKER} Prediction unavailable`;
    case 'AI.SCORE': return `${OFFLINE_MARKER} Score unavailable`;
    default: return `${OFFLINE_MARKER} Unknown function`;
  }
}
```

**Alternative:** Return `null` (empty cell) for offline functions — cleaner but loses "something happened" signal. The marker approach is better for debugging.

---

### C6 — Global `aiFunctionRegistry` singleton exported alongside per-instance registry (`aiFunctions.ts:308`)

**Problem:** `export const aiFunctionRegistry = new AIFunctionRegistry()` is unused by `SpreadsheetEngine` (each instance creates its own), but `registerBuiltinAIFunctions` defaults to it. Calling `registerBuiltinAIFunctions()` with no argument registers into the orphaned global.

**Location:** `src/engine/aiFunctions.ts` line 308 and `src/engine/aiFunctionDefinitions.ts` line 374

**Fix:** Remove the default parameter and the exported singleton:

**In `aiFunctionDefinitions.ts`:**
```typescript
export function registerBuiltinAIFunctions(
  registry: AIFunctionRegistry, // ← REMOVE DEFAULT
): () => void {
  // ...
}
```

**In `aiFunctions.ts`:**
```typescript
// REMOVE: export const aiFunctionRegistry = new AIFunctionRegistry()
```

**In `spreadsheet.ts` constructor:** Already passes explicit registry — no change needed.

---

### C7 — `buildFunctionMap` cache never invalidated (`spreadsheet.ts:286-295`)

**Problem:** `_functionMap` built once. If AI functions registered after first `getFunctionInfo` call, they won't appear via built-in path (though AI registry path works). If built-in metadata ever updated at runtime, cache serves stale data.

**Location:** `src/engine/spreadsheet.ts` lines 286–295

**Current:**
```typescript
private _functionMap: Map<string, ...> | null = null;
private buildFunctionMap() {
  if (this._functionMap) return this._functionMap;
  // ... builds map
  this._functionMap = m;
  return m;
}
```

**Fix:** Add invalidation method and call it when AI functions register:

```typescript
invalidateFunctionMap(): void {
  this._functionMap = null;
}

// In constructor, after registering AI functions:
this._disposeAIFunctions = registerBuiltinAIFunctions(this._aiRegistry);
this.invalidateFunctionMap(); // ← Ensure map includes AI functions

// If dynamic registration added later:
registerCustomFunction(info, executor) {
  this._aiRegistry.registerFunction(info, executor);
  this.invalidateFunctionMap();
}
```

---

## 🟡 OPPORTUNITIES FOR IMPROVEMENT (O1–O6) — Nice to Have

---

### O1 — No `engine.destroy()` call on workbook switch

**Problem:** `loadWorkbook` creates new formualizer `Workbook` but old AI registry, pending calls, caches survive.

**Fix:** Covered by **C2** — `reset()` method handles this. Add `destroy()` for full cleanup:

```typescript
destroy(): void {
  this._aiRegistry.dispose();
  this._disposeAIFunctions?.();
  this._disposeAIFunctions = null;
  this.wb = new Workbook(); // formualizer WASM GC'd
  this.sheetMapping.clear();
  this._functionMap = null;
}
```

Call from store when workbook is replaced (already done via `loadWorkbook` → `reset()`).

---

### O2 — `computePivotTable` is stateless, doesn't belong on class

**Problem:** Method takes only raw data + config, no `sheetMapping` or formualizer access. Better as standalone function for testability.

**Fix:** Extract to `src/engine/pivot.ts`:

```typescript
// src/engine/pivot.ts
export interface PivotConfig { /* ... */ }
export interface PivotResult { /* ... */ }

export function computePivotTable(
  cells: Record<string, { value: string | number | boolean | null }>,
  config: PivotConfig,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number
): PivotResult {
  // ... moved implementation
}
```

**In `SpreadsheetEngine`:**
```typescript
import { computePivotTable } from './pivot';

computePivotTable(...) {
  return computePivotTable(...);
}
```

---

### O3 — Function catalogue is hardcoded static list (~80 functions)

**Problem:** `getFallbackFunctions()` + `getExtendedFunctions()` = ~80 hardcoded objects. Will drift from formualizer's actual support.

**Fix:** Query formualizer's function registry if exposed, fallback to static list:

```typescript
private getFormualizerFunctions(): Array<{name, description, category, syntax}> {
  try {
    // formualizer may expose FunctionRegistry
    const funcs = this.wb.getFunctionList?.() || [];
    return funcs.map(f => ({
      name: f.name,
      description: f.description,
      category: f.category,
      syntax: f.signature || `${f.name}(...)`
    }));
  } catch {
    return [...this.getFallbackFunctions(), ...this.getExtendedFunctions()];
  }
}

getFunctionList() {
  return [...this.getFormualizerFunctions(), ...getAIFunctionList(this._aiRegistry)];
}
```

**Check formualizer API** — if no `getFunctionList`, keep static list but add version comment.

---

### O4 — `executeAIFormula` argument parser is hand-rolled mini-parser

**Problem:** Regex-split CSV parser at `spreadsheet.ts:224` doesn't handle:
- Nested parentheses: `=AI.EXPLAIN(IF(A1>0,"pos","neg"))`
- Single-quoted strings
- Named ranges

**Current:** Works for current use cases. Document limitation.

**Fix Options:**
1. **Document limitation** in JSDoc (quick win)
2. **Defer to formualizer** — parse formula with formualizer, extract args from AST
3. **Use a proper formula parser** (e.g., `formula.js`)

**Recommended:** Option 1 for now (document), Option 2 for future when formula complexity grows.

**Documentation:**
```typescript
/**
 * Parses AI function arguments.
 * LIMITATIONS:
 * - Does NOT handle nested parentheses in arguments
 * - Does NOT handle single-quoted strings
 * - Does NOT handle named ranges
 * - Assumes comma-separated args with double-quoted strings only
 * For complex formulas, use formualizer's parser (TODO).
 */
```

---

### O5 — No rate limiting / request queuing on AI backend calls

**Problem:** Pasting 500 rows with `=AI.CATEGORIZE` fires 500 parallel fetches. Registry deduplicates identical args but not unique ones.

**Fix:** Add concurrency limiter to `AIFunctionRegistry`:

```typescript
// In AIFunctionRegistry
private _concurrencyLimit = 10;
private _queue: Array<() => void> = [];
private _running = 0;

private _runWithLimit<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = async () => {
      this._running++;
      try {
        const result = await fn();
        resolve(result);
      } catch (e) {
        reject(e);
      } finally {
        this._running--;
        this._processQueue();
      }
    };
    
    if (this._running < this._concurrencyLimit) {
      run();
    } else {
      this._queue.push(run);
    }
  });
}

private _processQueue() {
  if (this._queue.length > 0 && this._running < this._concurrencyLimit) {
    const next = this._queue.shift()!;
    next();
  }
}

// In execute(), wrap async executor:
const promise = this._runWithLimit(() => 
  (entry.executor as AsyncAIFunctionExecutor)(...args)
);
```

**Configurable:** Add `setConcurrencyLimit(n: number)`.

---

### O6 — `heuristicExtract` phone pattern is very loose (`aiFunctionDefinitions.ts:127`)

**Problem:** `/[\d()+-][\d() +-]{6,}/` matches `(123)` followed by text, zip codes, invoice numbers.

**Location:** `src/engine/aiFunctionDefinitions.ts` line 127

**Current:**
```typescript
const phoneMatch = text.match(/[\d()+-][\d() +-]{6,}/)
```

**Fix:** Stricter pattern with word boundaries and digit count:

```typescript
// At least 10 digits, allow common formats
const phoneMatch = text.match(
  /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/
);
```

**Or simpler — require 10+ digits:**
```typescript
const digits = text.replace(/\D/g, '');
if (digits.length >= 10) return text.match(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/)?.[0];
return null;
```

---

## 📋 IMPLEMENTATION PRIORITY ORDER

| Phase | Issues | Rationale |
|-------|--------|-----------|
| **1 — Critical Data Integrity** | B1, B2, B3, B4, B5, B6 | Silent data corruption, broken formulas, crashes |
| **2 — Architecture Correctness** | C1, C2, C3, C6, C7 | Render-time side effects, state leaks, footguns |
| **3 — UX Polish** | C4, C5 | Error display, offline clarity |
| **4 — Code Quality** | O1, O2, O3, O7 | Maintainability, testability |
| **5 — Scale & Robustness** | O4, O5, O6 | Parser limits, rate limiting, regex quality |

---

## 🧪 TESTS TO ADD

Each fix should include regression tests in `spreadsheet.test.ts`:

| Issue | Test Case |
|-------|-----------|
| B1 | Rename sheet → cross-sheet formula still resolves |
| B2 | Delete sheet → engine no longer has sheetMapping entry |
| B3 | Delete last sheet → no history push, no error |
| B4 | `=AI.MY-FUNC(A1)` parses correctly |
| B5 | `=AI.SUMMARIZE(A1:INVALID)` returns `#REF!` |
| B6 | Pivot with header row → header excluded from sums |
| C1 | `getComputedValue` called 100x → 0 network calls (only cached) |
| C2 | Load workbook A → load workbook B → AI cache from A not in B |
| C3 | `loadSheet` with bad data → returns error, store shows toast |
| C6 | `registerBuiltinAIFunctions()` without arg → TypeScript error |
| C7 | Register AI function after `getFunctionInfo` → appears in list |

---

## 📦 FILES TO MODIFY

| File | Changes |
|------|---------|
| `src/engine/spreadsheet.ts` | B4, B5, B6, C2, C4, C7, O1, O2 |
| `src/store/useStore.ts` | B1, B2, B3, C1, C3 |
| `src/engine/aiFunctions.ts` | C6, O5 |
| `src/engine/aiFunctionDefinitions.ts` | C5, C6, O6 |
| `src/types/index.ts` | B6 (PivotConfig.hasHeader) |
| `src/components/PivotDialog.tsx` | B6 (pass hasHeader) |
| `src/engine/spreadsheet.test.ts` | All regression tests |

---

## ✅ ACCEPTANCE CRITERIA

- [ ] All B1–B6 bugs fixed with passing regression tests
- [ ] C1: Zero network calls from `getComputedValue` during render
- [ ] C2: Workbook switch clears AI cache (verified by test)
- [ ] C3: Sheet load errors surface to UI (toast)
- [ ] C4–C7: Code changes merged, no TypeScript errors
- [ ] O1–O6: Implemented or documented as follow-up

---

*Generated from engine review — implement in priority order above.*