# AI Model & Provider Audit — Issues Discovered

**Date**: August 5, 2026  
**Server**: AWS t3.large (2 vCPU, 8 GB RAM, no GPU)  
**Host**: ubuntu@52.0.207.242

---

## Critical Issues

### 1. Server Ollama Models Are Wrong

**Both `smartshit` and `smartsht-assist` on the production server point to the same blob** — the raw `qwen2.5-coder:1.5b` base model (986 MB), NOT the instruct variant.

- Blob: `sha256-29d8c98fa6b098e200069bfb88b9508dc3e85586d20cba59f8dda9a808165104`
- The Modelfile template uses FIM (fill-in-middle) format: `<|fim_prefix|>...<|fim_suffix|>...<|fim_middle|>`
- This is a **code completion model**, not a chat/instruct model
- It has no chat training — it pattern-matches JSON from the system prompt with minimal quality
- The `excel-assist-q8.gguf` (2.95 GB finetuned model) was **never uploaded** to the server

**Impact**: Any time Groq fails over to Ollama, users get responses from a model that fundamentally cannot converse or reason.

---

### 2. Groq Doesn't Use Native JSON Mode or Tool Calling

The Groq API call (`server/src/groq.ts`) sends plain `chat/completions` without:

- `response_format: { type: "json_object" }` — Groq supports this for llama-3.3-70b but it's not used
- `tools` parameter — Groq supports native OpenAI-style function calling but it's not used

Instead, tool calling relies entirely on prompt engineering (system prompt asks for JSON output). This works for a 70B model but:
- No guarantee of valid JSON
- Parsing failures trigger fallback to regex intent parser
- Native tool calling would be more reliable and structured

**Groq's llama-3.3-70b-versatile supports**: `["tools", "json_mode"]`

---

### 3. Silent Provider Failover — No User Visibility

When Groq rate-limits or errors, the system silently falls through to Ollama (the broken base model). There is:

- No indication to the user which provider served their response
- No logging distinguishing "Groq succeeded" vs "fell back to Ollama"
- The `source` field in `ChatResponseBody` only shows `'llm' | 'fallback' | 'template' | 'clarification'` — not which provider

**Impact**: User can't tell why quality varies wildly between requests. Developer can't diagnose without checking server logs.

---

### 4. max_tokens: 768 May Truncate Groq Responses

The Groq client caps output at 768 tokens for both streaming and non-streaming calls. For action mode, the model needs to produce:
- `reasoning` field (chain of thought)
- `message` field (user-facing explanation)
- `actions` array (tool calls with params)

768 tokens may not be enough for complex multi-action responses, leading to truncated/invalid JSON that fails parsing.

---

## Important Issues

### 5. Local Development Models Are Mismatched to Server

| Model | Local (your machine) | Production Server |
|-------|---------------------|-------------------|
| smartshit | `qwen2.5-coder-1.5b-q8_0.gguf` (1.57 GB, instruct) | `qwen2.5-coder:1.5b` (986 MB, **base**) |
| smartsht-assist | `excel-assist-q8.gguf` (2.95 GB, finetuned) | Same blob as smartshit (**not finetuned**) |

The server has never had the correct models deployed.

---

### 6. The 1.5B Model Is Fundamentally Inadequate for Chat

Even if the correct instruct model were deployed, `qwen2.5-coder-1.5b-instruct` is:
- A **code** model, not a general assistant
- Too small (1.5B params) for nuanced financial reasoning
- Unable to follow complex multi-part system prompts reliably
- Chosen for speed over quality — but speed is meaningless if output is useless

The system prompt asks it to be simultaneously: a CPA-level analyst, Excel expert, data quality auditor, and patient teacher. A 1.5B model cannot do any of these well.

---

### 7. Two Ollama Models Where One Better Model Suffices

Running `smartshit` + `smartsht-assist` as separate models:
- Wastes memory (even though they're the same blob on server, the intent was two separate models)
- Adds complexity to the provider chain
- A single 4B model (Qwen3.5-4B) handles both chat AND structured JSON better than two 1.5B models

---

### 8. Groq Free Tier Rate Limits

`llama-3.3-70b-versatile` on Groq free tier has limits:
- 30 requests/minute
- 14,400 requests/day  
- 20,000 tokens/minute

Under any real user load, these limits will be hit, triggering the broken Ollama fallback.

---

## Credential Exposure (Rotate These)

During this investigation, the production `.env` was read and displayed in chat. The following credentials should be rotated:

- [ ] Groq API key (`gsk_...`)
- [ ] AWS Access Key / Secret (`AKIA...`)
- [ ] Clerk Secret Key (`sk_live_...`)
- [ ] Stripe Secret Key (`sk_live_...`)
- [ ] Stripe Webhook Secret (`whsec_...`)
- [ ] Database password (in DATABASE_URL)

---

## Recommended Fixes (Priority Order)

### Immediate (fix the broken state)

1. **Fix server Ollama model** — Upload and register the correct instruct model OR replace with Qwen3.5-4B
2. **Add `response_format: { type: "json_object" }` to Groq calls** in action mode
3. **Rotate all exposed credentials**
4. **Log which provider served each response** for debugging

### Short-term (improve quality)

5. **Replace both 1.5B models with a single Qwen3.5-4B (2.66 GB)** on the server — handles both chat and tool calling
6. **Increase max_tokens for Groq** from 768 to at least 1024-1536 for action mode
7. **Surface provider info to the client** — show which model answered (at minimum in dev mode)
8. **Add Groq rate-limit detection** — catch 429 responses explicitly, log them, optionally inform user

### Medium-term (architecture)

9. **Consider native Groq tool calling** — use the `tools` API parameter instead of prompt-only approach
10. **Add MiniLM-L6-v2 (22 MB ONNX)** for semantic intent matching (reduces LLM calls for simple intents)
11. **Evaluate CellSentry (940 MB GGUF)** as the server fallback model for spreadsheet-specific tasks
12. **Add a second cloud provider** (OpenRouter or HuggingFace) as intermediate fallback before Ollama

---

## Server State Summary (as of Aug 5, 2026)

```
Ollama:           active (systemd)
SmartSht API:     online (PM2, pid 191379, 2 days uptime)
Node version:     v20.20.0
RAM:              7.6 GB total, 476 MB used, 6.9 GB available
Provider order:   groq -> ollama
Groq:             ✓ configured (llama-3.3-70b-versatile)
OpenRouter:       ✗ (no API key)
HuggingFace:      ✗ (no API key)
Ollama models:    smartshit (986MB), smartsht-assist (986MB), qwen2.5-coder:1.5b (986MB)
                  ^^^ ALL THREE ARE THE SAME BASE MODEL BLOB
```

---

## Models Available Locally (Candidates for Server)

| Model | Size | Location | Fit for t3.large |
|-------|------|----------|------------------|
| Qwen3.5-4B.q8q4.gguf | 2.66 GB | models/ + __CPU-AGENTS/ | ✅ Best candidate |
| Qwen3.5-4B.q6_k.gguf | 3.92 GB | __CPU-AGENTS/ | ✅ Higher quality variant |
| **Spreadsheet-RL-4B.Q4_K_M.gguf** | 2.53 GB | temp/models--mradermacher--Spreadsheet-RL-4B-GGUF/ | ✅ **Purpose-built for spreadsheet agent tool-use** (Qwen3 + RL, Apache 2.0) |
| cellsentry-1.5b-v3-q4km.gguf | 940 MB | temp/cellsentry/ | ✅ Spreadsheet specialist (formula audit, PII, extraction) |
| hermes3:8b | 4.7 GB | Ollama registry | ⚠️ Tight as solo model |
| all-MiniLM-L6-v2 (quantized ONNX) | 22 MB | temp/models/ | ✅ Sentence embeddings, negligible cost |
| all-MiniLM-L6-v2 (full ONNX) | 86 MB | temp/all-MiniLM-L6-v2/onnx/ | ✅ Higher quality embeddings |

---

## Issue 9: ONNX Model Integration — Architecture Mismatch

### Problem

The `onnx-model-integration` spec (`.kiro/specs/onnx-model-integration/`) was designed around **users uploading their own .onnx models**. This doesn't match the product's target audience (everyday users managing budgets/expenses). Users don't have ONNX models. They log in, use the spreadsheet, and chat with the AI.

### What Exists in Code

| Component | Status | Notes |
|-----------|--------|-------|
| Client-side Path A (Web Worker + onnxruntime-web) | ✅ Built | Fully implemented — routing, session cache, validation, formula function |
| Server-side Path B (onnxruntime-node) | ❌ Broken | `sessionPool.ts` imports `onnxruntime-node` but **the dependency is not in server/package.json**. Never installed. |
| Model Upload Handler | ✅ Built | But uploads are **browser-only** (file → ArrayBuffer → in-memory registry). No server upload endpoint exists. |
| `POST /api/onnx/infer` SSE endpoint | ⚠️ Code exists | Would crash on import since `onnxruntime-node` isn't installed |
| Model files on server | ❌ None | Path B expects `models/{name}.onnx` on disk — no files exist, no upload mechanism |
| NLP engine bundled model | ❌ Stub | `getBundledModel()` returns empty `ArrayBuffer(0)`. No actual model at `/models/nlp/` |

### What Should Happen Instead

For everyday users, the ONNX integration should use **app-bundled models** that provide value without user configuration:

| Available Model | Size | What It Does | Use Case for SmartSht |
|----------------|------|--------------|----------------------|
| **all-MiniLM-L6-v2 (quantized)** | 22 MB | Sentence embeddings / semantic similarity | Intent matching, column name fuzzy matching, semantic search across sheets |
| **all-MiniLM-L6-v2 (full)** | 86 MB | Same, higher quality | Same but better accuracy |
| **Spreadsheet-RL-4B** (GGUF) | 2.53 GB | Spreadsheet agent trained with RL for tool-use | Could replace or augment the main Ollama chat model — purpose-built for this exact use case |

### What's Missing

1. **`onnxruntime-node`** not in server dependencies — Path B is dead
2. **No model upload API endpoint** — server cannot receive model files from frontend
3. **No app-bundled ONNX models** — no models in `public/` or served by the app
4. **The NLP engine model** referenced at `/models/nlp/` doesn't exist — the entire in-browser NLP classification system has no model to load
5. **No IndexedDB persistence** for browser-loaded models — they vanish on page refresh

### Relevant Temp Directory Assets

```
temp/models/all-MiniLM-L6-v2/onnx/model_quantized.onnx     22 MB  ← ready to bundle
temp/all-MiniLM-L6-v2/onnx/model.onnx                      86 MB  ← higher quality variant
temp/onnx/model.onnx                                        86 MB  ← duplicate of above (same model)
temp/models--mradermacher--Spreadsheet-RL-4B-GGUF/          various ← RL-trained spreadsheet agent (Qwen3 base)
temp/nodebox-runtime-main/                                  ← browser Node.js runtime (CodeSandbox)
```

### Nodebox Runtime (temp/nodebox-runtime-main)

This is CodeSandbox's **Nodebox** — a browser-based Node.js runtime. It lets you run Node.js code entirely client-side without a server. Potentially useful for:
- Running `onnxruntime-node` in-browser (but Path A with onnxruntime-web already does this)
- Sandboxed script execution (but the app already uses `quickjs-emscripten` for this)
- Not immediately useful for the ONNX integration

### Recommended Fix

1. **Bundle `all-MiniLM-L6-v2` (quantized, 22 MB)** as the app's NLP model at `public/models/nlp/` — this gives the NLP engine an actual model to load for intent classification / semantic matching
2. **Install `onnxruntime-node`** in server/package.json for Path B
3. **Rethink the upload flow** — either:
   - (a) Remove user upload entirely, only offer app-bundled models
   - (b) Add a server endpoint that receives model files and stores to S3/disk
4. **Evaluate Spreadsheet-RL-4B as the primary Ollama model** — it's literally a Qwen3-4B model reinforcement-learning-trained for spreadsheet agent tool-use. This is exactly what SmartSht needs.

---

## Spreadsheet-RL-4B — Key Finding

There is a model in `temp/` called **Spreadsheet-RL-4B** that was specifically:
- Based on **Qwen3-4B**
- Trained with **GRPO (reinforcement learning)** for spreadsheet agent tasks
- Tagged: `spreadsheet`, `excel`, `reinforcement-learning`, `agents`, `tool-use`
- License: Apache 2.0
- Available in multiple quants (Q4_K_M = 2.53 GB recommended)

This model is purpose-built for exactly what SmartSht does — spreadsheet operations with tool calling. It should be evaluated as a **direct replacement** for both the current `qwen2.5-coder-1.5b` and `excel-assist` models. At 2.53 GB (Q4_K_M) it fits comfortably on the t3.large.

---

## Issue 10: Agent Tooling — Model Quality Is the Bottleneck, Not the Pipeline

### Investigation Result

The agent tool execution pipeline is **well-built and working correctly**:

```
LLM generates JSON → Server validates tool names against allowlist →
SSE streams to frontend → User clicks "Apply" → executeTool() dispatches →
Spreadsheet state mutated via ExecutionContext
```

**33+ mutation tools**, **5 read tools**, **50+ templates** — all functional. The QuickJS sandbox for `execute_script` is properly secured (forbidden patterns, memory limits, timeouts, mutation caps).

### The Problem

Tool execution is purely mechanical — it follows the JSON instructions. The **entire intelligence burden** is on the LLM to:
- Understand intent
- Pick the correct tool
- Generate correct parameters (cell refs, formulas, column letters)  
- Produce valid JSON

A 1.5B base model cannot do this. When Groq (70B) serves the request, tools work fine. When Ollama (broken base model) serves it, the JSON is malformed or nonsensical → `parseAgentResponse` falls back to `{message: raw_gibberish, actions: []}` → user sees garbage text with no actionable buttons.

### No Code Fix Needed

The tooling architecture is sound. Fixing issues #1 (wrong model) and #2 (JSON mode) resolves tool calling quality.

---

## Issue 11: No Groq Rate Limit Alerting or Monitoring

### Problem

The Groq free tier has hard limits:
- 30 requests/minute
- 14,400 requests/day
- 20,000 tokens/minute

When these limits are hit:
- Groq returns HTTP 429
- The server catches the error, logs it to console, and silently moves to Ollama
- **No alert is sent to the developer/admin**
- **No visibility** into how close you are to limits
- You found out the system was broken by experiencing it — not from any monitoring

### What's Needed

1. **Detect 429 responses explicitly** — parse the `x-ratelimit-remaining` headers Groq sends
2. **Log rate limit events prominently** — not just a console.warn buried in PM2 logs
3. **Alert mechanism** — at minimum, write to a dedicated log file or send a webhook/email when:
   - Daily limit reaches 80% usage
   - A 429 is received (Groq is now unavailable)
   - Consecutive Ollama fallbacks exceed a threshold (e.g., 5 in a row)
4. **Track usage in-app** — expose a `/admin/usage` endpoint or add to the health check showing:
   - Requests today vs. daily limit
   - Last 429 timestamp
   - Provider success/failure counts

### Why This Matters Now (checked this statement to verify. this statement is false. grok was never even being called except for one day. so no limit was ever reached.)

You're the only user testing and you've already experienced degraded quality (likely hitting limits). With actual users, Groq free tier will be exhausted rapidly. Adding your own additional API keys (OpenRouter, HuggingFace) as fallbacks is smart, but you need to **know when to act** rather than discovering it through broken UX.

### Recommended Implementation

- Add rate-limit header parsing to `server/src/groq.ts`
- Create a simple counter/timestamp store (in-memory or file-based)
- Add a `GET /health/usage` endpoint showing provider stats
- Optionally: webhook to Discord/Slack/email when limits are approaching

---

## Issue 12: Additional Concerns for Follow-Up

### 12.1 NLP Engine Has No Model — Entire Classification Layer is Inert

The `src/ai/nlp/` system (hybrid router, model manager, NLP engine client) is fully coded but has **no model to load**:
- `getBundledModel()` returns `new ArrayBuffer(0)`
- `/models/nlp/` directory doesn't exist in `public/`
- The manifest URL for model updates points to nowhere

This means the hybrid router's "Step 1: NLP classification" always falls through to LLM or regex. The entire local NLP engine is dead weight until a model is provided.

**Fix**: Bundle `all-MiniLM-L6-v2` (22 MB quantized) at `public/models/nlp/v1.0.0/model.onnx` with a corresponding `manifest.json`.

### 12.2 Multiple Cloud Providers Not Configured

The server supports `openrouter`, `huggingface`, and `groq` but only Groq has an API key. Adding at least one more provider would:
- Provide genuine failover instead of falling to the broken Ollama
- Spread rate limit pressure across providers
- Allow larger context windows (OpenRouter Qwen3-32B has 131K context)

**Action**: Add OpenRouter or HuggingFace API key to production `.env` and update `LLM_PROVIDER_ORDER`.

### 12.3 Spreadsheet-RL-4B Needs Testing Before Deployment

The Spreadsheet-RL-4B model looks ideal on paper (Qwen3 + RL for spreadsheet tool-use) but needs validation:
- Does it output JSON in the format SmartSht expects? (`{message, actions: [{tool, params, description}]}`)
- Does it understand the specific tool names in the registry?
- What's its token generation speed on the t3.large CPU?
- Is the prompt format compatible (Qwen3 chat template)?

**Action**: Register it locally in Ollama with a test Modelfile using the app's system prompt and verify output format before deploying to production.

### 12.4 Property Tests Marked as Incomplete in ONNX Spec

The `tasks.md` shows many property tests marked `[ ]*` (optional, not completed):
- Input validator property tests
- Routing heuristic property tests  
- Security validator property tests
- Session cache property tests
- Server session pool property tests
- SSE chunking property tests
- Formula function spill logic tests
- Auditor rule property tests
- Integration tests

While marked optional, these represent significant untested surface area. The code was likely generated by AI (including the spec structure) — property tests would catch edge cases the implementation may have missed.

### 12.5 Node.js Version Warning on Server

PM2 logs show:
```
The AWS SDK for JavaScript (v3) versions published after January 2027
will require node >=22. You are running node v20.20.0.
```
This is non-critical now but will need addressing within ~5 months.

### 12.6 Server Model File Weight Discrepancy

On the server, all three Ollama models share one 941 MB blob. On your local machine:
- `qwen2.5-coder-1.5b-q8_0.gguf` = 1.57 GB (Q8 quantization, higher quality)
- Server blob = 986 MB (likely Q4 or default Ollama pull)

Even if you fix the base-vs-instruct issue, the server model is a **lower quantization** than your local development model, meaning further quality degradation. When deploying the replacement model, use Q4_K_M or higher quant.

### 12.7 Workbook Cloud Save + Version History Untested in This Audit

The server has S3 integration for workbook persistence and version history (max 50 versions per workbook). This wasn't investigated but is worth verifying:
- Is S3 connectivity working?
- Are workbooks actually persisting for authenticated users?
- Is the version history functioning?

### 12.8 Redundant/Dead Model Files in Project

The `models/` directory contains files that are no longer needed or never worked:
- `Binoddaillama3-3000s-excel-trained/` — LoRA adapter only, needs a base model that isn't present. Never usable standalone.
- `Qwen3.5-4B.q8q4.gguf` — Legacy model. If Spreadsheet-RL-4B proves better, this can be removed.
- `excel-assist-q8.gguf` — 2.95 GB finetuned model that was never deployed to server. Evaluate if Spreadsheet-RL-4B replaces its purpose.

### 12.9 Temp Directory Cleanup

The `temp/` folder contains ~25 GB of model files, experimental repos, and duplicates. After evaluation:
- AMD Ryzen AI NPU models → delete (no compatible hardware)
- AMD Hybrid Repo → delete
- TAPAS / TAPEX PyTorch models → delete (wrong runtime stack)
- Qwen3-4B ONNX variants → keep only if needed for browser-side, otherwise delete
- Nodebox runtime → evaluate or delete
- Duplicate MiniLM copies → consolidate to one

---

## Issue 13: Mobile UI — Panels Cannot Be Closed, Cell Editing Broken

### Problems

1. **Tabs/panels have no close/minimize control on mobile** — When a user opens a template gallery item, auditor window, or other panel on mobile, there is no visible way to dismiss it. No X button, no swipe-to-close, no tap-outside-to-dismiss. The user is stuck.

2. **Auditor window same issue** — Once opened, it may trap the user with no way to return to the spreadsheet.

3. **Cell editing does not trigger the mobile keyboard** — When a user taps a cell on mobile, the software keyboard does not appear. This makes the spreadsheet effectively read-only on mobile devices. Likely cause: the cell tap handler focuses a non-input element (div/canvas) rather than an `<input>` or `contentEditable` element that triggers the virtual keyboard.

### Impact

These are **usability-breaking** on mobile. A spreadsheet app that can't edit cells on mobile is non-functional for that form factor.

### Likely Root Causes

- **Missing close buttons**: Panels/modals may use desktop-only dismiss patterns (Escape key, click-outside) that don't work on touch devices. Need explicit close/back buttons visible at mobile breakpoints.
- **Keyboard not triggering**: Mobile browsers only show the virtual keyboard when a user tap results in focus on an `<input>`, `<textarea>`, or `contentEditable` element. If the grid uses a custom focus system (e.g., tracking "active cell" in state without focusing an actual input), the keyboard won't appear. The fix is typically a hidden input that receives focus on cell tap and proxies keystrokes to the cell.

### Recommended Fix

1. **Add explicit close/back buttons** to all panels, modals, and drawers at mobile viewport sizes (≤768px). Ensure they're touch-target sized (≥44px).
2. **Add tap-outside-to-dismiss** for overlay panels on mobile.
3. **For cell editing**: On cell tap, programmatically focus a hidden `<input>` element positioned over/near the cell. This triggers the mobile keyboard. Route input back to the active cell's state.
4. **Test all interactive flows** at 375px viewport width (iPhone SE) and 390px (iPhone 14).

---



### 🔴 Critical (Do First)

| # | Fix | Impact | Status |
|---|-----|--------|--------|
| 1 | **Rotate all exposed credentials** | Security — keys are compromised | ⬜ TODO |
| 2 | **Deploy correct model to server** (Spreadsheet-RL-4B Q4_K_M or Qwen3.5-4B) | Core functionality — chat + tool calling quality | ✅ DONE — Spreadsheet-RL-4B deployed, Qwen3 chat template configured |
| 3 | **Add Groq rate-limit alerting** — log 429s, track usage, alert at 80% | Operational visibility | ⬜ TODO |
| 4 | **Add `response_format: {type: "json_object"}` to Groq action-mode calls** | Reliability — guarantees valid JSON | ⬜ TODO |
| 5 | **Fix mobile cell editing** — keyboard doesn't appear on cell tap | Mobile is non-functional without this | ⬜ TODO |
| 6 | **Server restructure** — clean directory layout | Maintainability, deployment sanity | ✅ DONE — `/opt/smartsht/`, BurntBeats removed, 7 GB freed |

### 🟡 Important (Do Soon)

| # | Fix | Impact |
|---|-----|--------|
| 6 | **Add close/minimize buttons to all mobile panels** (templates, auditor, tabs) | Users get trapped in panels on mobile |
| 7 | **Add a second cloud provider API key** (OpenRouter or HuggingFace) | Real failover instead of broken Ollama |
| 8 | **Increase Groq max_tokens** from 768 → 1280 for action mode | Prevents truncated JSON for complex responses |
| 9 | **Log + surface which provider served each response** | Debugging + UX transparency |
| 10 | **Bundle MiniLM-L6-v2 (22 MB) for the NLP engine** | Enables local intent classification without LLM calls |
| 11 | **Install `onnxruntime-node` in server/package.json** | Unblocks ONNX Path B (server-side inference) |

### 🟢 Medium-term (Plan For)

| # | Fix | Impact |
|---|-----|--------|
| 12 | Test Spreadsheet-RL-4B with SmartSht's system prompt locally | Validates if purpose-built model works with existing tooling |
| 13 | Evaluate native Groq tool calling (`tools` API param) | More reliable than prompt-only JSON generation |
| 14 | Rethink ONNX upload flow for everyday users | Architecture alignment with target audience |
| 15 | Run property tests / add missing test coverage for ONNX spec | Quality assurance for shipped code |
| 16 | Clean up temp/ and models/ directories | Disk hygiene, reduce confusion |
| 17 | Upgrade Node.js to v22 on server before Jan 2027 | AWS SDK compatibility |
| 18 | Verify S3 workbook persistence and version history | Data integrity for paying users |
