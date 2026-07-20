# Planning Documents

These documents describe the technical architecture of smartsh!t's internal systems.

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

## Document Index

| # | Document | What It Covers |
|---|----------|---------------|
| 01 | Overview & Project Structure | File layout and module responsibilities |
| 02 | Requirements & Config | Environment variables, dependencies |
| 03 | Data Models | TypeScript types for cells, sheets, workbooks |
| 04 | Memory Context | How the AI sees the spreadsheet state |
| 05 | Memory Sheet State | Sheet snapshot construction |
| 06 | Chat Intent Parser | NL → intent classification |
| 07 | Chat Response Builder | Structured results → user-facing messages |
| 08 | Tools: Reader | Read-only analysis tools |
| 09 | Tools: Analyzer | Statistical analysis pipeline |
| 10 | Tools: Writer | Cell mutation tools |
| 11 | Tools: Formatter | Formatting/conditional formatting |
| 12 | Tools: Formula Engine | HyperFormula integration |
| 13 | Tools: Chart Engine | Chart creation |
| 14 | Tools: Query Engine | Data querying (top N, filter, compare) |
| 15 | Skills: Budget | Budget-specific analysis |
| 16 | Skills: Cleaning | Data cleaning operations |
| 17 | Skills: Reporting | Report generation |
| 18 | Package Exports | Module boundary design |
| 19 | Brain Orchestrator | Message routing (deterministic → LLM) |
| 20 | Integration Example | End-to-end flow walkthrough |
| 21 | Architecture Overview | System architecture diagram |
| 22 | Gap Analysis | What's missing vs. the vision |
| 23 | Implementation Roadmap | Phased build plan (technical) |
| 24 | Chat System Improvements | LLM intent parsing, clarification, feedback |
| 25 | Cloud Infrastructure | Deployment, scaling, Postgres plans |

---

## Related Docs

- [Product Roadmap](../project_outline/roadmap-v1.md) — what we're building and when
- [Product Vision](../project_outline/outline.md) — why this exists and who it's for
- [Auditor Plans](../auditor/auditor-plans.md) — the formula auditor architecture
