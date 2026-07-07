# Architecture Overview

> System diagram and key design decisions.

> Source: [`docs/images/notes`](../images/notes)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    YOUR AGENT                            │
│              (LangChain / Custom / etc.)                 │
└──────────────────────┬──────────────────────────────────┘
                       │  brain.process(message, file)
                       ▼
┌─────────────────────────────────────────────────────────┐
│                 SpreadsheetBrain                         │
│  ┌──────────────┐  ┌────────────┐  ┌────────────────┐  │
│  │ IntentParser │→ │  Dispatch  │→ │ ResponseBuilder│  │
│  │  (NL→Intent) │  │  (Router)  │  │  (→Chat text)  │  │
│  └──────────────┘  └─────┬──────┘  └────────────────┘  │
│                          │                               │
│         ┌────────────────┼────────────────┐              │
│         ▼                ▼                ▼              │
│  ┌────────────┐  ┌────────────┐  ┌────────────────┐    │
│  │   TOOLS    │  │   SKILLS   │  │    MEMORY      │    │
│  │ • Reader   │  │ • Budget   │  │ • Context      │    │
│  │ • Analyzer │  │ • Cleaning │  │ • SheetState   │    │
│  │ • Writer   │  │ • Reporting│  │ • Undo/Redo    │    │
│  │ • Query    │  │ • Inventory│  │                │    │
│  │ • Formula  │  └────────────┘  └────────────────┘    │
│  │ • Chart    │                                         │
│  │ • Formatter│                                         │
│  └────────────┘                                         │
└─────────────────────────────────────────────────────────┘
```

**Key design decisions:**

1. **Single entry point** — `brain.process()` handles everything, your agent doesn't need to know which tool to pick
2. **Intent-based routing** — natural language is parsed into structured intents, then dispatched to the right handler
3. **Stateful** — conversation history + spreadsheet state are tracked across turns so the user can have a natural conversation
4. **Undo/redo** — any mutation snapshots state first
5. **Auto-detection** — column roles, data types, and document purpose are detected automatically so the user doesn't have to explain their data
6. **Uniform output** — every handler returns a `Dict` with `response`, `data`, `suggestions`, `chart_config` — your frontend just renders what's present

