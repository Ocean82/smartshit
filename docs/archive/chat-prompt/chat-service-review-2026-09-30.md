# Chat service: end-to-end architecture and correctness review

**Reviewed:** 2026-09-30  
**Baseline:** `4ec6741f951e65eb2c06aa1f0a46f8baa154899e`  
**Scope:** Chat UI → client routing → spreadsheet context → API → provider inference → response parsing → preview/approval → workbook execution, undo, and persistence.

## Executive assessment

The underlying approach is sensible: use deterministic spreadsheet operations for things that should be exact, keep expensive language-model calls for interpretation, and isolate generated JavaScript in QuickJS. I would keep those foundations.

**The biggest problem is not the choice of model. It is that the different routes do not share one request, approval, execution, and completion contract.** Some routes edit immediately, others return proposals; previews are sometimes trusted input rather than verified output; execution reads the currently active tab rather than the tab that was reviewed; history assumes synchronous mutations while scripts are asynchronous.

These are observable bugs, not just architectural preferences. In particular, I reproduced:

- `do not set A1 to 100` and `explain how to set A1 to 100` both changing A1 immediately.
- A proposal previewed on sheet A changing sheet B after switching tabs.
- Undo failing to revert a completed script change.
- Model-supplied `previewChanges: []` bypassing the script dry-run gate.
- A script applying different values than its reviewed preview after an intervening edit.
- Two Apply calls executing a row-insertion script twice.
- Split network chunks dropping a complete chat response and dropping upstream model text.
- An attached spreadsheet being absent from the LLM request.
- A referenced sheet with a valid formula being encoded as empty because the wrong computed-value accessor was used.

**Recommendation:** fix the safety and transport defects before changing models, expanding tools, or adding a more autonomous agent loop. Then consolidate around a single typed plan → locally prepared patch → approval → transactional execution path.

## What was actually validated

| Check | Result |
|---|---|
| Existing frontend/shared suite: `npm test` | 148 files, 1,853 tests passed |
| Existing server suite: `npm test --prefix server` | 31 files, 486 tests passed |
| Real formula-engine tier: `npm run test:realengine` | 12 tests passed |
| Frontend TypeScript: `npm run typecheck` | Passed |
| Server TypeScript/build: `npm run build --prefix server` | Passed |
| Additional temporary diagnostic probes | 13 client/store probes and 5 server probes reproduced the documented behavior |
| Client/store diagnostic probes with the actual WASM engine | All 13 reproduced, not just the default engine stub |
| Separate local Express lifecycle probe | Confirmed request `close` can precede the chat route's late listener; response `close` catches the subsequent disconnect |

The diagnostic assertions intentionally checked the **observed defective behavior**, not the desired behavior. Temporary probes/configuration were removed after review so they do not become a misleading passing regression suite. Their scenarios are recorded below for conversion into proper regression tests.

No live paid provider calls, production database changes, cloud workbook changes, or production deployment were performed. This review does **not** establish the actual quality/latency of Groq, OpenRouter, HuggingFace, or your installed GGUF model. Application source code was not changed.

---

## 1. How the system actually works

### 1.1 There are two different kinds of model involved

**Browser MiniLM:** `src/ai/nlp/nlp.worker.ts`, `nlpEngine.ts`, `intentEmbeddings.ts`, `capabilityEmbeddings.ts`.

- Loads an ONNX sentence-embedding model in a worker.
- Tokenizes into a fixed 128-token input and produces a 384-dimensional embedding.
- Compares embeddings against intent/capability reference vectors.
- Helps choose an existing capability; it does not write the conversational answer or execute a spreadsheet operation itself.
- Falls back when unavailable, and initialization is lazy.

**Generative chat model:** `server/src/index.ts`, `providers.ts`, `groq.ts`, `openaiCompatible.ts`, `ollama.ts`.

- Receives a text prompt, selected spreadsheet context, recent messages, and the current request.
- Generates either plain text or a JSON-shaped action proposal.
- Does not directly access the browser store, formula engine, or cloud workbook.
- Is called statelessly: your application must supply the relevant memory each time.

The local Modelfiles configure a development Qwen2.5-Coder model or a Spreadsheet-RL-4B production-oriented model. Cloud models are selected through configuration. A spreadsheet-trained model does not automatically know your application's exact tool contract; the runtime prompt and validation still have to enforce it.

### 1.2 UI and store entry

`src/components/ChatPanel.tsx:211–229` sends through `sendMessage()` in `src/store/slices/chatSlice.ts:117–213`.

The store:

1. Reads and trims chat input.
2. Decodes semantic clarification chips.
3. Starts MiniLM initialization if needed.
4. Appends a user message and an empty assistant placeholder.
5. Sets a global processing Boolean.
6. Calls `processChatMessage()` with callbacks for reading and mutating the store.

`src/services/chatService.ts:119–188` then attempts an `@sheet` switch, captures the sheet reference, assembles up to 12 prior messages, and creates the pipeline.

### 1.3 Client routing: first matching stage wins

| Order | Stage | Actual role / side effects |
|---|---|---|
| 1 | GoalRouter | Recognizes goals such as total/by-category/by-month; can execute mutations immediately |
| 2 | AgentParser | Regex commands; executes most tools immediately; selected destructive operations become proposals |
| 3 | TemplateResolver | Matches gallery templates and applies them immediately |
| 4 | IntentClassifier | Adds mode and intent, optionally using MiniLM; does not claim the request |
| 5 | SemanticCapabilityRouter | Similarity-based capability routing; mutations generally become Apply proposals |
| 6 | MacroPlanner | Splits recognized clauses and proposes one `execute_macro` |
| 7 | DeterministicDispatcher | Local cleaning, reporting, budget, comparison, and query responses/proposals |
| 8 | LLMGateway | Builds a payload and calls the server |

See `src/services/chatService.ts:163–172` and `src/ai/pipeline/router.ts`.

**Important:** mode classification occurs after three stages that can mutate the workbook. Consequently, the later explain/advise distinction is not a global safety boundary.

A stage exception is logged and routing continues. That is reasonable for pure classifiers, but unsafe as a general rule for stages that may already have made partial changes.

### 1.4 Context sent to the server

`buildSpreadsheetContext()` constructs:

- Workbook and active-sheet names, sheet summaries.
- Selected addresses and selected values/formulas.
- Inferred headers and column roles.
- Sample rows, insights, statistical/budget summaries.
- Compressed sheet encoding when the sheet is sufficiently populated.

`buildAdaptiveContext()` sometimes adds compressed referenced sheets. LLMGateway adds deterministic findings and, for explanation/advice/chat modes, audit context.

This is a **selected, sometimes lossy snapshot**, not the entire live workbook or a live formula dependency graph. Ordinary samples are built from the first 120 rows, but the prompt includes at most 50 sample entries. Compression has its own row/column limits and can remove interior rows.

### 1.5 Server routing and prompt construction

The normal browser path is `POST /api/chat/stream`.

The server:

1. Applies authentication, rate limiting, and request-body validation.
2. Classifies mode and keyword intent again, independently of client MiniLM decisions.
3. May ask for clarification without calling a model.
4. May return help or a shared template result without calling a model.
5. Checks server-funded usage entitlement.
6. Builds an explanation or action prompt.
7. Adds few-shot examples for plain-text modes, trimmed history, and the current user message.
8. Tries BYOK, then configured server providers as permitted.

For explanation/advice/chat, the model returns prose and the server returns no actions. For action mode, the prompt requests JSON containing a message and an actions array. Provider JSON mode is used for server-configured action calls, but that only requests JSON syntax; it does not validate each tool's parameter schema.

This is **text-generated JSON planning**, not a native tool-calling loop. The server does not execute a tool, return its result to the model, and ask the model to inspect the outcome. There is normally one generation; a limited repair attempt exists only on the non-streaming path.

### 1.6 From model output to actual workbook changes

`server/src/parseResponse.ts` extracts JSON, filters tool names against the shared registry, and passes parameters through largely unchanged.

The browser converts returned actions into pending `AgentAction`s. `toolResultToChatMessage()` attaches available previews. On Apply:

- Operational mutations go through `executeTool()`.
- Templates/charts/cleaning go through template handlers.
- Scripts run in QuickJS, collect writes, then commit those writes to the store.
- Macros execute steps with a workbook rollback snapshot and their own undo handling.

The store writes through the formula engine and updates Zustand workbook state. React renders that state. Local persistence subscribes to store changes and saves through IndexedDB/localStorage; cloud saving is a separate synchronization path. **The chat model itself is not saving or modifying the workbook on the server.**

Successful Apply primarily changes action status. The actual execution outcome is not supplied back to the model as a structured tool-result message.

---

## 2. Findings requiring attention first

### F1 — Non-commands can immediately modify data

**Priority: P1 — reproduced with the real formula engine.**

**Locations:** `src/agent/parser.ts:187–234, 397–414`; `src/ai/pipeline/stages/agentParser.ts:95–98, 183–205`; `src/services/chatService.ts:163–168`.

The parser searches for command fragments rather than proving that the full utterance is a command. Its question/destructive guards do not cover negation or general explanation requests, and mode classification happens later.

**Reproduction:** seed A1 with `1`, then send either:

- `do not set A1 to 100`
- `explain how to set A1 to 100`

Both changed A1 to 100 with no pending approval action.

There is also a broader contract inconsistency: the welcome message promises changes only after approval, yet regex tools, goal mutations, and gallery templates execute immediately. Template application writes directly into existing cell addresses (`src/templates/apply.ts`), so an instant template can overwrite existing data.

**Fix direction:** make all routing stages pure proposal builders. Apply a shared command/negation/hypothetical policy before any mutation. Require explicit review for destructive/overwriting actions regardless of which router produced them. If instant low-risk formatting is an intentional feature, make it an explicit, accurately described product policy—not a side effect of which route won.

### F2 — Actions are not bound to the workbook, sheet, selection, or revision reviewed

**Priority: P1 — reproduced.**

**Locations:** `src/types/api.ts:37–49`; `src/store/aiExecution.ts:215–251, 323–350`; `src/store/slices/chatSlice.ts:294–430`.

`AgentAction` carries no workbook ID, sheet ID, base revision, or captured selection. Execution contexts repeatedly read the current active sheet and current selection.

**Reproduction:** create a `set_range` action with a preview on sheet A, switch to sheet B, then Apply. B changes while A does not.

This affects ordinary delayed approvals, not just adversarial input. A tab switch during asynchronous script execution can also separate the sheet read from the sheet written. An old action can survive into another workbook because chat history is not a workbook-bound execution log.

A row signature exists for delete-row, which is a useful partial protection, but it does not establish general workbook/sheet identity.

**Fix direction:** assign locally trusted scope metadata when a plan is created: workbook ID, sheet ID, captured selection, and a monotonically increasing revision. Execution must address those IDs explicitly. Reject or regenerate stale plans. Do not ask the model to supply authoritative scope/approval metadata.

### F3 — Script changes are not reliably undoable

**Priority: P1 — reproduced with the real formula engine.**

**Locations:** `src/store/slices/chatSlice.ts:385–428`; `src/store/slices/historySlice.ts:98–119`; `src/agent/executor.ts:99–126`.

Apply calls `pushHistory()` before starting asynchronous script execution. `pushHistory()` finalizes its before/after diff in a microtask, assuming the mutation happens synchronously. The script yields while awaiting QuickJS; that microtask records no change. Script execution then writes through an execution context with history suppressed.

**Reproduction:** preview and approve `setCell("A1", 2)` when A1 is 1; wait for Applied; Undo. A1 remains 2.

The macro path already uses an explicit before/after approach and is a better starting point for a shared transaction abstraction.

**Fix direction:** use explicit begin/commit/rollback around the actual mutation commit, not microtask timing. For a precomputed patch, capture history and apply the patch together synchronously. For asynchronous preparation, do not finalize undo until preparation and revision validation have completed.

### F4 — Model-authored preview data can bypass the script review gate

**Priority: P1 — reproduced.**

**Locations:** `server/src/parseResponse.ts:43–54`; `src/ai/responseBuilder.ts:175–188`; `src/store/slices/chatSlice.ts:315–371`.

The server accepts arbitrary tool parameters. The response builder trusts `params.previewChanges` and turns it into `action.preview`. Script approval only checks whether a preview object exists.

**Reproduction:** a model action with:

```json
{
  "tool": "execute_script",
  "params": {
    "code": "setCell(\"A1\", 999)",
    "previewChanges": []
  },
  "description": "Update a cell"
}
```

receives `{changes: []}` as its preview and executes on the first Apply instead of going through the local dry-run gate. This does not auto-run without a click; it bypasses the claimed review of what that click will do.

**Fix direction:** strip/reject preview, approval, signature, and execution-state fields from model output. Generate these only in trusted application code. Separate a validated tool proposal from a locally prepared, revision-bound patch. A truthy preview object is not evidence that anything was safely reviewed.

### F5 — Script preview and Apply can perform different operations; repeated Apply can run twice

**Priority: P1 — reproduced.**

**Locations:** `src/lib/scriptPreview.ts:109–128`; `src/store/slices/chatSlice.ts:315–428`; `src/agent/executor.ts:99–130`; `src/components/ChatPanel.tsx:936–958`.

A dry-run produces descriptive `CellChange`s, but the collected mutation object is discarded. Apply runs the code again against current state. There is no revision check, patch identity, or execution lock.

**Reproductions:**

- Preview `setCell("B3", getCell("B2") + 1)` when B2 is 10: preview says 11. Change B2 to 100; Apply writes 101.
- Preview `insertRow(0)` and call Apply twice before either execution finishes: two rows are inserted. The action remains `pending` until completion, so the UI also remains actionable during execution.

**Fix direction:** prepare once, store the exact patch, show that patch, validate its base revision on approval, and commit it once. Add `previewing`/`applying`/`stale`/`failed` states and a synchronous per-action guard. Reject/cancel must not merely change a badge while an execution continues.

### F6 — Streaming parsers lose valid data at ordinary network boundaries

**Priority: P1 — reproduced in both browser and provider adapters.**

**Locations:** `src/ai/agentSse.ts:65–72, 105–124`; `server/src/groq.ts:286–310`; `server/src/openaiCompatible.ts:159–195`; `server/src/ollama.ts:115–138`.

These readers split each individual `reader.read()` chunk into lines and parse immediately, without retaining an incomplete trailing line. Network chunks do not align with SSE events or NDJSON records.

**Reproduction:** split one valid complete SSE event halfway through its JSON into two `Uint8Array`s. The browser reader returns `null`. Split a provider content event the same way: the OpenAI-compatible adapter returns an empty string.

This can look like intermittent model failure, missing tokens, malformed JSON, lost actions, or unnecessary failover. Existing SSE tests use event-aligned chunks and do not expose it.

**Fix direction:** use a shared buffered SSE parser and a buffered NDJSON reader. Retain partial lines/events, handle CRLF and EOF explicitly, flush the decoder, release/cancel the reader, and require a terminal response before reporting success. Test every byte split position and multiple events per chunk.

Also, `agentClient.ts:186` returns the reader promise without awaiting it inside the `try`; asynchronous reader rejection bypasses that local catch. Its comment mentions a non-streaming fallback, but that fallback is not actually invoked there.

---

## 3. Context, routing, and model-request correctness

### F7 — Attachment, cross-sheet, and row-address context have concrete mismatches

**Priority: P2, with potentially serious consequences when used to propose edits.**

#### Attached file is ignored by the LLM path — reproduced

`src/ai/pipeline/stages/llmGateway.ts:35–75` always builds from `context.workbook` and `context.sheet`, ignoring `context.attachedPreview`. By contrast, `DeterministicDispatcher` calls `resolveAnalysisTarget()`, which does use the attachment.

Thus two questions about the same attachment can analyze different datasets depending on which stage wins. The targeted gateway test confirmed attachment-only data was absent from the outgoing request.

**Fix:** resolve a single analysis target before routing. Keep the analysis target separate from the write target; an unimported attachment should be read-only unless an explicit import/copy operation is approved.

#### Referenced-sheet compression uses the active-sheet accessor — reproduced

`src/ai/adaptiveContext.ts:145–151, 185–203` passes one active-sheet `getComputedValue(row, col)` into compression of other sheets. `sheetCompressor.ts:606–621` uses it to determine formula values/types and whether cells exist in the encoding.

The reproduction put `=21*2` with a null cached value in another sheet's A1 and a reference to that sheet in the active sheet's B1. Active A1 was blank. The other sheet was encoded as `{"empty": true}` instead of retaining its formula.

This is not evidence that all literal values are replaced with active-sheet values: literals are read directly from their own sheet. The defect specifically affects formula-derived inclusion/type decisions.

**Fix:** pass a sheet-ID-scoped value accessor and preserve both formula and computed result where relevant.

#### Samples lose true row addresses — source-confirmed

`src/ai/buildContext.ts:77–95` removes empty sample rows. `server/src/prompt.ts:282–285` renumbers the retained entries as `Row 1`, `Row 2`, etc. If the original row 2 is blank, row 3's data can be labeled row 2.

Additionally, the server truncates samples to 50 entries while the client's `sampleRowsTruncated` flag only reflects its own 120-row limit. The model may not be told about this additional truncation.

**Fix:** transmit `{rowIndex, cells}` or explicit A1 addresses, and a coverage manifest describing all truncation/sampling. Never invent row numbers from array positions.

### F8 — Some destructive proposals cannot be applied at all

**Priority: P2 — reproduced.**

**Locations:** `src/ai/pipeline/stages/agentParser.ts:154–175`; `src/lib/previewBuilders.ts:138–184`; `src/store/slices/chatSlice.ts:371–383`.

`clear_sheet` requires a preview at Apply time, but `buildActionPreview()` has no `clear_sheet` implementation. The parser can generate the proposal, but approval refuses it and asks for regeneration that produces the same missing-preview result.

**Reproduction:** `clear and build a budget` creates a clear action with no preview; Apply is blocked. Plain clear proposals returned by the server have the same preview construction gap.

**Fix:** provide a trusted clear-sheet preview/preparation implementation, or make the proposal a typed destructive operation with its own confirmation and exact scope. Add a registry coverage test: every tool marked preview-required must have a preparer.

Related: formula-gap warnings are added to `preview.warnings`, but `ActionCard` renders only `preview.changes`. Apply then sets `confirmGaps: true` (`chatSlice.ts:411–417`). The code treats the click as informed confirmation without showing that warning.

### F9 — Context budgeting is not enforced on the final request

**Priority: P2 — zero-budget defect reproduced; other gaps source-confirmed.**

**Locations:** `server/src/index.ts:383–442`; `server/src/tokenBudget.ts:104–152`; `server/src/prompt.ts:296–328`; `src/ai/pipeline/stages/llmGateway.ts:37–38`; `src/ai/adaptiveContext.ts:104–178`.

Several individually reasonable pieces do not add up to an actual bound:

1. The client always assumes cloud availability.
2. The server picks a budget based on the first configured cloud provider, not the provider actually attempted after circuit checks/failover or a BYOK model.
3. Cloud context gets no `maxContextTokens` at all because the cap is passed only for constrained providers.
4. Budgeted history tokens are calculated, but actual history is truncated by message count, not that allocation.
5. Few-shot examples and the optional summary are added after allocation.
6. `maxTokens === 0` takes the “no budget constraint” branch and includes everything.
7. Provider failover reuses the same assembled messages, even when falling back to an 8K Ollama model.
8. Client “tight compression” is not a final serialized-size check. Full selected-address lists, snapshots, and other fields can still be large; the chat body limit is 1 MB.

The zero-budget probe generated the same large prompt with budget 0 as with no budget. For orientation, the default base action prompt measured about 2,011 estimated tokens, and the base explanation prompt about 833, before spreadsheet data/history/examples. These are your heuristic estimates, not provider-tokenizer measurements.

**Fix:** assemble and measure the final request per candidate model; reserve output tokens; trim history by tokens; retain the user's requested range and necessary evidence before low-priority context. Treat zero as zero and `undefined` as uncapped. Re-budget before a smaller-model retry. Enforce both request-byte and token budgets. Model context size belongs to model configuration, not simply provider identity.

### F10 — Repeated routing and broad matching can block useful model requests or select the wrong action

**Priority: P2; destructive misclassification deserves a P1 regression test.**

**Locations:** `src/services/chatService.ts:163–172`; `server/src/index.ts:676–740`; `server/src/intent.ts`; `shared/actTemplates.ts:107–115`; `shared/mode.ts`.

The client uses goals, regex, gallery matching, keyword mode, embeddings, capability resolution, and macro matching. A request that survives all that is keyword-classified and template-matched again on the server. Client-resolved intent/mode are not part of the transport contract.

A server-side low-confidence keyword result can prevent the LLM from seeing exactly the difficult request it was meant to handle. Conversely, a broad template hit can override a more nuanced request.

**Reproduced server example:** `create a formula to fill blank cells with zero` resolves to `clear_sheet` because the destructive template rule matches any occurrence of `blank`. Whether a particular UI request reaches this rule depends on earlier stages, but the server misclassification itself is confirmed. The current missing-clear-preview defect may prevent application; fixing that defect alone would not fix the incorrect routing.

Other consequences:

- Some polite/complex commands classified as chat go to a prose-only prompt and cannot return actions.
- The `forceLlm` flag does not skip low-confidence clarification and also selects the no-actions branch through `llmOnly`.
- Similarity and regex “confidence” values are compared as though calibrated probabilities, though they come from different scoring systems.

**Fix:** one authoritative routing decision, with exact local shortcuts that prove they handled the whole request. Unknown/novel commands should fall through to a constrained model planner rather than being rejected by another weak keyword classifier. Prefer false negatives over false-positive edits. Keep explicit risk/approval policy separate from conversational mode.

### F11 — Structured output is weakly validated, and recovery differs between endpoints

**Priority: P2, contributing to F4.**

**Locations:** `server/src/parseResponse.ts:31–59`; `server/src/index.ts:233–239, 264–284, 525–540`; `server/src/structuredOutput.ts`; `shared/toolRegistry.ts:668–678`.

The action parser checks tool names, not the full parameter contract. Arrays can pass the `typeof params === 'object'` check. Invalid coordinates, wrong value shapes, arbitrary preview fields, and missing required parameters can reach client execution. Some handlers validate well, but validation is uneven and happens after the user has been shown a proposal.

The provider prompt exposes parameter names, but not a complete executable JSON Schema of types, enums, constraints, and required fields.

Recovery also differs:

- Normal UI streaming does not use the structured-output repair attempt.
- Non-streaming retries when there are zero actions, even if valid JSON intentionally has `actions: []` to ask a clarification question.
- The existing schema-based `callProviderStructured()` is not used for this chat path.
- BYOK calls omit action-call options: they default to 768 output tokens and no JSON mode, unlike the normal 2,048-token server-funded action calls.
- Provider readers do not require a successful terminal finish reason before treating accumulated text as usable.

**Fix:** shared per-tool schemas; strict response validation; explicit result variants for answer, clarification, proposal, and error. Perform a single bounded repair only on actual validation failure, not on absence of actions. Give BYOK equivalent supported options, with provider capability negotiation where necessary. Do not execute partial/truncated structured output.

---

## 4. Execution, lifecycle, and user-visible reliability

### F12 — The sandbox's write semantics do not match ordinary imperative JavaScript

**Priority: P2 — reproduced for read-after-write.**

**Locations:** `src/sandbox/api.ts:42–85, 147–185`; `src/sandbox/runner.ts`; `src/agent/executor.ts:117–130`; `server/src/prompt.ts` script examples.

`setCell()` writes to a mutation collector; `getCell()` reads the original sheet/engine and never consults that collector. Row changes are also collected separately and then committed in batches, not interleaved in source-code order.

**Reproduction:** with B2 = 10 and B3/B4 blank, a forward loop that fills each blank from the previous row fills B3 but leaves B4 blank. B4's read of B3 does not see the prior write. The action prompt includes this style of fill-down example, so the model is being taught code that is wrong for this SDK's semantics.

**Fix:** choose and document one model:

- Prefer a virtual workbook/overlay with read-your-writes and defined structural-operation semantics; or
- Explicitly expose a snapshot-to-patch API and teach scripts to maintain local working state, rather than pretending writes immediately change subsequent reads.

Also harden host API resource limits. QuickJS's time/memory limits are useful, but `getRange()` allocates and loops in host JavaScript. The VM's limits are not a complete bound on that work. Validate coordinates, finite integer row indexes, cell-value/format types, maximum read area, and total output bytes. Consider doing preparation off the UI thread. No oversized-range stress test was run during this review.

### F13 — Timeouts/disconnects do not reliably stop the abandoned work

**Priority: P2 — provider-timeout behavior reproduced.**

**Locations:** `server/src/providers.ts:116–148, 235–312`; `server/src/index.ts:317–359, 766–782`; `src/store/slices/chatSlice.ts:99–103, 117–213`.

A provider first-byte timeout rejects the wrapper promise without aborting the underlying fetch. Its `wrappedOnChunk` remains live. Failover can start another provider while the earlier one continues spending tokens and forwarding text into the same UI stream.

The probe advanced the OpenRouter timeout, confirmed the upstream signal was not aborted, then emitted a late token and observed it forwarded after failure.

Other lifecycle gaps:

- The server listens for `req.close` after asynchronous entitlement checks. A consumed POST body's request lifecycle can already be closed by then. A local Express probe observed this exact event ordering; use response close / actual disconnect semantics instead.
- Client cancellation or the total abort is recorded as provider failure, and the loop continues across providers. Several cancellations can damage shared circuit-breaker health even though a provider is healthy.
- `clearChat()` does not cancel inference. The service does not thread an AbortSignal through the full request.
- Non-streaming provider timeouts and BYOK behavior are not governed by one overall request deadline.

**Fix:** one request AbortController/deadline, a child controller for each provider attempt, and explicit cleanup in `finally`. Abort abandoned attempts; stop failover on user cancellation; discard late tokens by attempt ID; distinguish provider failures from client cancellation. If retrying after visible partial content, explicitly reset/replace that attempt's display rather than concatenating contradictory answers.

### F14 — Explicit server refusals are discarded by an outer fallback

**Priority: P2 — reproduced.**

**Locations:** `src/ai/pipeline/stages/llmGateway.ts:78–96`; `src/services/chatService.ts:252–255`.

The gateway correctly returns a structured failure for 401/429/quota-style non-200 responses and explicitly says not to hide the refusal. The service then handles any unsuccessful LLM/deterministic result in act mode by calling `processLocalFallback()` anyway.

**Reproduction:** for an act-mode request (`generate a lunar calendar from this dataset`), return a distinctive 401 message from the client adapter. The final chat message replaces it with local fallback text.

There are also protocol inconsistencies: streaming quota denial is a 200 complete event with `source: fallback`; classic denial is HTTP 429; the client categorizes 429 as rate-limited; and the client source union omits server `clarification`, coercing it to `llm`.

The gateway's `!isLlmOnlyMode(mode) && insightsBlock` fallback is unreachable: `insightsBlock` is only populated for an LLM-only mode.

**Fix:** use a typed error/result contract end to end. Auth, quota, validation, rate limiting, cancellation, model failure, and a successful deterministic answer are different states. Transport choice must not change their meaning. Only eligible transient failures should invoke a clearly labeled local fallback.

### F15 — Request concurrency and conversation memory are not tied to turn or workbook state

**Priority: P2 — source-confirmed.**

**Locations:** `src/components/ChatPanel.tsx:211–229, 753–769`; `src/store/slices/chatSlice.ts:117–213`; `src/services/chatService.ts:134–156, 182`; `src/ai/pipeline/stages/llmGateway.ts:51–53, 170–178`.

The Send button is disabled during processing, but the textarea remains enabled and Enter calls `handleSend()`, which has no processing guard. `sendMessage()` has no such guard either. Consequently a second turn can start while the first is pending.

The global processing Boolean, “remove the last two messages” history construction, and latest-message rendering all assume one active turn. Clearing chat can reset the Boolean while old work continues. An earlier request can then clear the processing indicator for a newer one.

Memory has separate correctness issues:

- History sends only role/content, not action IDs, actual tools, approval/rejection status, execution outcomes, or undo events.
- The client truncates to 12 messages before the server sees them. At default cloud settings, server summarization therefore cannot recover older turns; the client `conversationSummary.ts` helper is not wired into this service path.
- Prior insights are selected globally from the last matching message, without workbook/sheet/revision validation.
- The gateway claims “Prior turn insights still apply” based on existence, not freshness.
- Final insights are rebuilt using a captured sheet object plus live getters, which can disagree after a mutation or tab switch.

**Fix:** request IDs and an explicit active-turn state machine; enforce serialization in the store or deliberately support multiple isolated turns. Capture history by IDs before appending placeholders. Bind insights and summaries to workbook/sheet/revision. Include compact factual execution outcomes, not only assistant proposal prose.

### F16 — Client and server usage accounting measure different things

**Priority: P2 — source-confirmed.**

**Locations:** `src/components/ChatPanel.tsx:211–214`; `src/auth/useUsage.ts:48–66, 112–145`; `server/src/index.ts:745–761, 804–808`; `server/src/usage.ts:61–130`.

The UI increments local usage before it knows whether the message is non-empty, is handled locally, fails, or consumes server-funded inference. The server counts successful server-provider responses. The UI fetches entitlement/limit but does not synchronize its local count from server `used`/`remaining`.

A free user can spend the UI allowance on local formatting or failed requests and be blocked even though server inference quota remains. The local counter is also not keyed by authenticated user.

On the server, usage check and increment are separate operations around inference. Concurrent requests can all pass the same remaining quota before any completes.

**Fix:** use authoritative usage returned with completed billable requests; do not spend cloud allowance on deterministic operations. Key client state by account and day. Use atomic quota reservations with commit/refund semantics if strict cost limits matter. Keep quota accounting separate from requests-per-minute protection.

---

## 5. Prompt quality and security boundaries

These are important improvements, but not all are independently reproduced production failures.

### Tell the model what it actually has

`server/src/prompts/persona.ts:8` claims real-time access and the full formula dependency graph. The payload does not provide that access. Combined with lossy compression, this encourages unsupported confidence.

Use wording such as: “You have the attached snapshot and computed summaries. Coverage is listed explicitly. Do not infer unseen cells; request additional data when necessary.” Include formulas and their computed results where the question needs both.

The persona also tells the model not to repeat deterministic analysis “above,” but that analysis may only be in the hidden prompt, not in the current visible response. Ensure the answer is self-contained rather than referring to an analysis the user never saw.

### Ask for a concise rationale, not an internal reasoning transcript

`server/src/prompt.ts:371–375` requests an internal chain-of-thought/transparency field. That uses output budget, is not reliable evidence of correctness, and is not even preserved by `parseAgentResponse()` and the final message conversion.

Request a short user-facing explanation of the proposed operation, assumptions, affected scope, and risks. Obtain transparency from the actual patch and validation results.

### Treat spreadsheet text as untrusted data

Sheet names, cell text, deterministic summaries, preferences, and history excerpts are interpolated into system-prompt text. Imported cells can contain instructions. Delimit and label data sections, avoid promoting user-content summaries to system authority, and retain strict validation and approval outside the model.

Delimiters alone are not a security boundary. The enforceable boundary is: **untrusted model output cannot assign trusted approval metadata, choose arbitrary execution scope, or mutate the workbook without validation.** F4 is a concrete violation of that boundary.

### Keep the model/tool contract in one place

The shared tool registry is a good foundation. Extend it to own parameter schemas, risk class, read/write classification, preparation, execution, and postconditions. Generate prompts and native structured-output schemas from it where providers support them.

The Ollama Modelfiles contain another hard-coded tool list and JSON-only system instructions. They can drift from runtime tools and plain-text explanation prompts. Verify the actual installed model's template against representative explain/action requests; keep the model's base persona minimal and put the per-request contract in runtime prompts. This was not tested against a running Ollama instance here.

---

## 6. A simpler and more efficient design

### Keep the hybrid approach; unify its output

I would not replace everything with an LLM, add a large agent framework, or create a many-step autonomous loop first. Exact formatting/sorting/aggregation should stay deterministic.

The preferred shape is:

```text
User request
  → capture request scope + immutable analysis snapshot
  → exact local resolver OR semantic hint OR model planner
  → one validated result: answer | clarify | proposal | error
  → prepare exact patch against captured revision
  → local safety checks + preview
  → approval
  → compare revision + commit once, transactionally
  → verify + record undo + store execution outcome
  → optional concise explanation of actual outcome
```

### Separate proposal from trusted prepared action

Conceptual types, not a proposed drop-in implementation:

```ts
type ChatResult =
  | { kind: 'answer'; text: string; evidence: EvidenceRef[] }
  | { kind: 'clarify'; question: string; choices?: string[] }
  | { kind: 'proposal'; operations: ValidatedOperation[] }
  | { kind: 'error'; code: ErrorCode; message: string; retryable: boolean };

// Created locally after validation/preparation, never accepted from model output.
type PreparedAction = {
  actionId: string;
  requestId: string;
  workbookId: string;
  sheetId: string;
  baseRevision: number;
  capturedSelection: Selection | null;
  patch: WorkbookPatch;
  patchHash: string;
  warnings: string[];
  status: 'pending' | 'applying' | 'applied' | 'stale' | 'failed' | 'rejected';
};
```

This removes several classes of bug together: wrong-tab writes, stale scripts, forged previews, duplicate Apply, inconsistent undo, and ad hoc per-route confirmation.

### Efficiency improvements, in order

1. **Build context lazily once per request/revision.** GoalRouter and AgentParser each build a full context even when passing. DeterministicDispatcher builds another and separately rebuilds a profile; LLMGateway and final conversion can build more. Full insights/compression should not be required to recognize `bold the headers`. Share a lazy memoized request context and cache stable profiles by sheet revision.
2. **Send relevant evidence rather than duplicate representations.** The current request can contain samples, compressed data, selected data, profiles, insights, and a prose summary covering overlapping information. Prefer the requested range plus exact local query results and a small schema/coverage summary.
3. **Prioritize selected/mentioned cells over general compressed data.** The current prompt gives compressed encoding priority over headers/selection. Under tight budgets it can omit the exact selected formula the user asked about.
4. **Use one provider adapter and one protocol.** Normalize finish reason, usage, error, structured output, and cancellation. Keep streaming/non-streaming as delivery options over the same chat service, not duplicated business rules in two route handlers.
5. **Batch commits and token rendering.** Value writes already have a bulk path; retain it. Batch formatting writes and structural operations too. Buffer text updates to an animation frame or short interval rather than one Zustand update per tiny provider chunk. Measure before selecting the interval.
6. **Use a brief rationale instead of a long reasoning field.** Spend output tokens on valid operations, explicit assumptions, and a complete answer.
7. **Evaluate MiniLM's net benefit.** It has initialization/download cost and adds another confidence system. Keep it if measured model-call savings and routing accuracy justify it. Compare cold/warm latency and wrong-action rate, not only classification accuracy.
8. **Add bounded read-tool retrieval only when needed.** If a request needs data outside the snapshot, allow one or two read-only queries before planning. Avoid turning every simple operation into a multi-call agent cycle. Never let the model invent results for unseen rows.
9. **Instrument the actual handoffs.** Record request ID, revision, winning stage, context-build time, payload size, estimated/actual tokens, provider attempts, first-token time, validation/repair outcome, proposal/approval outcome, and verified change count. Do not log API keys or raw sensitive cells by default.

### What to preserve

- Shared registry and existing concrete tool handlers.
- Deterministic financial/aggregation calculations rather than LLM arithmetic.
- QuickJS instead of browser `eval`.
- MiniLM isolation in a worker and fallback behavior.
- Delete-row signatures and ambiguity handling, generalized to all risky changes.
- Macro rollback and explicit before/after history design.
- Auth, BYOK restrictions, rate limiting, provider metadata, and circuit breakers—after fixing the lifecycle/protocol gaps.
- The large existing test suite and the separate real-engine test tier.

---

## 7. Suggested implementation sequence

### Phase A — Stop incorrect or unreviewed writes

1. Add regression tests for negated/explanation commands and move mutation authorization outside parsers.
2. Bind every proposal to workbook/sheet/revision/selection.
3. Remove model control over preview/approval metadata.
4. Prepare scripts once and commit the reviewed patch.
5. Fix async undo and lock Apply while running.
6. Implement clear-sheet preparation and display formula-gap warnings.

**Acceptance:** no mutation on negation/explanation; no wrong-tab writes; stale plans are rejected; one click produces at most one commit; Undo restores every accepted change.

### Phase B — Make transport and context trustworthy

1. Repair all SSE/NDJSON readers.
2. Abort abandoned provider attempts and propagate cancellation throughout.
3. Unify attachment targeting and sheet-scoped computed accessors.
4. Preserve real row addresses and context coverage.
5. Apply a final per-model token/byte budget.
6. Preserve typed server refusals through final UI rendering.

**Acceptance:** identical final results under arbitrary chunking; no late chunks after timeout/cancel; the model receives the intended dataset; failover payloads fit the fallback model.

### Phase C — Simplify routing and validate outputs

1. Extract one testable server chat service used by both transports.
2. Add per-tool schemas shared with client validation/preparation.
3. Remove broad destructive keyword matches and duplicated authoritative routing.
4. Use bounded schema repair for genuine invalid output, including streaming/BYOK.
5. Record execution facts and scope-aware conversation memory.
6. Align UI/server usage accounting.

### Phase D — Optimize and tune model choice

Benchmark representative small, large, sparse, multi-sheet, formula-heavy, attached-file, and long-conversation cases. Optimize repeated context work before spending effort on a larger model or more complex prompting.

Useful quality measures: wrong-action rate, proposal validity, exact-change correctness, stale-plan rejection, undo correctness, answer evidence coverage, and user clarification success. Useful efficiency measures: p50/p95 latency, time to first useful output, context-build cost, token count, fallback frequency, and cost per successfully completed request.

---

## 8. Test gaps that explain why this was not caught

The current passing suite is valuable, but it does not prove the whole production path is wired together safely.

- `server/src/routes/chat.test.ts` creates a miniature Express app with replicated auth and placeholder responses. It does not execute the real chat route, prompt builder, usage gate, provider loop, or response parser together.
- Several pipeline “integration”/smoke tests mock the parser, executor, context builder, and provider boundary simultaneously. They verify the mocked arrangement, not necessarily real routing/mutation behavior.
- Default frontend tests use a formula-engine stub. The real-engine tier is separate and passed; the extra store probes reproduced against that real engine too.
- Existing SSE tests assume one complete event per chunk.
- Script approval tests cover the happy path, not revision changes, spoofed previews, repeated Apply, or undo after asynchronous completion.

### Regression scenarios to add

| Area | Required scenario |
|---|---|
| Intent safety | Negation, explanation, hypothetical, quoted command, and multi-clause requests never accidentally mutate |
| Tool proposals | Every preview-required tool can prepare a preview; unknown/invalid params are rejected before presentation |
| SSE/NDJSON | Split each valid event at every byte boundary; UTF-8 splits; CRLF; multiple events; abrupt EOF; invalid terminal event |
| Scope | Switch sheets/workbooks between proposal, preview, and Apply; change selection; edit a referenced cell |
| Script integrity | Supplied preview fields ignored; repeated Apply; rejection during preparation; read-after-write semantics |
| Undo/atomicity | Script/macro success and failure; one undo entry; rollback does not overwrite unrelated concurrent edits |
| Context | Attached file vs active workbook; cross-sheet formulas; blank rows; selected data beyond compression cap; accurate truncation flags |
| Provider lifecycle | No output before timeout; late output after timeout; midstream failure; cancel; smaller-model failover; BYOK invalid/empty/truncated output |
| Request budget | Zero remaining tokens; long single history message; few-shot costs; large selection; fallback to local context size |
| Error UI | Real 401, quota, 429, invalid response, and unavailable-model results survive the complete pipeline |
| Usage | Local command consumes no cloud quota; empty submission; failed request; multi-account state; concurrent last-credit requests |
| Outcome memory | Model sees applied/rejected/undone facts and the correct workbook revision, not only proposal wording |

**Bottom line:** there is a useful spreadsheet assistant here, and a substantial amount of good infrastructure. The highest-return improvement is to make every route produce the same validated plan and use the same revision-bound, transactional execution mechanism. That will improve correctness and efficiency more reliably than adding another classifier, another prompt layer, or a larger model first.
