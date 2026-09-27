# Strategy: Useful First, Unique Second

**Status:** Living — current forward plan  
**Date:** 2026-09-24 (updated 2026-09-25)  
**Principle:** Ship a spreadsheet people can trust and finish work in. Differentiation (auditor, privacy, formatting polish) comes after the core job works.

> **Trust code over reviews.** Several docs in `docs/` are historical snapshots. Prefer this file + `package.json` + current `src/` over stale review claims.

---

## 1. North star

**Core job (must work):**

```
Import → Trust numbers → Understand structure → Ask grounded questions → Safe edit → Format polish
```

**Not the job (v1):**

- Unbounded autonomous agent (plan → tool → observe → replan forever)
- Replace Excel / Google Sheets for teams
- Uniqueness theater (stub NLP, unused ONNX upload, collab before usefulness)

**Agent posture:** Bounded tools with preview/undo. Formatting and tedious styling are in-scope. Open-ended workbook rewriting is not.

---

## 2. P0 Backlog — Useful First

| ID | Item | Status | Notes |
|----|------|--------|-------|
| **P0.1** | Formula engine parity | **DONE** | On `@ocean8219/formualizer@^0.9.3`. Gaps doc updated; golden-set realengine tests extended. |
| **P0.2** | Import honesty | **DONE** | Warn when formulas use Excel cached values / styles appear dropped. Surfaced via import meta → chat/toast. |
| **P0.3** | Act-path safety | **DONE** | `apply_formula` gap detection + Apply/Reject preview; `confirmGaps` override. |
| **P0.4** | Activation UI | **DONE** | Overlay waits for audit/grace; never auto-dismisses on critical/high; lists finding titles. |
| **P0.5** | AI quality loop (foundation) | **DONE** | Thumbs + optional detail on thumbs-down for failover analysis. |

### Implementation paths

| ID | Key files |
|----|-----------|
| P0.1 | `docs/formualizer-gaps.md`, `src/engine/formualizer.realengine.test.ts` |
| P0.2 | `src/io/xlsx.ts`, `src/store/importOrchestration.ts`, `src/components/Toolbar.tsx` |
| P0.3 | `src/agent/toolHandlers/columnOps.ts`, `src/lib/previewBuilders.ts`, `src/store/slices/chatSlice.ts` |
| P0.4 | `src/components/ImportInsightsOverlay.tsx` |
| P0.5 | `src/ai/chatFeedback.ts`, `src/components/ChatPanel.tsx` |

---

## 3. Priority order going forward

### P0 — Useful — **COMPLETE (2026-09-25)**

Gate before uniqueness spend (smoke-test after sync):

1. Import a representative budget (.xlsx)  
2. Key totals match Excel (or user is warned)  
3. Insights + critical audit findings visible without chat  
4. ≥5 grounded Q&A turns without nonsense  
5. Safe edits with preview / undo  
6. No marketing claims for stub surfaces  

### P1 — Competitive polish (including formatting sandbox) — **NEXT**

| ID | Work | Outcome |
|----|------|---------|
| P1.1 | Extend `format_cells` | Expose `CellFormat`: underline, strikethrough, fontFamily, align, wrap, borders |
| P1.2 | Layout tools | Agent + sandbox: column width / row height |
| P1.3 | Parser phrases | NL coverage for borders, auto-fit, row height, fonts |
| P1.4 | Style recipes | Bounded macros: `header`, `total_row`, `table_polish` (preview once) |
| P1.5 | Free-tier alignment | Gate auto-fix depth, not first understanding |

**In scope:** cell styles, borders, fonts, sizes, alignment, wrap, row/col sizing, preset recipes.  
**Out of scope:** Excel group/outline hierarchy (unless UI supports it), unbounded “make it pretty”, open autonomy loops.

### P2 — Unique (last)

| ID | Work |
|----|------|
| P2.1 | Auditor as brand / free viral audit funnel |
| P2.2 | Honest privacy/BYOK narrative (no stub NLP claims) |
| P2.3 | Kill or ship façades (NLP MiniLM / ONNX upload) |

---

## 4. Formatting sandbox strategy (P1 detail)

```
NL → Pipeline (regex / macro / LLM)
   → format_cells | layout tools | style recipes
   → Apply/Reject (LLM) or single undo (safe regex)
   → Store mutations (setCellFormat / setColumnWidth / setRowHeight)
```

Same executor spine. No new agent runtime.

1. Wire `buildFormatPatch` + tool schema to full `CellFormat`  
2. Add layout tools + ExecutionContext hooks  
3. Sandbox API parity  
4. Parser + false-positive corpus tests  
5. Preset recipes via macro/template — preview bulk format  

---

## 5. Doc hierarchy

| Layer | Role | Canonical files |
|-------|------|-----------------|
| **Living strategy** | What we build next | **This file** |
| **Product truth** | Public claims | `README.md`, landing — must match code |
| **Ops** | Deploy / env | `DEPLOY.md`, `ENV.md` |
| **Change log** | What landed | `MAJOR_CHANGES.md` |
| **Historical** | Context only | `docs/ARCHIVE.md` |
| **Planning specs** | Architecture intent | `docs/planning/*` — verify against `src/` |

---

## 6. Explicit non-goals

- Cursor-like unbounded agent loop  
- More LLM backends before trust is green  
- Collaboration / marketplace before core trust  
- Expanding uniqueness narrative while core job fails  

---

## Related

- Planning priorities: [`docs/planning/README.md`](../planning/README.md)  
- Formatter sketch: [`docs/planning/11-tools-formatter.md`](../planning/11-tools-formatter.md)  
- Engine gaps: [`docs/formualizer-gaps.md`](../formualizer-gaps.md)  
- Archived reviews: [`docs/ARCHIVE.md`](../ARCHIVE.md)
