# Component Architecture Analysis — src/components

## Executive Summary

The codebase has a functional but increasingly fragile component architecture. **25+ components** exist with significant technical debt in the core grid system. The primary issues are:

| Issue | Severity | Components Affected |
|-------|----------|---------------------|
| **Monolithic SpreadsheetGrid (932 lines)** | 🔴 Critical | Grid, GridCell, FormulaAutocomplete |
| **Inline regex/parsing logic in components** | 🟠 High | Inspector, FormulaBar, FormulaAutocomplete, ChartRenderer |
| **No shared formula utilities** | 🟠 High | Multiple components duplicate parsing |
| **Tight coupling to Zustand store** | 🟠 High | All components use `useStore()` hooks directly |
| **Missing type exports** | 🟡 Medium | Types scattered in `src/types/` |
| **Inconsistent error handling** | 🟡 Medium | Try/catch scattered without boundaries |
| **Component composition gaps** | 🟡 Medium | Panels, Dialogs, GridCell |

---

## Detailed Component Assessment

### 🔴 CRITICAL: SpreadsheetGrid.tsx (932 lines)

**Problems:**
1. **Single Responsibility Violation** — Handles grid rendering, selection, editing, column resizing, find/replace, autocomplete, filtering, sorting, conditional formatting peer values, cell notes, pending AI previews, touch handling
2. **Complex useMemo chains** — 6+ interdependent memos for conditional formatting that are fragile
3. **`getCellStyle` callback anti-pattern** — Passed through GridCell, makes memoization harder
4. **Direct store coupling** — 17+ selectors from useStore()
5. **No virtualization abstraction** — Manual viewport calculation mixed with rendering

**Recommended Split:**
```
SpreadsheetGrid (orchestrator, ~150 lines)
├── GridViewport        — scrollable container, virtualization logic
├── GridHeaders         — row/column headers, frozen pane support
├── GridRows            — row rendering, selection overlay
├── GridCellRenderer    — single cell display (extracted from GridCell)
├── EditingController   — inline edit state, commit/cancel, autocomplete
├── SelectionManager    — range selection, multi-range, keyboard nav
├── ColumnResizer       — drag-to-resize, double-click auto-fit
└── GridOverlay         — find/replace, context menu, pending AI preview
```

### 🟠 HIGH: Inline Formula Parsing Logic

**Multiple components duplicate regex-based formula parsing:**

| Component | Parsing Logic | Should Be |
|-----------|---------------|-----------|
| `FormulaAutocomplete.tsx:23-31` | `extractActiveToken()` — function name extraction | `src/lib/formulaParse.ts` |
| `InspectorPanelContent.tsx:54-81` | `rangeRe` / `cellRe` — precedent/dependent extraction | `src/lib/formulaParse.ts` |
| `FormulaBar.tsx:109-111` | Name box cell reference parsing | `src/lib/formulaParse.ts` |
| `ChartRenderer.tsx:145-164` | Series range parsing | `src/lib/formulaParse.ts` |
| `aiFunctionDefinitions.ts:220-247` | Argument splitting for AI functions | `src/lib/formulaParse.ts` |

**Solution:** Create `src/lib/formulaParse.ts` with:
```typescript
// Core utilities
export function extractFunctionToken(formula: string): string | null
export function parseCellReferences(formula: string): string[]
export function parseRangeReferences(formula: string): { start: Ref; end: Ref }[]
export function expandRange(range: string): string[]
export function parseNameBoxInput(input: string): Ref | null
export function isCellReference(token: string): boolean
export function isRangeReference(token: string): boolean
```

### 🟠 HIGH: Zustand Store Coupling

**Pattern:** Every component uses `useStore((s) => s.xxx)` — creates tight coupling, hard to test, hard to refactor.

**Current pattern:**
```tsx
const { 
  selection, editingCell, setCellValue, pushHistory, 
  getActiveSheet, getComputedValue, setSelection, ... 17 more 
} = useStore()
```

**Better pattern — selectors as hooks:**
```typescript
// src/hooks/useSpreadsheet.ts
export function useActiveSheet() { return useStore(s => s.getActiveSheet()) }
export function useSelection() { return useStore(s => s.selection) }
export function useEditingCell() { return useStore(s => s.editingCell) }
export function useCellActions() { 
  return useStore(s => ({
    setCellValue: s.setCellValue,
    pushHistory: s.pushHistory,
    getComputedValue: s.getComputedValue,
  }))
}
```

### 🟡 MEDIUM: Type Organization

**Current:** Types in `src/types/index.ts` (350+ lines) — mixes domain, UI, and API types.

**Recommended structure:**
```
src/types/
├── domain.ts         # SheetData, CellData, WorkbookData, PivotConfig
├── ui.ts             # Selection, CellFormat, FilterConfig, SortConfig
├── components.ts     # Component-specific prop types
├── api.ts            # ChatMessage, AgentAction, FileItem, ServerHealth
└── index.ts          # Re-exports
```

### 🟡 MEDIUM: Component-Specific Issues

#### FormulaBar.tsx (223 lines)
- **Name box "Go to Cell" logic** (lines 102-126) should use `formulaParse.parseNameBoxInput()`
- **Editing logic** duplicated with SpreadsheetGrid
- **No memoization** — re-renders on any store change

#### GridCell.tsx (292 lines)
- **Good:** Uses `React.memo`, clean prop interface
- **Issue:** `getCellStyle` callback prop breaks memoization
- **Fix:** Move style resolution inside component or use stable style object

#### ChartRenderer.tsx (492 lines)
- **Trend line math** (polyFit, linearRegression) lines 35-120 should be in `src/lib/chartMath.ts`
- **Data parsing** (parseMultiSeriesData) lines 135-200 should be separate
- **No memoization** — re-computes on every render

#### PivotDialog.tsx (200+ lines)
- **Drag-and-drop state** mixed with business logic
- **No keyboard accessibility** for drag operations
- **Category/field management** inline rather than hook

#### ConditionalFormatDialog.tsx (225 lines)
- **Rule category state** (`highlight` | `dataBar` | `colorScale` | `iconSet`) managed inline
- **Threshold generation** for icon sets (lines 56-60) should be utility
- **No validation** before apply

#### FindReplaceDialog.tsx (332 lines)
- **Search runs synchronously** on every keystroke (useMemo would help)
- **Regex escaping** logic inline (escapeRegex)
- **No debounce** on search input

#### ContextMenu.tsx (194 lines)
- **Menu items defined inline** with action functions (lines 87-120)
- **Hardcoded shortcuts** not centralized
- **Note editor** mixed into menu component

#### InspectorPanelContent.tsx (251 lines)
- **Precedent/dependent regex** (lines 54-81) duplicated from FormulaAutocomplete
- **Header extraction** (lines 32-40) recomputes on every selection change
- **No virtualization** for large precedent/dependent lists

---

## Recommended Refactoring Priority

### Phase 1: Foundation (Low Risk, High Value)
1. **Create `src/lib/formulaParse.ts`** — consolidate all formula parsing
2. **Create `src/hooks/useSpreadsheet.ts`** — selector hooks for store decoupling
3. **Extract `src/lib/chartMath.ts`** — trend line computations
3. **Reorganize `src/types/`** into domain/ui/api

### Phase 2: Grid Decomposition (Medium Risk)
4. **Extract `GridViewport`** — virtualization logic from SpreadsheetGrid
5. **Extract `EditingController`** — inline edit state, autocomplete positioning
6. **Extract `SelectionManager`** — range selection, keyboard nav
7. **Move `getCellStyle` logic into GridCell** — remove callback prop

### Phase 3: Dialog/Panel Improvements (Low Risk)
8. **Extract ContextMenu items** to config + handlers
9. **Add debounce to FindReplaceDialog** search
10. **Add keyboard accessibility** to PivotDialog drag-drop
11. **Move ConditionalFormatDialog rule logic** to hook

### Phase 4: Advanced (Higher Risk)
12. **Add ErrorBoundary per panel** — isolate panel crashes
13. **Implement component testing** with React Testing Library
14. **Add performance monitoring** (React DevTools profiler marks)

---

## Quick Wins (Can Do Immediately)

| Fix | File | Effort |
|-----|------|--------|
| Move `extractActiveToken` to formulaParse | FormulaAutocomplete.tsx | 15 min |
| Move `escapeRegex` to formulaParse | FindReplaceDialog.tsx | 10 min |
| Move `polyFit`/`linearRegression` to chartMath | ChartRenderer.tsx | 20 min |
| Add `useSpreadsheet` selector hooks | New file | 30 min |
| TypeScript `satisfies` for PANELS config | panelTypes.tsx | 10 min |

---

## Architecture Diagram (Current vs Target)

### Current
```
SpreadsheetGrid (932 lines) ◄── useStore() ──► Zustand Store
    │
    ├── FormulaAutocomplete (inline parsing)
    ├── FindReplaceDialog (inline search)
    ├── SelectionOverlay
    └── GridCell (callback prop breaks memo)
```

### Target
```
SpreadsheetGrid (150 lines orchestrator)
    ├── GridViewport ◄── useViewport()
    ├── GridHeaders ◄── useHeaders()
    ├── GridRows ◄── useRows()
    ├── EditingController ◄── useEditing()
    ├── SelectionManager ◄── useSelection()
    ├── ColumnResizer ◄── useColumnResize()
    └── GridOverlay ◄── useOverlays()

Shared:
    ├── formulaParse.ts (all regex logic)
    ├── chartMath.ts (trend lines)
    ├── useSpreadsheet.ts (selector hooks)
    └── types/ (domain/ui/api)
```

---

## Testing Gaps

| Component | Current Coverage | Needed |
|-----------|-----------------|--------|
| SpreadsheetGrid | 0% (integration only) | Unit: viewport calc, selection, editing |
| FormulaAutocomplete | 0% | Unit: token extraction, filtering |
| ChartRenderer | 0% | Unit: trend line math, data parsing |
| PivotDialog | 0% | Unit: field config, aggregation |
| InspectorPanel | 0% | Unit: precedent/dependent extraction |

---

*Generated from component analysis — implement Phase 1 first for maximum impact with minimum risk.*