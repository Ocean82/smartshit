# Phase 1 Implementation Plan: Proactive Intelligence + Panel Architecture

> **Goal:** The app explains the spreadsheet before the user asks. The grid is king.
> **Timeline:** 2-3 weeks
> **Outcome:** When a user imports a file, they immediately see what it contains,
> what's wrong, and how to navigate it — without typing anything. All tools live
> in a right-side panel rail and never permanently obstruct the spreadsheet.

---

## Overview

Five deliverables, in priority order:

1. **Panel Rail + Dock System** — Right-side icon rail with slide-out panels (replaces current layout)
2. **Import Insights Panel** — KPI dashboard + summary (moved from grid cells to Insights panel)
3. **Auditor Auto-Run + Status Bar** — Audit runs on import; findings shown in status bar + panel
4. **Cell Inspector Panel** — Click any formula cell to see a plain-English explanation
5. **Chat Migration** — Move chat from fixed left sidebar into the panel system

---

## 0. Panel Rail + Dock System (Foundation)

### What It Is
A thin icon rail (44px) on the RIGHT edge of the screen. Each icon opens a docked panel
that slides in from the right, pushing the grid left. Only one panel open at a time.

### Layout (Default — No Panel Open)
```
┌─────────────────────────────────────────────────────────────────┬────┐
│ [toolbar...]                                                    │    │
├─────────────────────────────────────────────────────────────────│ 💬 │
│                                                                 │ 📊 │
│              S P R E A D S H E E T   G R I D                   │ 🛡️ │
│              (100% width — nothing covering it)                 │ 🔬 │
│                                                                 │    │
├─────────────────────────────────────────────────────────────────┴────┤
│ Sheet 1  │  37 cells  │  ⚠️ 2 issues  │  100%  │ smartshit v1.0    │
└──────────────────────────────────────────────────────────────────────┘
```

### Layout (Panel Open)
```
┌──────────────────────────────────────────────────┬───────────┬────┐
│ [toolbar...]                                     │ Panel     │    │
├──────────────────────────────────────────────────│ header    │ 💬 │
│                                                  │───────────│ 📊 │
│          GRID (shrinks to fit)                   │ content   │ 🛡️ │
│                                                  │           │ 🔬 │
│                                                  │           │    │
├──────────────────────────────────────────────────┴───────────┴────┤
│ Sheet 1  │  37 cells  │  ⚠️ 2 issues  │  100%                    │
└──────────────────────────────────────────────────────────────────────┘
```

### Panel Rail Icons
| Icon | Panel | Purpose |
|------|-------|---------|
| 💬 | Chat | AI assistant (replaces current left-side chat) |
| 📊 | Insights | KPI dashboard, category breakdown, charts |
| 🛡️ | Auditor | Health score + findings list |
| 🔬 | Inspector | Formula explanation + cell dependencies |

### Behaviors
- Click icon → panel slides in (320px default width)
- Click same icon again → panel closes
- Click different icon → panel swaps content (no close/reopen animation)
- Resize handle on left edge of panel (min 280px, max 500px)
- Width persisted in localStorage per panel
- ESC closes any open panel
- Panel state persisted (which panel was open, width)

### Why Right Side (Not Left)
Spreadsheets are read left-to-right. Column A contains row labels (Category, Name, etc.).
Panels on the right preserve the most important columns. The current left-side chat
pushes column A offscreen when opened (see screenshot analysis).

### Implementation
```
src/components/panels/PanelRail.tsx      — Icon rail + active state
src/components/panels/DockPanel.tsx      — Panel container (header + resize + content slot)
src/components/panels/panelTypes.ts      — Panel IDs, icons, labels
src/store/useStore.ts                    — Add: activePanel, panelWidths
```

### Store Changes
```typescript
// New state
activePanel: 'chat' | 'insights' | 'auditor' | 'inspector' | null
panelWidths: Record<string, number>  // persisted per-panel widths

// New actions
setActivePanel: (panel: string | null) => void
setPanelWidth: (panel: string, width: number) => void
```

### Migration from Current Layout
- Remove `showChat` / `toggleChat` / `chatWidth` (replaced by panel system)
- Remove `showSkills` / skills panel (skills become chips inside chat panel)
- Remove `showAuditPanel` / `toggleAuditPanel` (replaced by panel system)
- The ChatPanel component becomes a child of DockPanel (content only, no wrapper)
- The AuditPanel component becomes a child of DockPanel (content only, no wrapper)

---

## 1. Import Insights Panel

### What It Is
The "AT A GLANCE" dashboard (currently rendered as rows inside the spreadsheet grid)
moves into the **Insights panel** (📊 icon in the rail). This removes it from occupying
spreadsheet rows and puts it in a proper panel.

### Content (Inside the Insights Panel)
```
┌─────────────────────────────────────────┐
│ 📊 Insights                         [X] │
│─────────────────────────────────────────│
│ Monthly Budget · 47 rows × 6 columns   │
│                                         │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│ │ INCOME  │ │EXPENSES │ │   NET   │   │
│ │  $5,000 │ │  $9,680 │ │ -$4,680 │   │
│ └─────────┘ └─────────┘ └─────────┘   │
│                                         │
│ SPENDING BY CATEGORY                    │
│ ━━━━━━━━━━━━━━━━━━━                    │
│ Salary        ████████████  $5,000      │
│ Housing/Rent  █████████     $1,500      │
│ Groceries     ████          $450        │
│ Savings       ████          $400        │
│ Insurance     ███           $300        │
│ Entertainment ██            $250        │
│                                         │
│ ⚠️ 2 potential issues  [Open Auditor]  │
│                                         │
│ DETECTED PURPOSE: Budget tracker        │
│ Over-budget items: 3                    │
└─────────────────────────────────────────┘
```

### Auto-Open on Import
When a user imports a file with data (>5 rows):
1. The Insights panel auto-opens (sets `activePanel = 'insights'`)
2. Shows the computed summary immediately
3. User can close it and reopen anytime via the 📊 icon

### Import Toast (Non-Blocking)
Additionally, a small toast notification appears bottom-right (auto-dismisses 5s):
"✓ Imported budget.xlsx — 47 rows · 2 insights · 1 issue"

This ensures even if the user immediately closes the panel, they got the key info.

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

### Week 1: Panel Infrastructure
1. **panelTypes.ts** — Define panel IDs, icons, labels
2. **PanelRail.tsx** — Icon rail component (right edge)
3. **DockPanel.tsx** — Panel container with resize handle, header, close
4. **Store changes** — `activePanel`, `panelWidths`, `setActivePanel`, `setPanelWidth`
5. **App.tsx layout refactor** — Replace current flex layout with: grid + rail + dock area
6. **Migrate ChatPanel** — Move into DockPanel system (remove fixed left-side positioning)
7. **Remove SkillsPanel** — Skills become chips inside chat (already partially there)

### Week 2: Insights + Auditor
8. **InsightsPanel.tsx** — KPI cards + category chart (content previously in grid cells)
9. **Remove AT A GLANCE from grid** — The template generators stop injecting dashboard rows
10. **Auto-audit on import** — Wire `runAudit()` into `importWorkbook()`
11. **AuditPanel migration** — Move existing AuditPanel content into DockPanel
12. **Status bar audit indicator** — "⚠️ N issues" in bottom bar, clickable
13. **Import toast notification** — Brief non-blocking import confirmation

### Week 3: Cell Inspector + Polish
14. **formulaExplainer.ts** — Pattern-based formula → English translator
15. **InspectorPanel.tsx** — Cell explanation + dependencies
16. **Wire HyperFormula dependency graph** — getCellPrecedents/getDependents
17. **Connect audit findings per-cell** — Show relevant findings in inspector
18. **Polish** — Animations, localStorage persistence, edge cases, mobile
19. **Remove dead code** — Old `showChat`, `showSkills`, `showAuditPanel` state

---

## What This Replaces

| Before | After |
|--------|-------|
| Chat fixed on left, eats 55% of width | Chat in right-side panel, user-controlled width |
| Skills panel takes entire column | Skills are chips inside chat header |
| AT A GLANCE in spreadsheet cells | KPI dashboard in Insights panel |
| Audit hidden behind View > Auditor menu | Audit in rail icon, auto-runs, status bar indicator |
| Formula cells are opaque | Inspector panel explains any formula |
| Three panels can open simultaneously | One panel at a time, grid always usable |
| Grid gets 40% width with tools open | Grid never goes below 60% width |
| Import → see raw grid | Import → Insights panel auto-opens with summary |

---

## What We're NOT Doing in Phase 1

- No full drag-to-any-position floating (v2 — add "pop out" button later)
- No LLM calls for insights (everything is deterministic/computed)
- No server-side changes
- No new npm dependencies for the panel system (pure React + Tailwind)
- No changes to the auditor rules (they're already solid)
- No mobile-specific layout yet (v2 — panels become bottom sheets)

---

## Dependencies

All of these already exist and just need to be wired up:
- `computeSheetInsights()` — computes key numbers
- `buildSheetProfile()` — detects sheet purpose
- `runAudit()` — finds formula issues
- HyperFormula dependency graph — tracks cell relationships
- `cellToRef()` / `refToCell()` — cell coordinate utilities

The implementation is primarily UI/component work + glue code. No new algorithms needed.
