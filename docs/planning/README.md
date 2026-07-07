# Spreadsheet Brain Planning Docs

Section-by-section extraction of the Spreadsheet Brain agent tools and skills system spec.

Source: [`docs/images/notes`](../images/notes)

## Sections

### Foundation
- [01-overview-and-project-structure.md](./01-overview-and-project-structure.md) — Package layout
- [02-requirements-and-config.md](./02-requirements-and-config.md) — Dependencies and config
- [03-data-models.md](./03-data-models.md) — Shared enums and dataclasses

### Memory Layer
- [04-memory-context.md](./04-memory-context.md) — Conversation and spreadsheet context
- [05-memory-sheet-state.md](./05-memory-sheet-state.md) — Undo/redo state manager

### Chat Layer
- [06-chat-intent-parser.md](./06-chat-intent-parser.md) — NL → intent parsing
- [07-chat-response-builder.md](./07-chat-response-builder.md) — Tool result formatting

### Tools Layer
- [08-tools-reader.md](./08-tools-reader.md) — File read and profiling
- [09-tools-analyzer.md](./09-tools-analyzer.md) — Analysis and insights
- [10-tools-writer.md](./10-tools-writer.md) — Data writes and mutations
- [11-tools-formatter.md](./11-tools-formatter.md) — Formatting
- [12-tools-formula-engine.md](./12-tools-formula-engine.md) — Formulas
- [13-tools-chart-engine.md](./13-tools-chart-engine.md) — Charts
- [14-tools-query-engine.md](./14-tools-query-engine.md) — NL queries

### Skills Layer
- [15-skills-budget.md](./15-skills-budget.md) — Budget workflows
- [16-skills-cleaning.md](./16-skills-cleaning.md) — Data cleaning
- [17-skills-reporting.md](./17-skills-reporting.md) — Reporting

### Orchestration
- [18-package-exports.md](./18-package-exports.md) — Package exports
- [19-brain-orchestrator.md](./19-brain-orchestrator.md) — Main brain router
- [20-integration-example.md](./20-integration-example.md) — Agent integration patterns
- [21-architecture-overview.md](./21-architecture-overview.md) — Architecture and design decisions

## Suggested reading order

1. Overview → Models → Architecture
2. Memory + Chat (routing and responses)
3. Tools + Skills (capabilities)
4. Brain orchestrator + Integration example

## Mapping to smartsh!t

This Python reference architecture informs the TypeScript AI brain work in `server/src/mode.ts`, `src/ai/sheetInsights.ts`, and related chat routing.

**Gap analysis:** [22-gap-analysis-smartshit.md](./22-gap-analysis-smartshit.md) — what’s implemented vs what’s still missing.
