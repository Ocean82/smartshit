# Planning Documents

> **Living forward plan:** [`docs/strategy/2026-09-24-usefulness-first-strategy.md`](../strategy/2026-09-24-usefulness-first-strategy.md)  
> Useful first, unique second. P0 complete; formatting sandbox is P1.

## Core Focus

smartsh!t is a **spreadsheet understanding tool**. The AI and tooling exist to help users
comprehend, navigate, and trust spreadsheets they didn't build.

### Priority Order
1. **Proactive intelligence** — show insights before the user asks
2. **Auditing** — catch formula errors and data quality issues
3. **Navigation** — help users find what they need in complex sheets
4. **Conversational Q&A** — answer questions about specific data
5. **Actions** — let users modify the sheet via natural language (secondary)

### Key Principle
The chat panel is a **power-user tool**, not the primary interface.
The primary interface is the spreadsheet itself — enhanced with overlays,
inspectors, and proactive insights that surface automatically.

---

## What is here

| Document | Status |
|----------|--------|
| [Phase 1 implementation](phase-1-implementation.md) | Proactive intelligence and the panel rail. Largely shipped (audit on import, status-bar issue count). Checkboxes were not kept up to date. |
| [SEO, paywall and polish](22-seo-paywall-polish.md) | Production-readiness assessment with action items. Partly open. |

## Archived

The rest of this folder (the numbered `01`–`25` specs, the gap analysis, the implementation roadmap, the chat-system and cloud plans) is historical and now lives in [`../archive/planning/`](../archive/planning/). The `01`–`21` documents are a Python "Spreadsheet Brain" spec that the TypeScript brain layer did not follow literally. See [`../ARCHIVE.md`](../ARCHIVE.md) for what each one was and why it was retired.

## Related Docs

- [Product Roadmap](../project_outline/roadmap-v1.md) — what we're building and when
- [Product Vision](../project_outline/outline.md) — why this exists and who it's for
- [Auditor plans (archived)](../archive/auditor/auditor-plans.md) — the original formula auditor design; the auditor has shipped
