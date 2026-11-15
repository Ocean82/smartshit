# Cleanup plan — 2026-11-15

## Completed this pass (quick wins)
- Recovered misplaced `auditFixAction` test → `src/store/__tests__/auditFixAction.test.ts` (3/3 pass).
- Repaired `VersionHistoryPanel.test.ts` H4 test to mock `useAuthStatus` as signed-in (3/3 pass).
- Merged PR #86 (docs/ops-2026-11-13); pulled; removed worktree + branch.
- Aligned landing brand spelling with `docs/NAMING.md` (`smartsht` → `smartsh!t` in titles/og:title/site_name/description) and regenerated agent markdown (`npm run markdown:pages`).
- Removed stale `llmIntentParser.ts` reference from `server/src/providers.ts` header.
- Removed scratch `plan.ts`.
- Repo now clean on `main` at `ba29ed7` (+ merge `0193480`/`5f54ebb`).

## Verification
- `tsc --noEmit`: clean.
- `npm test`: 6 failing files / 32 failing tests, all pre-existing and **network/Clerk-dependent** (cloudSync, serverHealth, useSubscriptionStatus, sendMessage, startCheckout, useAutoFixGate). None caused by this pass; they need Clerk keys / a running server to pass. Investigate separately.

## Remaining backlog (docs/BACKLOG.md, 42 open) — triaged

### Tier 1 — small, low-risk, do next
- #174 Health badge on sheet tabs (S)
- #176 Audit findings in inspector (S)
- #177 Top categories on import card (S, data computed)
- #182 Import warning for formulas engine gets wrong (S)
- #183 Engine golden tests for upstream issues (S)
- #268 Issue count in status bar (S)
- #280 Server-side Sentry + unhandledRejection handler (S)
- #294 Ollama Modelfile* tool-list drift (ops)

### Tier 2 — medium, contained
- #175 Critical-findings banner (S–M)
- #178 Copyable/exportable audit report (M)
- #179 Formula explainer coverage (M)
- #180 Selection-aware chat (M)
- #181 Selection-based suggestions + "Explain cell" (S–M)
- #252 Trend/month-over-month analysis (M)
- #254 Downstream impact "what if" (M)
- #255 Health-score history (M)
- #256 "Is this right?" scoped audit (S–M)
- #257 Stale/outdated data rule (M)
- #260 fill_missing / convert_types cleaning (M)
- #261 Pivot-based report (M)
- #264 Formula-bar autocomplete (S–M)
- #265 Pivot Table in toolbar/context menu (S–M)
- #269 Dark mode (M)
- #281 Server integration/validation tests + xlsx round-trip (M)
- #282 LRU eviction of local workbooks (M)
- #284 Mobile cell editing confirmation (S–M)
- #303 AI formula args with named ranges (S–M)

### Tier 3 — large / structural (schedule, not quick wins)
- #244 Server re-classifies every request (M–L)
- #267 Guided formula builder (L)
- #279 Native tool calling (L)
- #300 Imported formulas recalculate (L)
- #301 Section detection + outline (M–L)
- #302 More intent-engine goals (M–L)
- #293 SpreadsheetGrid.tsx size refactor (M)

### Tier 4 — FLAGGED FOR REVIEW (may alter project intent/function)
- #22 P2.3 Kill or ship façades (MiniLM/ONNX) — affects product claims.
- #33 Community template marketplace — conflicts with strategy non-goals.
- #270 Deferred styled xlsx export / status-bar aggregates / AutoSum.
- #275 Pro-only templates / weekly export cap — monetization change.
- #288 Dead code `processMessage` (tests only) — deleting removes tests; confirm.
- #247 Credential rotation — manual ops check, not code.

### Tier 5 — ops/manual
- #247 (above) credential rotation verification.

## Housekeeping still open
- `.agents/tasks/` metadata is stale (PRs marked OPEN that are merged). Archive or refresh at your discretion; not touched this pass.
- Investigate the 6 pre-existing network/Clerk test failures to get to a fully green suite.
