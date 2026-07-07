# Gap Analysis: Spreadsheet Brain Spec vs smartsh!t (Current)

> Compares the reference architecture in [`docs/images/notes`](../images/notes) (extracted into `docs/planning/`) against the **current** smartsh!t TypeScript implementation as of the AI Brain Layer work.

## Executive summary

smartsh!t has implemented a **thin brain layer** — mode routing, structured context, and basic sheet insights — but it is still far from the full Spreadsheet Brain spec. The biggest wins are already in place for the user pain points ("explain instead of create", "see uploaded data"). The largest gaps are **deep analysis**, **domain skills**, **query/filter/sort tools**, and a **unified orchestrator** with undo-aware mutations.

| Area | Spec ambition | Current state | Gap severity |
|------|---------------|---------------|--------------|
| Intent routing | 17+ `IntentType` values, scored NL parser | 5 modes + keyword templates | Medium |
| Sheet profiling | Full `SheetProfile` + `ColumnRole` detection | Basic `SheetInsights` heuristics | High |
| Tools | 7 dedicated engines (reader, analyzer, writer, …) | 10 client-side action handlers | High |
| Skills | Budget, cleaning, reporting, inventory | UI skill chips + budget templates only | High |
| Memory | Conversation + sheet state + undo stack | Zustand messages + workbook undo | Medium |
| Orchestrator | Single `brain.process()` dispatch | Split across `index.ts` + `useStore` | Medium |
| File ingest | `brain.load_file()` + auto-profile | Toolbar import + post-import chat hint | Low–Medium |

---

## What is already implemented

### Phase 1 brain layer (done)

| Planning concept | smartsh!t implementation | Notes |
|------------------|---------------------------|-------|
| Intent-based routing | [`server/src/mode.ts`](../../server/src/mode.ts), [`src/ai/mode.ts`](../../src/ai/mode.ts) | Modes: `explain`, `advise`, `act`, `help`, `chat` |
| Question beats action | `classifyMode()` priority rules | Fixes "explain my expenses" → creation bug |
| Explain path (no tools) | [`buildExplainPrompt()`](../../server/src/prompt.ts) in [`server/src/index.ts`](../../server/src/index.ts) | LLM-only, `actions: []` |
| Action path (tools JSON) | [`buildActionPrompt()`](../../server/src/prompt.ts) + [`resolveIntent()`](../../server/src/intent.ts) | Template fast-path for `act` mode |
| Rich context | [`src/ai/buildContext.ts`](../../src/ai/buildContext.ts) | Headers, sample rows, dimensions, selection |
| Sheet insights | [`src/ai/sheetInsights.ts`](../../src/ai/sheetInsights.ts) | Category totals, top expenses, variances, cashflow |
| Post-import awareness | [`importWorkbook()`](../../src/store/useStore.ts), [`Toolbar.tsx`](../../src/components/Toolbar.tsx) | Assistant message after xlsx/csv import |
| Tests | [`server/src/mode.test.ts`](../../server/src/mode.test.ts), [`server/src/intent.test.ts`](../../server/src/intent.test.ts) | 12 tests passing |

### Existing product capabilities (pre-brain)

| Capability | Location |
|------------|----------|
| Spreadsheet engine | [`src/engine/spreadsheet.ts`](../../src/engine/spreadsheet.ts) (HyperFormula) |
| xlsx/csv I/O | [`src/io/xlsx.ts`](../../src/io/xlsx.ts) |
| Template creation actions | [`src/store/useStore.ts`](../../src/store/useStore.ts) `executeAction()` |
| LLM providers (Groq, OpenRouter, HF, Ollama) | [`server/src/index.ts`](../../server/src/index.ts) |
| Skill chips (UI prompts) | [`src/data/skills.ts`](../../src/data/skills.ts) |

---

## Gap analysis by planning section

### Foundation

| Spec section | Status | Gap |
|--------------|--------|-----|
| [01 Overview & structure](01-overview-and-project-structure.md) | Partial | No `brain/` package; logic split across `server/` and `src/ai/` |
| [02 Requirements & config](02-requirements-and-config.md) | Partial | [`server/src/config.ts`](../../server/src/config.ts) has LLM config only; no analysis limits (`max_rows_analysis`, outlier thresholds) |
| [03 Data models](03-data-models.md) | Missing | No `IntentType`, `ColumnRole`, `SheetProfile`, `ToolResult`, `UserIntent` TS types |

**Recommendation:** Add shared types in `src/ai/types.ts` (or `shared/`) mirroring spec models — even if not all are used yet.

---

### Memory layer

| Spec section | Status | Gap |
|--------------|--------|-----|
| [04 Conversation context](04-memory-context.md) | Partial | Chat history in Zustand (`messages[]`); no `tool_used` / `tool_result` on turns |
| [05 Sheet state manager](05-memory-sheet-state.md) | Partial | Workbook undo/redo exists; no AI-mutation snapshots separate from manual edits |
| `get_context_summary()` | Partial | [`buildSpreadsheetContext()`](../../src/ai/buildContext.ts) sends structured JSON; no session metadata or pending clarification queue |

**Recommendation:** Extend `ChatMessage` with optional `toolUsed` and `insightsSnapshot`. Call `pushHistory()` before every `applyAction()`.

---

### Chat layer

| Spec section | Status | Gap |
|--------------|--------|-----|
| [06 Intent parser](06-chat-intent-parser.md) | Partial | Keyword mode classifier only; no scored multi-intent parser, column/sheet extraction, confidence scores |
| [07 Response builder](07-chat-response-builder.md) | Missing | No dedicated formatter for tables, profiles, analysis sections; LLM outputs raw markdown |

**Gaps vs spec intent parser:**

- No `IntentType.READ`, `FILTER`, `SORT`, `COMPARE`, `FIND`, `EXPORT`, etc.
- No regex extraction of column names, sheet names, row ranges
- No compound intent handling ("read and analyze")
- No `confidence` score on parsed intent

**Recommendation:** Evolve `mode.ts` → `intentParser.ts` with structured `UserIntent` output while keeping fast mode routing.

---

### Tools layer

| Spec tool | smartsh!t equivalent | Status |
|-----------|---------------------|--------|
| [08 Reader](08-tools-reader.md) | [`importWorkbookFromFile()`](../../src/io/xlsx.ts) | Partial — loads file, no `SheetProfile` or purpose detection |
| [09 Analyzer](09-tools-analyzer.md) | [`sheetInsights.ts`](../../src/ai/sheetInsights.ts) | Partial — basic stats only; no outliers, trends, correlations, purpose detection |
| [10 Writer](10-tools-writer.md) | `bulkSetCells`, `setCellValue`, `executeAction` | Partial — template writes work; no generic cell/range writer API |
| [11 Formatter](11-tools-formatter.md) | `setCellFormat`, `format_cells` action | Partial — limited formatting vs spec |
| [12 Formula engine](12-tools-formula-engine.md) | HyperFormula + `apply_formula` action | Partial — SUM/AVG/MAX/MIN/COUNT columns only |
| [13 Chart engine](13-tools-chart-engine.md) | `create_chart` action + `ChartConfig` | Partial — UI dialog exists; limited chart intelligence |
| [14 Query engine](14-tools-query-engine.md) | None | **Missing** — no NL → filter/sort/aggregate queries |

**Highest-impact missing tools:**

1. **Query engine** — "show top 5 expenses", "rows where actual > budget"
2. **Deep analyzer** — outlier detection, trend lines, month-over-month
3. **Reader profiling** — `detected_purpose: "budget" | "inventory" | "invoice"`

---

### Skills layer

| Spec skill | smartsh!t equivalent | Status |
|------------|---------------------|--------|
| [15 Budget](15-skills-budget.md) | `sheetInsights` + budget template | Partial — no full `analyze_budget()`, savings rate, 50/30/20 coaching |
| [16 Cleaning](16-skills-cleaning.md) | None | **Missing** — no dedupe, trim, normalize |
| [17 Reporting](17-skills-reporting.md) | None | **Missing** — no markdown report generator |
| inventory.py (referenced in spec tree) | Sales tracker template only | **Missing** — no inventory skill module |

**Note:** [`src/data/skills.ts`](../../src/data/skills.ts) lists KPI Dashboard and Expense Report skills but `executeAction()` has no handlers for `create_kpi_dashboard` or `create_expense_report`.

---

### Orchestration

| Spec section | Status | Gap |
|--------------|--------|-----|
| [19 Brain orchestrator](19-brain-orchestrator.md) | Partial | Dispatch split: server routes chat; client executes actions |
| [20 Integration example](20-integration-example.md) | Partial | No single `brain.process(message, file?)` API |
| [21 Architecture overview](21-architecture-overview.md) | Partial | Missing: uniform `ToolResult`, suggestions array, chart_config in responses |

**Current flow:**

```text
User → ChatPanel → useStore.sendMessage()
  → buildSpreadsheetContext() + sheetInsights
  → POST /api/chat/stream
  → classifyMode → LLM or template
  → client applyAction() for mutations
```

**Spec flow:**

```text
User → brain.process(message, file?)
  → IntentParser → dispatch tool/skill
  → ToolResult → ResponseBuilder
  → uniform { response, data, suggestions, chart_config }
```

---

## User-story coverage

| User story | Works today? | What's missing |
|------------|--------------|----------------|
| "Explain my expenses" | Yes (with LLM) | Stronger offline fallback; cite row numbers more reliably |
| "Read my uploaded budget" | Partial | Import works; profiling is shallow vs spec |
| "Where am I losing money?" | Partial | `negativeVariances` + LLM; no dedicated BudgetSkill coaching |
| "I make $5k/month, how much should I save?" | Partial | Advise mode + LLM; no structured savings calculator |
| "Build a monthly budget" | Yes | Template fast-path unchanged |
| "Clean up this data" | No | Cleaning skill not implemented |
| "Generate a summary report" | No | Reporting skill not implemented |
| "Show top 5 expenses" | Partial | Insights include top expenses; no query engine for arbitrary top-N |
| "Chart spending by category" | Partial | Chart action exists; no auto category detection pipeline |
| Attach file in chat | No | Phase 2 from AI Brain plan |

---

## Priority roadmap (recommended)

### P0 — High impact, builds on existing brain

1. **Structured `UserIntent` parser** — extend mode classifier with column/sheet/range extraction ([06-chat-intent-parser.md](06-chat-intent-parser.md))
2. **Budget skill (TS port)** — port core logic from [15-skills-budget.md](15-skills-budget.md) into `src/ai/skills/budget.ts`; call from `sheetInsights` for advise mode
3. **Query engine (light)** — top-N, filter by column, simple aggregates without full pandas
4. **Chat file attach** — Phase 2 from AI Brain plan; preview-only context path

### P1 — Completeness

5. **Sheet profiling** — `ColumnRole` detection, `detected_purpose`, totals row detection ([09-tools-analyzer.md](09-tools-analyzer.md))
6. **Response builder** — format insights as markdown tables before/after LLM ([07-chat-response-builder.md](07-chat-response-builder.md))
7. **Unified `ToolResult` type** — `{ success, message, data, suggestions, chartConfig }` on all action paths
8. **Wire missing skills** — implement or remove `create_kpi_dashboard`, `create_expense_report` from skills UI

### P2 — Polish & spec parity

9. **Cleaning skill** — dedupe, trim, normalize ([16-skills-cleaning.md](16-skills-cleaning.md))
10. **Reporting skill** — markdown export ([17-skills-reporting.md](17-skills-reporting.md))
11. **Inventory skill** — from spec tree, not yet extracted as own planning file
12. **Single brain entry point** — `src/ai/brain.ts` wrapping server + client dispatch ([19-brain-orchestrator.md](19-brain-orchestrator.md))
13. **Client tests** — `sheetInsights.test.ts` with budget fixture sheets

---

## Architecture differences to preserve

Do **not** blindly port the Python/pandas stack. smartsh!t should keep:

| smartsh!t strength | Spec approach | Keep |
|--------------------|---------------|------|
| HyperFormula live formulas | pandas static DataFrames | Client-side computed values |
| React + Zustand UI | CLI/agent integration | In-browser spreadsheet state |
| SSE streaming LLM | Sync `brain.process()` | Streaming chat UX |
| TypeScript monorepo | Python package | TS tools in `src/ai/` |

Port the **interfaces and behavior**, not the runtime (pandas/numpy/openpyxl on server).

---

## Suggested next planning doc

After this gap analysis, the next useful artifact is:

**`23-implementation-roadmap.md`** — P0 broken into 2-week slices with file-level tasks and acceptance criteria per user story.

---

## Quick reference: file mapping

| Spec module | Target smartsh!t location (proposed) |
|-------------|--------------------------------------|
| `brain.py` | `src/ai/brain.ts` + `server/src/brainRouter.ts` |
| `intent_parser.py` | `server/src/intentParser.ts` (evolve from `mode.ts`) |
| `response_builder.py` | `src/ai/responseBuilder.ts` |
| `context.py` | extend `useStore` messages + `buildContext.ts` |
| `sheet_state.py` | already in `useStore` undo/redo |
| `reader.py` | extend `src/io/xlsx.ts` |
| `analyzer.py` | extend `src/ai/sheetInsights.ts` |
| `query_engine.py` | **new** `src/ai/queryEngine.ts` |
| `skills/budget.py` | **new** `src/ai/skills/budget.ts` |
| `skills/cleaning.py` | **new** `src/ai/skills/cleaning.ts` |
| `skills/reporting.py` | **new** `src/ai/skills/reporting.ts` |
| `models.py` | **new** `src/ai/types.ts` |
