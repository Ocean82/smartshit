# Audit Custom Rules & Formula Auto-Fixes — Design

Date: 2026-07-31
Status: Approved (approach A + all 3 sections)

## Goal

Make the spreadsheet auditor adaptable for domain-specific workflows and close the loop between finding an error and fixing it:

1. **Custom User Rules** — let users define form-based, domain-specific audit rules (e.g. "Flag any expense line item exceeding department threshold $X") without writing code.
2. **Formula Auto-Fixes** — one-click fixes that automatically correct flagged issues (range gaps already covered; add magic-number → input-cell conversion).

## Approach

**Approach A — Extend the existing auditor.** The auditor (`src/auditor/`) is a clean, single-purpose engine with a working find→fix pipeline. We extend it rather than building a separate rule engine:
- add a `customRules` module + optional param to `runAudit`;
- upgrade `fixAction` (single write) to `fixActions` (array of writes);
- add a "Custom Rules" manager inside the existing Auditor panel.

## Current State (as-built facts)

- Auditor: `src/auditor/index.ts` (`runAudit`), `src/auditor/types.ts`, `src/auditor/rules/*` (10 hardcoded rules), `src/auditor/utils.ts`.
- `AuditFinding` already has `autoFixable: boolean` and `fixAction?: { cellId; formula?; value? }` (single write). Only `rangeGaps` emits fixable findings today.
- UI: `AuditPanelContent` runs the audit and applies fixes; `AuditFindingCard` renders the APPLY FIX button.
- Store API used by fixes: `setCellValue(cellId, value, formula?)`, `pushHistory(desc)`.
- Persistence pattern precedent: `src/lib/communityTemplates.ts`, `src/lib/cellNotes.ts`, `src/ai/chatFeedback.ts` (localStorage load/save modules).

## Section 1 — Custom Rules Engine & Persistence

New file `src/auditor/customRules.ts`:

```ts
interface CustomAuditRule {
  id: string              // stable id, e.g. generated
  name: string            // user label, shown in findings
  column: string          // column letter, e.g. "B"
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq' | 'contains' | 'notContains' | 'isEmpty' | 'isNotEmpty'
  value: string | number  // threshold (ignored for isEmpty/isNotEmpty)
  severity: Severity
  enabled: boolean
}
```

- `loadCustomRules(): CustomAuditRule[]` and `saveCustomRules(rules): void`, persisted under `localStorage['smartsht-audit-rules']` (mirrors `communityTemplates`/`cellNotes` pattern; safe try/catch around storage access).
- `runAudit(sheet, getComputedValue, customRules: CustomAuditRule[] = [])` — optional third param, backwards compatible. Built-in rules run exactly as today; custom rules run after, one `AuditRule` wrapper each.
- Custom rule evaluation over `AuditContext`:
  - column letter resolved via `letterToCol`; rule skipped if invalid/disabled.
  - numeric operators (`gt|lt|gte|lte|eq|neq`): parse `rawValue` with `parseFloat`; non-numeric cells skipped; numeric strings compared numerically.
  - text operators (`contains|notContains`): match against `String(rawValue)`.
  - `isEmpty|isNotEmpty`: based on cell presence/emptiness (empty cells considered via `ctx.getColumn` + cell existence).
  - each match emits a finding `{ ruleId: "custom:<id>", severity: rule.severity, title: rule.name, message: "<cell> — <column> <op> <value>", cells: [match], autoFixable: false, suggestion: "<name>: <column> must be <op> <value>" }`.
- Disabled or invalid rules are skipped. One bad custom rule never crashes the audit (same try/catch pattern as built-ins).

## Section 2 — Multi-Write Auto-Fix & Magic-Number Fix

### Fix model upgrade (`src/auditor/types.ts`)

Replace `fixAction?: { cellId; formula?; value? }` with:

```ts
fixActions?: Array<{ cellId: string; formula?: string; value?: string | number | null }>
```

- One finding can now write multiple cells (e.g. constant to input cell + rewritten formula).
- Consumers updated: `rangeGaps.ts` (emit) and `AuditPanelContent.handleFix` (apply). `AuditFindingCard` unchanged.

### Magic-number rule (`src/auditor/rules/hardcodedConstants.ts`)

When a suspicious constant is found (existing tokenization logic preserved):

1. Find target input cell = first empty cell in the same row, scanning right from the formula's column. The rule runs after `runAudit` has the full cell map via `ctx.getCellAt`.
2. Fix writes:
   - `{ cellId: target, value: <the constant> }`
   - `{ cellId: formulaCell, formula: <original formula with the literal replaced by target ref> }` — replace the first standalone occurrence of the number token in the already ref/range-stripped formula, using the same token boundaries the rule uses today.
3. `autoFixable: true` only when a target cell was found AND the literal is safely replaceable; otherwise `autoFixable: false` (current behavior preserved).

### Apply path (`src/auditor` UI + store)

- `handleFix` iterates `finding.fixActions`, calls `store.setCellValue(cellId, value, formula)` for each, pushes one history entry (`pushHistory('Audit auto-fix')`), then re-runs the audit (existing behavior, generalized to the array).

## Section 3 — UI Integration & Testing

### UI (`src/components/panels/AuditPanelContent.tsx`)

Collapsible **"Custom Rules"** manager above the findings list, in the panel's existing visual language:

- list of saved rules with enable/disable toggle, edit, delete;
- **Add/Edit rule** form: column dropdown (populated columns of the active sheet, labeled with header text when the first row is a string, e.g. `B — Amount`), operator dropdown, threshold input (number or text depending on operator), severity dropdown, name field.
- any rule change (add/toggle/edit/delete) saves to localStorage and re-runs the audit automatically.

Auto-fix button in `AuditFindingCard` stays as-is (now driven by `fixActions`); magic-number findings show the same APPLY FIX button as range-gap findings.

### Tests

- `src/auditor/customRules.test.ts` (new):
  - threshold rule flags matching rows;
  - text `contains` / `isEmpty` operators;
  - disabled/invalid rules skipped;
  - non-numeric cells skipped for numeric operators;
  - suggestion + severity wiring; persistence round-trip.
- `src/auditor/__tests__/auditor.integration.test.ts` (extend):
  - custom rule runs alongside built-ins;
  - magic-number finding carries a two-write `fixActions` array with a valid target cell + rewritten formula.
- Existing `hardcodedConstants` / `rangeGaps` behavior preserved (regression via current suite).

### Verification

- `npx eslint src`
- `npx tsc --noEmit`
- `npx vitest run`

## Non-Goals

- No expression DSL / JS predicates for custom rules (form-based only).
- No per-workbook rule persistence (localStorage only for now).
- No auto-fix for error cells, circular refs, orphans, duplicates, etc. (out of scope).
- No auto-fix for custom rules (flagging only).
