# Archived Documentation

Everything under `docs/archive/` is historical: plans that were executed, reviews whose findings were addressed, specs that were superseded, and assessments of a prior state of the codebase. They are kept for context and decision history, not as a description of the current system. Trust the code and the live docs below first.

**For current documentation, see:**
- `strategy/2026-09-24-usefulness-first-strategy.md` — Living forward plan (useful first, unique second)
- `BACKLOG.md` — Open product and code work outside the strategy (incl. P2.3)
- `MAJOR_CHANGES.md` — Running log of substantive changes
- `DEPLOY.md` — Production deployment guide
- `ENV.md` — Environment variable reference
- `formualizer-gaps.md` — Formula engine divergences (kept current)
- `../src/ai/pipeline/` — The chat routing pipeline (the code is the source of truth; `archive/intent-unification-migration.md` is out of date)
- `../README.md` — Project overview and quick start

---

## Archived Reviews (findings addressed)

| File | Date | Context |
|------|------|---------|
| `archive/major-review.md` | Aug 2026 | Architecture + AI model fitness review. Most findings resolved (see MAJOR_CHANGES.md 2026-08-09). |
| `archive/review.md` | Aug 3, 2026 | Full project review. Release-blocking bugs fixed. |
| `archive/smartsht-review.md` | Jul 2026 | Earlier architecture review. |
| `archive/repo-assessment-2026-07-24.md` | Jul 24, 2026 | Initial assessment. |
| `archive/release-audit-2026-07-25.md` | Jul 25, 2026 | Point-in-time pre-launch audit. Env var names and test counts are stale — see ENV.md and the README. |
| `archive/ai-model-audit.md` | Aug 5, 2026 | AI model layer audit. Status header added noting fixes. |
| `archive/engine-review.md` | Jul 2026 | Formula engine review. |
| `archive/agent-engine-code-review.md` | Jul 2026 | Agent system review. |
| `archive/component-analysis.md` | Jul 2026 | UI component analysis. |
| `archive/review8.16.2026.md` | Aug 16, 2026 | README-vs-reality analysis. Feature table and counts are out of date. |
| `archive/nov.review-file.md` | Sep 8, 2026 | Repo review at `0cd7527` (despite the name, not November). Findings were worked through. |
| `archive/chat-prompt/chat-service-review-2026-09-30.md` | Sep 30, 2026 | Chat service review. Addressed by PRs #45, #47 and #48. |

## Archived Fix Plans (executed)

| File | Status | What it covered |
|------|--------|----------------|
| `archive/architecture-fix-plan.md` | ✅ Executed | Error boundaries, stability fixes |
| `archive/engine-fix-plan.md` | ✅ Executed | Formula engine bugs |
| `archive/review-corrections-plan.md` | ✅ Executed | Factual corrections to review docs |
| `archive/server-restructure-plan.md` | ✅ Executed | Server deployment restructure |
| `archive/chat-prompt/chat-fixes-phase-1.md` | ✅ Executed | Phase 1 application fixes (PR #45) |

## Archived Planning and Design Docs

| File | Status | Notes |
|------|--------|-------|
| `archive/planning/01-…` to `21-architecture-overview.md` | Reference only | A Python "Spreadsheet Brain" spec extracted from `images/notes`. smartsh!t is TypeScript and its brain layer followed the roadmap, not this spec. `19-brain-orchestrator.md` is explicitly deprecated. |
| `archive/planning/21-sandbox-execution-engine.md` | ✅ Implemented | QuickJS sandbox (phases 1-5). Checkboxes were never ticked. |
| `archive/planning/22-gap-analysis-smartshit.md` | Superseded | Written before the brain roadmap landed. |
| `archive/planning/23-implementation-roadmap.md` | ✅ Implemented | Phases 0-7 landed 2026-07-07. |
| `archive/planning/24-chat-system-improvements.md` | Done / superseded / deferred | See the status block in the file. |
| `archive/planning/25-cloud-infrastructure-plan.md` | ✅ Implemented | RDS + S3. Names the old BurntBeats AWS resources, which production no longer uses. |
| `archive/auditor/auditor-plans.md` | ✅ Shipped | The auditor, custom rules and status-bar badge all exist. |
| `archive/chat-prompt/chat.md` | Stale | A pasted prompt-design conversation, not a spec. |
| `archive/intent-unification-migration.md` | Historical | Its own header says the pipeline has since grown several stages. |

Still live under `planning/`: `phase-1-implementation.md` and `22-seo-paywall-polish.md` (partly open) and the README.

## Reference Material (still relevant)

| File | Purpose |
|------|---------|
| `PRICING_AND_MONETIZATION_PLAN.md` | Business model decisions |
| `LICENSING.md` | License history and GPLv3 resolution |
| `NAMING.md` | Naming conventions |
| `flame-ai.md` | Academic reference (FLAME paper) |
| `spreadsheetllm.md` | Academic reference (SpreadsheetLLM) |
| `ai-formula-parser.md` | Formualizer parser design notes |
| `verification-backlog.md` | Things a code review could not verify without live keys or infrastructure |
