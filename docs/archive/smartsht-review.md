# SmartSht Review


---

## What's Unique

**The hybrid AI architecture is the standout feature.** The app routes ~80% of operations through a local regex parser (`src/agent/parser.ts`) with zero LLM roundtrip — sort, format, add row, sum, etc. happen instantly. Only genuinely complex questions hit the LLM server. This means the app works without any backend for most tasks, and latency is near-zero for common operations. Most AI spreadsheet products are fully LLM-dependent; this is architecturally different.

**The spreadsheet auditor is also genuinely novel.** 10 client-side rules (range gaps in SUMs, inconsistent formulas, hardcoded constants, etc.) producing a health score — this doesn't exist in Google Sheets or Excel. It's a real product differentiator.

**50+ declarative templates** is a large library for a v0.1.0 product. The template system is well-designed: tool definitions in `shared/toolRegistry.ts`, declarative `TemplateSpec` objects in `src/templates/` category files (core, personal-finance, freelancer, real-estate, small-business, education, health, saas-demo) aggregated by `src/templates/registry.ts`, and a prompt router that maps natural language to tools.

---

## What's Lacking

### 1. The Store is a God Object
`src/store/useStore.ts` is **1,613 lines** with ~178 actions covering workbook state, chat, AI processing, clipboard, sorting, filtering, charts, file management, undo/redo, and toasts. This is the single biggest architectural risk. It mixes:
- Workbook data mutations
- Chat/AI orchestration (the `sendMessage` action alone is massive)
- UI state (dialog visibility, panel widths)
- File system management
- Clipboard operations

**Recommendation:** Split into domain slices (`useWorkbookStore`, `useChatStore`, `useUIStore`, `useFileStore`). Zustand supports this natively with `combine` or separate stores. The `sendMessage` logic (which calls into `brain.ts`, handles streaming, processes tool results, runs audits) should be extracted into a service.

### 2. The Server is Under-Utilized
The server is only **~4,291 lines** and is essentially a proxy that forwards to LLM providers. The chat endpoint (`/api/chat/stream`) handles ~200 lines of routing logic, but most business logic lives client-side. The server lacks:
- **Rate limiting** (beyond basic Clerk auth)
- **Request validation** (no zod/joi schemas on incoming requests)
- **Response caching** (identical queries hit the LLM every time)
- **WebSocket support** for real-time collaboration (only SSE for streaming)

### 3. No E2E or Integration Tests
There are **29 test files**, all unit tests covering utility functions and the deterministic AI path. There are **zero** tests for:
- Component rendering (no React Testing Library)
- The full chat flow (client → server → LLM → response)
- The audit engine end-to-end
- Import/export (xlsx, JSON)
- Cloud sync
- Stripe webhook handling

For a v0.1.0 this is fine, but before any scale the test pyramid needs work.

### 4. `SpreadsheetGrid.tsx` is ~1,008 Lines
The grid component handles rendering, selection, editing, context menus, find/replace, conditional formatting, data bars, color scales, icon sets, cell notes, touch gestures, and filtered row indices — all in one component. This needs decomposition.

### 5. Error Handling is Inconsistent
The server uses `try/catch` with generic error messages in many places. The client store has scattered `try/catch` blocks. There's no centralized error boundary, no structured error types, and no error reporting to a service (like Sentry).

### 6. No Collaboration Features
Sharing exists (read-only links), but there's no real-time co-editing, no comments, no cursor presence. For a "spreadsheet that explains itself," collaborative editing is table stakes for adoption.

### 7. No Offline/PWA Strategy
There's a service worker and PWA manifest, but the AI features require the server. There's no strategy for offline-first with AI when back online. The local LLM (Ollama) partially addresses this, but it's not integrated with the service worker.

### 8. Performance Concerns
- **Undo/redo stores full JSON snapshots** (`HistoryEntry.workbook: string`) — this will OOM on large spreadsheets. Should use operational transforms or at least diff-based history.
- **Conditional formatting recomputes on every render** — `conditionalFormat.ts` (~537 lines) recalculates color scales, data bars, and icon sets per cell per render. No memoization visible.
- **The grid uses viewport-based row virtualization** (startRow/endRow from scroll position with a fixed buffer), but lacks column virtualization for wide sheets. The buffer size is a fixed constant rather than adaptive, and for 10,000+ row sheets with complex conditional formatting the render cycle could still be heavy.

---

## What Can Be Improved

| Area | Current | Recommendation |
|------|---------|----------------|
| State management | 1,613-line god store | Slice into domain stores |
| Server architecture | Monolithic `index.ts` (626 lines) | Extract middleware, validation, error handling |
| Test coverage | Unit tests only (~29 files) | Add component + integration + E2E tests |
| Grid component | ~1,008 lines, does everything | Extract: CellRenderer, SelectionHandler, ContextMenu, ConditionalFormatter |
| Error handling | Ad-hoc try/catch | Centralized error boundary + structured error types |
| Bundle size | No code splitting visible | Lazy-load dialogs, panels, template gallery |
| Accessibility | Some aria attributes | Full keyboard nav for grid, screen reader announcements |
| i18n | Hardcoded English strings | Extract to locale files (brand voice can still be playful) |
| Performance | Full-snapshot undo history | Diff-based undo, memoized conditional formatting |

---

## Summary

**smartsh!t is a well-scoped v0.1.0 with a genuinely unique AI architecture.** The hybrid deterministic/LLM approach is the right call — it's faster, cheaper, and more reliable than pure-LLM competitors. The auditor is a real differentiator.

The biggest risks are the monolithic store, the ~1,008-line grid component, and the lack of tests beyond unit level. The template library is impressive but the data files (`personal-finance.ts` at 1,900 lines) are getting large — consider a JSON/DB-backed template registry if this keeps growing.

For v0.2, I'd prioritize: **store decomposition**, **grid component splitting**, and **adding E2E tests**. Those three changes unlock everything else (collaboration, performance, accessibility).