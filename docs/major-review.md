.SmartSht Project Assessment
Architecture + AI model fitness review · code-verified Aug 2026 · read-only (no code changes)

Verdict
Core product (Formualizer auditor + regex agent + Groq explain/act) is the right bet. Around it sits a lot of unfinished AI infrastructure (NLP WASM, macros, ONNX upload, dual tiny Ollama models, AI.PREDICT) that either does nothing, does the wrong job, or fails open. Do not treat RELEASE_AUDIT “ready to ship” as accurate until SSRF, failover models, and stub surfaces are resolved.
13
Ranked findings
3
Critical
4
AI jobs wrong/missing
7
Deeper investigations
Findings (severity order)
Sev	Area	Finding	Where	Fix direction
Security	BYOK on /api/ai-function lacks SSRF hardening that chat already has — bare z.string().url(), schema unused, hand-rolled validation	server/src/schemas/aiFunction.ts, routes/aiFunction.ts	Reuse chat byokSchema refine + validateBody(aiFunctionBodySchema)
AI failover	Ollama fallback models on prod reportedly same non-instruct base blob; Groq 429 → garbage chat/tools. Silent provider identity	docs/ai-model-audit.md, providers.ts, ollama.ts	Verify live Ollama blobs; ship one real instruct/RL model; log provider+model to client
Wrong tool	AI.PREDICT / AI.SCORE use a general chat LLM + regex number scrape — nondeterministic, uncalibrated, expensive on fill-down	server/src/routes/aiFunction.ts FUNCTION_PROMPTS	Replace with local linear/seasonal stats or remove from v1
Dead feature	Macro executor defaultStepExecutor fakes success; chatService never passes undoManager/macroPlanCallbacks so macros never run	macroExecutor.ts, chatService.ts ~271	Wire real executeTool or delete/hide the entire macro surface
Dead feature	NLP WASM worker always returns unknown; parseUserIntentAsync unused in prod; hybrid router is façade	nlpWorker.ts, intentParser.ts, brain.ts	Ship MiniLM or strip NLP from startup to cut complexity
Quota	Usage metering fails open on DB errors — unlimited free requests until rate limits	server/src/usage.ts ~78-82	Fail closed or degrade to strict memory limiter
Product trust	Share permission "edit" accepted in UI/API but write path not implemented	shares.ts, ShareDialog.tsx	Hide edit until write exists
Structured output	jsonMode only passed to Groq; OpenRouter/HF/Ollama stream path ignore it; native tools API unused; stream never uses assist model	providers.ts callProviderStream vs callProvider	JSON mode (or tools) on all structured providers; assist on stream or drop dual models
Architecture	3+ competing intent systems (agent regex, shared intentParser, NLP hybrid, server intent) — overlapping, not unified	src/agent/, shared/intentParser.ts, src/ai/nlp/	One router with ordered stages; delete unused paths
Security	Sandbox relies on regex denylist around QuickJS — bypass-prone as a security boundary	src/sandbox/validate.ts	Treat as capability sandbox only; allowlist APIs, never denylist
Cost	Each AI.* cell hit = full chat completion; fill-down can blow free tier and Groq limits	aiFunctionDefinitions.ts, aiFunction.ts	Batch, cache aggressively, gate PREDICT/SCORE, show cost preview
ONNX	User-upload ONNX Path A built; Path B missing onnxruntime-node; product audience does not bring .onnx files	src/onnx/*, server/src/onnx/*	Bundle MiniLM for intent OR defer ONNX to power-user only
Docs	RELEASE_AUDIT_FINDINGS and older reviews overclaim readiness; July P0s mostly fixed but stubs remain	RELEASE_AUDIT_FINDINGS.md, docs/*-review.md	Treat docs as historical; trust code
AI models — right job?
Primary Groq 70B chat is appropriate. Failover and formula-cell prediction are not. Intent is mostly heuristics (fine); the NLP/ONNX theater is not earning its complexity.

Job	Current	Fit	Better alternative
Chat explain / advise	Groq llama-3.3-70b-versatile	
Keep as primary; add OpenRouter Qwen3-32B as real failover before Ollama
Act mode (tool JSON)	Same 70B + prompt JSON + Groq json_object	
Native tools API + per-tool Zod; raise max tokens for multi-action
Local CPU fallback	Ollama smartshit / assist (1.5B coder lineage)	
One Spreadsheet-RL-4B or Qwen3.5-4B instruct — not two tiny coder bases
Intent / routing	Regex + keyword trigrams; NLP worker stub	
Keep regex for commands; optional MiniLM-L6 (22MB ONNX) for fuzzy intent — skip WASM theater
AI.CATEGORIZE / SENTIMENT / SUMMARIZE	Chat LLM via /api/ai-function	
Acceptable; add label allowlists + confidence; batch column fills
AI.PREDICT / AI.SCORE	Chat LLM number hallucination	
Local regression / moving average / seasonal naive; or FORECAST.LINEAR style formula
Formula syntax / audit	Formualizer + in-browser auditor (no LLM)	
Keep deterministic — do not replace with LLM
Embeddings / suggestions	Token overlap; neural embeddings planned only	
MiniLM if ranking quality matters; else keep keyword
OCR / vision / FLAME	Docs / allowlist only — not wired	
Do not build until core chat+auditor is solid
ONNX.RUN cells	User-uploaded models in WASM	
Power-user only or remove from marketing; everyday users will not upload ONNX
What is working
Deterministic auditor + Formualizer (keep LLM out of formula correctness)

Preview / Apply before mutations (trust model is sound)

brain.ts deterministic skills before LLM

Groq act path with response_format json_object (maxTokens 1280)

Chat BYOK SSRF refine already exists — pattern to copy

July P0s (rate limit IPv6, trust proxy, open ai-function auth) largely fixed

Architecture conflicts
Instant agent parser vs shared intentParser vs NLP hybrid vs server intent

AI.* HTTP cells vs ONNX.* local cells (same registry, different trust)

Dual arg parsers for AI formulas (Formualizer AST + regex fallback)

Macro planner in NLP vs stub worker planner vs unwired chat path

Assist model only on non-stream callProvider; prod chat streams

Bad ideas — do not double down
Idea	Why it fails	Do this instead
Ship NLP WASM + macro planner + dual Ollama models + ONNX upload before core chat is reliable	Large tested surface never reaches production chat; dilutes the real product (auditor + deterministic agent + explain)	One cloud LLM path + regex fast path + auditor. Delete or freeze stubs.
AI.PREDICT as a first-class spreadsheet formula	Spreadsheets require stable recalc; chat LLMs are not forecasters; fill-down burns quota	Deterministic forecast functions; LLM only for explaining the forecast
Rely on 1.5B coder Ollama as production failover	Cannot follow CPA/teacher/auditor persona or multi-tool JSON reliably; makes quality look random	Fail loud when cloud is down, or one 4B spreadsheet-tuned GGUF
Prompt-only tools forever across providers	Parse failures → keyword fallback → wrong mutations; failover providers get no JSON mode	Native tool calling where available; shared JSON schema; reject invalid params
Show "Can edit" share without a write path	Trust-breaking UX for a product selling confidence in numbers	Read-only shares only until ACL write exists
Investigate deeper
ID	Topic	Why
I1	Live Ollama model blobs on prod	Audit claims all three names share one base blob — confirm with ollama show / sha256
I2	Credential rotation status	ai-model-audit listed live keys exposed in chat — verify rotation completed
I3	Regex agent false-positive mutations	Instant tools can mutate before LLM clarification; need corpus of real user phrases
I4	Store↔Formualizer missed sync call sites	Structural ops reload workbook; any missed mutation desyncs computed values
I5	Stripe webhook + workbook ownership routes	No dedicated tests; billing/ACL regressions are silent
I6	execute_script blast radius	Sandboxed but model-generated JS can still mass-mutate sheets
I7	Constant drift free-tier limits	Client/server/featureGates may disagree on daily caps

Verified against server/src/providers.ts, routes/aiFunction.ts, schemas/*, chatService.ts, macroExecutor.ts, nlpWorker.ts, usage.ts; cross-checked docs/ai-model-audit.md (ops claims about prod blobs still need live confirmation — see I1/I2).


Summary:

Open the interactive assessment beside chat: [project-assessment](C:\Users\sammy\.cursor\projects\d-spreadsheet-smartsht\canvases\project-assessment.canvas.tsx) (a Cursor Canvas for structured findings).

## Verdict

The **right core** is Formualizer + deterministic auditor + regex fast path + Groq 70B for explain/act. Around it is a lot of unfinished or mis-aimed AI (NLP WASM, macros, ONNX upload, tiny Ollama failover, `AI.PREDICT`) that either does nothing, does the wrong job, or fails open. Treat “ready to ship” docs as overconfident.

## Critical (fix / decide first)

| Severity | Finding |
|----------|---------|
| Critical | `/api/ai-function` BYOK lacks the SSRF harden chat already has; schema unused |
| Critical | Ollama failover reportedly wrong/non-instruct models → silent quality collapse after Groq limits |
| Critical | `AI.PREDICT` / `AI.SCORE` = chat LLM + regex number scrape — wrong tool class for spreadsheet recalc |

## AI model fitness (short)

| Job | Fit | Takeaway |
|-----|-----|----------|
| Chat explain / act on Groq 70B | Good / OK | Keep; add native tools + real cloud failover |
| Local 1.5B coder Ollama | Wrong | One 4B spreadsheet/instruct model, or fail loud |
| Intent | OK as regex | NLP worker is a stub — ship MiniLM or delete the façade |
| `AI.CATEGORIZE` etc. | OK | Batch + validate labels |
| `AI.PREDICT` / `SCORE` | Wrong | Local stats / FORECAST-style formulas |
| Formula audit | Good | Keep deterministic — do not LLM this |
| ONNX user upload / FLAME / OCR | Wrong / missing | Everyday users won’t bring `.onnx`; defer |

## Bad ideas (don’t double down)

1. **More AI backends before core reliability** — NLP + macros + dual Ollama + ONNX before chat failover is trustworthy.
2. **LLM as forecast formula** — spreadsheets need stable recalc; use deterministic forecast, LLM only to explain.
3. **Tiny coder model as prod failover** — makes quality look random; prefer fail-closed or one real 4B GGUF.
4. **“Can edit” shares without a write path** — trust-breaking for a product selling number confidence.

## Deeper investigation queue

Live Ollama blob SHA verification (I1), credential rotation from prior audit (I2), regex agent false-positive mutations (I3), store↔engine sync gaps (I4), Stripe/workbook route tests (I5), `execute_script` blast radius (I6), free-tier constant drift (I7).

Suggested order: SSRF → failover models → kill/replace PREDICT → fail-closed metering → wire-or-delete macros/NLP → provider JSON/tools everywhere.

No code was changed; this is assessment only. Say if you want a focused fix PR on the critical three.