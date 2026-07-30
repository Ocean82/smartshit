# AI Formula Parser — Limitations & Formualizer Integration

## AI Formula Parser (`executeAIFormula`)

The parser at `src/engine/spreadsheet.ts` (lines ~208-260) is a **hand-rolled recursive-descent parser** for AI formulas like `=AI.CATEGORIZE(A1, "categories")`.

### Known Limitations

| Feature | Supported? | Notes |
|---------|-----------|-------|
| Double-quoted strings | ✅ | `"text"` |
| Single-quoted strings | ❌ | `'text'` not supported |
| Nested parentheses | ❌ | `=AI.EXPLAIN(IF(A1>0,"pos","neg"))` fails |
| Named ranges | ❌ | `=AI.CATEGORIZE(MyRange)` fails |
| Cell references | ✅ | `A1`, `B2` |
| Range references | ✅ | `A1:B10` |
| Numbers | ✅ | `42`, `3.14`, `-5` |
| Booleans | ❌ | `TRUE`, `FALSE` not recognized |
| Comma separators | ✅ | Standard CSV-style |
| Escaped quotes | ❌ | `\"` inside strings not handled |

### Why This Exists

The parser was written for the specific AI formula patterns currently in use (`=AI.FUNCTION(args...)`). It avoids pulling in a full formula parser (like formualizer's parser) to keep bundle size down.

### Migration Path

When formula complexity grows, replace with **formualizer's parser** (`@ocean8219/formualizer` exports `parse()` and `tokenize()`):

```typescript
import { parse } from '@ocean8219/formualizer';

const ast = await parse('=AI.CATEGORIZE(IF(A1>0,"pos","neg"))');
// Walk AST to extract function name and arguments
```

---

## Formualizer Function Registry Integration

### What Changed

**Before:** `getFunctionList()` returned ~140 hardcoded functions from `getFallbackFunctions()` + `getExtendedFunctions()`.

**After:** `getFunctionList()` now:
1. **Queries formualizer** via `this.wb.listFunctions()` — returns all functions registered in the workbook (built-ins + custom)
2. **Falls back** to hardcoded list if `listFunctions()` throws
3. **Merges** with AI functions, deduplicating by name (formualizer wins)
4. **Updates** `buildFunctionMap()` and `invalidateFunctionMap()` to keep autocomplete fast

### Result

- **Autocomplete** now shows **all** functions formualizer knows (320+ vs 140 hardcoded)
- **Custom functions** registered via `workbook.registerFunction()` appear automatically
- **Drift eliminated** — no more manual sync when formualizer adds functions

### Formualizer Function Metadata

Formualizer's `listFunctions()` returns `RegisteredFunctionInfo[]`:

```typescript
interface RegisteredFunctionInfo {
  name: string;           // e.g., "SUM"
  minArgs: number;        // minimum required args
  maxArgs: number | null; // null = variadic
  volatile: boolean;      // e.g., NOW(), RAND()
  threadSafe: boolean;
  deterministic: boolean;
  allowOverrideBuiltin: boolean;
}
```

Our code converts this to the internal autocomplete format:
```typescript
{
  name: fn.name,
  description: `Built-in function (${fn.minArgs}–${fn.maxArgs ?? '∞'} args)${fn.volatile ? ' [volatile]' : ''}`,
  category: 'Formulas',
  syntax: `${fn.name}(${Array.from({ length: fn.minArgs }, (_, i) => `arg${i + 1}`).join(', ')}${fn.maxArgs === null || fn.maxArgs > fn.minArgs ? ', ...' : ''})`,
}
```

---

## AI Function Registry (`AIFunctionRegistry`)

Located at `src/engine/aiFunctions.ts`. Manages async AI functions (`=AI.CATEGORIZE()`, `=AI.SENTIMENT()`, etc.).

### Key Features

| Feature | Implementation |
|---------|----------------|
| **Deduplication** | Identical `(function, args)` calls share one in-flight request |
| **Caching** | LRU-bounded (500 entries, 5-min TTL) |
| **Concurrency limit** | 10 parallel requests max (FIFO queue) |
| **Loading state** | Returns `"⏳ Loading..."` immediately, updates cell on resolve |
| **Error handling** | Returns `"#AI_ERROR!"` on failure |
| **Offline fallback** | Heuristic implementations for `CATEGORIZE`, `SENTIMENT`, `EXTRACT` |

### Registry API

```typescript
// Register custom AI function
const dispose = registry.registerAsyncFunction(info, async (...args) => { ... });

// Execute (called from spreadsheet engine)
const result = registry.execute('AI.CATEGORIZE', cellId, ['arg1', 'arg2']);

// Cache management
registry.clearCache();
registry.clearFunctionCache('AI.CATEGORIZE');
registry.setConcurrencyLimit(10);
```

---

## Parser vs Formualizer — Division of Labor

| Task | Handled By |
|------|------------|
| Parse AI formula (`=AI.CATEGORIZE(A1)`) | Hand-rolled parser in `spreadsheet.ts` |
| Parse standard formulas (`=SUM(A1:A10)`) | **formualizer** (WASM) |
| Function autocomplete | Formualizer `listFunctions()` + AI registry |
| Function execution | Formualizer (sync) / AI Registry (async) |
| Cell evaluation | Formualizer `evaluateCell()` / AI Registry |

---

## Future Work

- [ ] Replace hand-rolled AI parser with formualizer parser
- [ ] Add support for single-quoted strings in AI formulas
- [ ] Add named range support to AI formula parser
- [ ] Expose formualizer's `parse()` for advanced formula tooling