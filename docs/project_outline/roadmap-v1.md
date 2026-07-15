# SmartSht v1 Roadmap — Ship, Learn, Earn, Upgrade

> **Philosophy:** Don't over-engineer. Ship a solid product that works, attracts users,
> and generates revenue. Reinvest earnings into each upgrade toward the end goal (see `outline.md`).

---

## Current State (July 2026)

What's already working:
- [x] Full spreadsheet grid with formulas (HyperFormula)
- [x] AI chat assistant (Ollama local + BYOK cloud providers)
- [x] Excel import/export
- [x] Cloud save (RDS + S3)
- [x] Auth + Pro billing (Clerk + Stripe, $7/mo)
- [x] 50+ built-in templates
- [x] Community template marketplace
- [x] Version history
- [x] Sharing (public links)
- [x] Conditional formatting, charts, sorting, filtering
- [x] Zoom controls, Ctrl+End/Home navigation
- [x] Dynamic grid bounds (no more infinite empty scroll)

---

## Phase 1: Foundation Fix (NOW — 1-2 weeks)
*Goal: Make the AI actually useful. Fix the #1 user complaint.*

- [ ] **EAV cell storage in Postgres**
  - Create `smartsht.spreadsheet_cells` table (sparse matrix)
  - On file upload/save: serialize browser cells → Postgres rows
  - On load: reconstruct sparse map from Postgres
  - Gives the AI agent full SQL access to user data

- [ ] **Agent SQL tools**
  - New server tools: `query_data`, `aggregate_column`, `find_by_value`
  - Agent runs real SQL instead of parsing a 60-row text preview
  - Conditional formatting by value ("cells with 7 → blue") becomes a DB query

- [ ] **Increase sample context to LLM**
  - Already bumped from 25→60 rows
  - With Postgres backing, can send full column stats without row limits

---

## Phase 2: UX Polish (Weeks 3-4)
*Goal: Make it feel professional. Reduce friction for new users.*

- [ ] **Onboarding flow**
  - First-time wizard: "Import a file" or "Start from template"
  - Show 3 example prompts after import ("Explain this sheet", "Find overspending", "Create a chart")

- [ ] **Streaming cell preview**
  - When agent returns cell mutations, show them as highlighted/ghost cells
  - User clicks "Apply" or "Esc" to reject (already partially built)

- [ ] **Better error states**
  - When AI fails: show what it tried, offer retry with different phrasing
  - When upload fails: clear error message with fix suggestion

- [ ] **Mobile responsive**
  - Chat panel as full-screen overlay on mobile
  - Touch-friendly cell selection

---

## Phase 3: Growth Features (Weeks 5-8)
*Goal: Give users reasons to stay and share.*

- [ ] **Formula suggestions**
  - As user types `=`, suggest common formulas based on column data types
  - "You have a column of numbers — try =SUM, =AVERAGE, =MAX"

- [ ] **Auto-insights on upload**
  - Immediately after import, show 3-5 key findings (totals, trends, outliers)
  - No prompt needed — proactive value delivery

- [ ] **Export as PDF report**
  - One-click professional report from sheet data
  - Uses the AI to write a narrative summary

- [ ] **Shareable templates with previews**
  - Template gallery shows a live preview thumbnail
  - Users can "remix" community templates

---

## Phase 4: Revenue Optimization (Weeks 9-12)
*Goal: Convert free users to Pro. Justify the $7/mo.*

- [ ] **Pro features gate**
  - Free: 3 AI questions/day, 1 workbook, basic templates
  - Pro: Unlimited AI, unlimited workbooks, export, version history, priority

- [ ] **Usage analytics dashboard**
  - Show users their AI usage, savings found, time saved
  - "SmartSht saved you 2 hours this week" → retention hook

- [ ] **Referral system**
  - "Share with a friend, both get 1 week Pro free"
  - Viral loop for organic growth

---

## What We're NOT Building Yet

These are end-goal features (see `outline.md`). Don't touch until Phase 4 revenue justifies it:

- ❌ Column-level type enforcement (typed schemas)
- ❌ Workflow automation / triggers
- ❌ pgvector RAG for cross-sheet search
- ❌ Worker pools / Lambda execution
- ❌ Custom formula compiler (HyperFormula is fine)
- ❌ Real-time collaboration (Yjs)
- ❌ WebSocket streaming mutations

### Note on Async Task Queuing

The current architecture is already non-blocking for our scale:
- Express + Node.js async I/O handles concurrent requests without thread blocking
- LLM calls (Ollama/cloud) are `fetch()`-based and run in parallel
- Cell sync to Postgres fires asynchronously after the HTTP response is sent
- SSE streaming means users see immediate feedback ("thinking..." → tokens appear)

**When to add a formal task queue (BullMQ + Redis):**
- When a single agent action modifies 1000+ cells and DB writes exceed 5 seconds
- When concurrent Ollama users exceed what a single model instance can handle
- When we add Level 3 workflow automation (triggers that fire bulk mutations)

This is a half-day addition when the time comes — not a gap in the current architecture.
The BYOK feature further reduces server load since most inference goes to the user's own cloud endpoint.

---

## Technical Decisions (Keep It Simple)

| Decision | Choice | Why |
|----------|--------|-----|
| Cell storage | EAV in existing RDS | No new infra, already connected |
| Formula engine | HyperFormula (browser) | Already working, fast enough |
| LLM providers | BYOK + Ollama fallback | Zero cost to us |
| Deployment | Single EC2 + RDS + S3 | Already running, scales to 1000+ users |
| Frontend | React SPA (single HTML) | Already built, fast deploys |
| Queue/workers | None (direct DB writes) | Add later when scale demands |

---

## Success Metrics

| Metric | Target (3 months) |
|--------|-------------------|
| Monthly active users | 500+ |
| Pro subscribers | 50+ ($350/mo revenue) |
| AI response success rate | >80% (up from ~30% current) |
| Average response time | <5 seconds |
| Template usage | 100+ template runs/week |

---

## Upgrade Path (Revenue → Reinvestment)

```
$0-350/mo   → Current infra (t3.large + RDS)
$350-1000/mo → Add OpenRouter as default provider (better AI for all)
$1000-3000/mo → Upgrade to t3.xlarge, add pgvector, typed columns
$3000+/mo   → Worker pools, real-time collab, full end-goal architecture
```

---

> The end goal in `outline.md` is where we're headed. This roadmap is how we get there
> without burning cash or building features no one uses yet.
