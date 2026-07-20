# Phase 1 Implementation Plan: Proactive Intelligence

> **Goal:** The app explains the spreadsheet before the user asks.
> **Timeline:** 2 weeks
> **Outcome:** When a user imports a file, they immediately see what it contains,
> what's wrong, and how to navigate it — without typing anything.

---

## Overview

Three deliverables, in priority order:

1. **Import Insights Card** — A visual summary overlay shown immediately after file import
2. **Auditor Auto-Run + Banner** — Audit runs on import; critical findings surface as a top banner
3. **Cell Inspector Popover** — Click/hover any formula cell to see a plain-English explanation

---

## 1. Import Insights Card

### What It Is
A dismissible card/panel that appears above the spreadsheet grid immediately after importing a file (or opening a saved workbook for the first time). Not in the chat. On the grid itself.

### Content
```
┌──────────────────────────────────────────────────────────────┐
│  📊 Budget Tracker — 47 rows × 6 columns                    │
│                                                              │
│  This looks like a monthly expense budget with categories,   │
│  planned amounts, and actual spending.                       │
│                                                              │
│  Key Numbers:                                                │
│  • Total Expenses: $4,230    • Total Income: $5,000          │
│  • Net: +$770               • Over-budget items: 3           │
│                                                              │
│  Top Categories: Rent ($1,500) · Food ($800) · Transport ($400)  │
│                                                              │
│  ⚠️ 2 potential issues detected  [View Audit]               │
│                                                              │
│  [Dismiss]                          [Explain in Detail →]    │
└──────────────────────────────────────────────────────────────┘
```

### Implementation

**Data source:** Reuse `computeSheetInsights()` from `src/ai/sheetInsights.ts` — this already computes:
- headerRow, headers, columnStats
- categoryTotals, topExpenses
- totalIncome, totalExpenses, netCashflow
- negativeVariances, outliers

**What to add:**
- `detectSheetPurpose()` — a simple heuristic based on headers (already partially exists in `buildSheetProfile()`)
- A one-line natural description based on detected purpose + dimensions

**New files:**
```
src/components/InsightsCard.tsx       — The visual overlay component
src/lib/insightsSummary.ts           — Transforms SheetInsights into display-ready data
```

**Store changes:**
- Add `showInsightsCard: boolean` state (default: false)
- Add `insightsData: InsightsSummary | null` state
- In `importWorkbook()`: after loading, compute insights + set `showInsightsCard = true`
- Dismiss button sets `showInsightsCard = false`

**Where it renders:** In `App.tsx`, positioned absolutely over the grid area (not inside chat, not as a modal — a dismissible banner/card at top of the spreadsheet area).

**"Explain in Detail" button:** Sets chat input to "Explain this spreadsheet" and sends (uses existing flow).

**"View Audit" link:** Opens the audit panel + auto-runs the audit.

### Acceptance Criteria
- [ ] Importing a .xlsx/.csv file shows the insights card within 500ms
- [ ] Card shows detected purpose, key totals, top categories
- [ ] Card shows issue count if auditor finds problems
- [ ] Card is dismissible and doesn't re-appear until next import
- [ ] Works for empty sheets (shows "empty spreadsheet" state, no card)
- [ ] Works for non-financial sheets (generic stats: row/col count, data types)

---

## 2. Auditor Auto-Run + Findings Banner

### What It Is
The auditor currently requires the user to:
1. Know the audit panel exists (hidden under View menu)
2. Open it manually
3. Click "Run Audit"

**New behavior:** The audit runs automatically on import. If findings exist, a compact banner appears below the toolbar (above the grid) showing the count and severity.

### Design

```
┌──────────────────────────────────────────────────────────────────────┐
│ ⚠️ 2 issues found (1 high, 1 medium) — Health: 85/100  [View All]  │
└──────────────────────────────────────────────────────────────────────┘
```

- If score >= 90 and no critical/high: no banner (don't bug the user about info-level findings)
- If score < 90 or has critical/high findings: show banner
- Banner is dismissible (X button) but reappears on re-import
- "View All" opens the full audit panel

### Implementation

**Store changes:**
- Add `lastAuditResult: AuditResult | null` state
- In `importWorkbook()`: after loading, run `runAudit()` asynchronously (requestAnimationFrame)
- Store the result in `lastAuditResult`

**New component:**
```
src/components/AuditBanner.tsx  — Compact horizontal banner
```

**Render location:** In `App.tsx`, between the toolbar/formula bar and the grid. Only renders when `lastAuditResult` has significant findings.

**Existing AuditPanel integration:**
- When `AuditPanel` opens, it should use `lastAuditResult` from store instead of re-running (with a refresh button to re-run)
- Remove the "Run Audit" as the first action — show results immediately

### Acceptance Criteria
- [ ] Audit runs within 1 second of import (async, non-blocking)
- [ ] Banner appears if score < 90 or critical/high findings exist
- [ ] Banner shows finding count, severity breakdown, and health score
- [ ] "View All" opens the audit panel pre-populated with results
- [ ] Banner is dismissible
- [ ] No banner for empty/trivial sheets (< 5 cells)
- [ ] Audit re-runs when the user switches sheets (debounced)

---

## 3. Cell Inspector Popover

### What It Is
Click on any formula cell → a popover appears showing:
- Plain-English explanation of what the formula does
- What cells it references (dependencies — clickable)
- What cells reference it (dependents — clickable)
- Whether the auditor flagged this cell

### Design

```
┌─────────────────────────────────────────────────────┐
│  B11: =SUM(B2:B10)                                  │
│                                                     │
│  Adds up all values in column B from rows 2 to 10  │
│  (the "Amount" column for all expense entries)      │
│                                                     │
│  References: B2, B3, B4, B5, B6, B7, B8, B9, B10   │
│  Referenced by: D2 (Net calculation)                │
│                                                     │
│  ✅ No issues found                                │
└─────────────────────────────────────────────────────┘
```

### Implementation

**Formula explanation engine:**
```
src/lib/formulaExplainer.ts  — Translates formulas to English
```

This is a pattern-based translator (no LLM needed for common formulas):
- `=SUM(B2:B10)` → "Adds up values in B2 through B10"
- `=AVERAGE(C2:C20)` → "Average of values in C2 through C20"
- `=IF(B2>100, "Over", "Under")` → "If B2 is greater than 100, shows 'Over', otherwise 'Under'"
- `=VLOOKUP(A2, Sheet2!A:B, 2, FALSE)` → "Looks up A2 in Sheet2 column A and returns the matching value from column B"
- Fallback for complex formulas: show the formula + a "Ask AI to explain" button

**Dependency detection:**
HyperFormula already tracks the dependency graph. Use `engine.hf.getCellDependents()` and `engine.hf.getCellPrecedents()` to get the links.

**Audit integration:**
Check if `lastAuditResult?.findings` has any entry where `finding.cells` includes this cell's coordinates.

**New files:**
```
src/components/CellInspector.tsx    — Popover component
src/lib/formulaExplainer.ts         — Pattern-based formula → English
```

**Trigger:** When a formula cell is selected (single cell selection), show a small "inspect" icon or allow double-right-click. Or: show automatically in the formula bar area as an expandable section.

**Alternative (simpler v1):** Instead of a popover, add an expandable section below the formula bar that shows this info for the currently selected cell. This avoids popover positioning complexity.

### Acceptance Criteria
- [ ] Selecting a formula cell shows explanation in the inspector area
- [ ] Common formulas (SUM, AVERAGE, IF, VLOOKUP, COUNT, MAX, MIN) get readable English explanations
- [ ] Cell dependencies are listed and clickable (clicking navigates to that cell)
- [ ] Cell dependents are listed and clickable
- [ ] Auditor findings for this cell are shown inline
- [ ] Non-formula cells show "Static value" with the data type
- [ ] "Ask AI to explain" button for complex formulas sends to chat

---

## Implementation Order

### Week 1
1. **Store changes** — Add `showInsightsCard`, `insightsData`, `lastAuditResult`, `dismissInsightsBanner`
2. **Auto-audit on import** — Wire `runAudit()` into `importWorkbook()`
3. **AuditBanner.tsx** — Build and render the findings banner
4. **InsightsCard.tsx** — Build the import summary card
5. **insightsSummary.ts** — Transform raw insights into display-ready format

### Week 2
6. **formulaExplainer.ts** — Pattern-based formula explainer
7. **CellInspector.tsx** — Build the inspector UI (below formula bar)
8. **Wire HyperFormula dependency graph** — getCellPrecedents/getDependents
9. **Connect audit findings per-cell** — Show relevant findings in inspector
10. **Polish + edge cases** — Empty sheets, huge sheets (>10k cells), multi-sheet imports

---

## What This Replaces

| Before | After |
|--------|-------|
| Import a file → see raw grid | Import → see summary card with key numbers |
| Audit requires 3 clicks to find | Audit runs automatically, banner alerts you |
| Formula understanding requires reading Excel | Click a cell → read English explanation |
| Chat is the only way to get insights | Insights are proactive and visual |
| "Explain this spreadsheet" is the first thing users type | The app already explained it before they typed anything |

---

## What We're NOT Doing in Phase 1

- No LLM calls for insights (everything is deterministic/computed)
- No changes to the chat system (it still works, just isn't the primary path)
- No server-side changes
- No new dependencies (all client-side TypeScript)
- No changes to the auditor rules (they're already solid)

---

## Dependencies

All of these already exist and just need to be wired up:
- `computeSheetInsights()` — computes key numbers
- `buildSheetProfile()` — detects sheet purpose
- `runAudit()` — finds formula issues
- HyperFormula dependency graph — tracks cell relationships
- `cellToRef()` / `refToCell()` — cell coordinate utilities

The implementation is primarily UI/component work + glue code. No new algorithms needed.
