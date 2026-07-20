# smartsh!t v1 Roadmap — Understand Your Spreadsheet

> **Core problem:** You open a complex budget or financial spreadsheet someone else built.
> You don't know where anything is, what formulas are doing, or whether the numbers are right.
> You need a tool that tells you what's going on — without asking you to become an Excel expert.

---

## The Vision

smartsh!t is **a spreadsheet that explains itself**.

Import any budget, expense report, or financial model. The app immediately tells you:
- What this spreadsheet is tracking
- Where the important numbers are
- What looks wrong or unusual
- How to find what you need

The AI isn't a chatbot bolted onto a grid. It's an **understanding layer** that sits between you and complex data — the colleague who built the spreadsheet explaining it to you.

---

## Current State (July 2026)

What's working:
- [x] Full spreadsheet grid with formulas (HyperFormula)
- [x] Excel import/export (.xlsx, .csv)
- [x] AI chat assistant (local + cloud providers)
- [x] Spreadsheet auditor (formula errors, outliers, inconsistencies)
- [x] Instant command execution (add rows, format, sort — no LLM needed)
- [x] 50+ templates for common use cases
- [x] Auth + Pro billing (Clerk + Stripe)
- [x] Cloud save, version history, sharing
- [x] Conditional formatting, charts, sorting, filtering

What's broken or missing:
- [ ] No proactive insights on import (user has to ask)
- [ ] Auditor results aren't surfaced prominently enough
- [ ] Chat is the primary UI when it should be secondary
- [ ] No "explain this cell" or "what feeds into this number" interaction
- [ ] No guided navigation ("show me where expenses are")
- [ ] Context window too shallow for complex multi-sheet workbooks

---

## Phase 1: Proactive Intelligence (NOW — 2 weeks)
*Goal: The app explains the spreadsheet before you ask.*

### Auto-Insights on Import
When a user imports a file, immediately show a summary card (not in chat — overlaid on the grid):
- What this sheet appears to be (budget, invoice, tracker, etc.)
- Key totals with labels (Total Income: $X, Total Expenses: $Y, Net: $Z)
- Top 3-5 categories or line items by magnitude
- Anything unusual (outliers, errors, missing data)
- "Here's what I found" — not "ask me anything"

### Auditor as First-Class UI
- Run audit automatically on import (not hidden behind a panel toggle)
- Show a health badge in the sheet tab: "3 issues found"
- Critical findings surface as a non-modal banner above the grid
- One-click navigate to the problem cell

### "What's This?" Cell Inspector
- Hover/click a cell → popover showing:
  - Plain-English explanation of what this formula does
  - What cells feed into it (dependencies)
  - What cells depend on it (dependents)  
  - Whether the auditor flagged anything about it
- This replaces the need to mentally trace formula chains

---

## Phase 2: Guided Navigation (Weeks 3-4)
*Goal: Help users find what they need in spreadsheets they didn't build.*

### Smart Search
- "Where are the expenses?" → highlights the expense section, scrolls to it
- "Find rent" → jumps to the cell, highlights related formulas
- "What formula calculates the total?" → shows the dependency chain
- Not chat-based. A search bar that understands spreadsheet structure.

### Section Detection
- Automatically identify logical sections of a spreadsheet (income block, expenses block, summary row, etc.)
- Show a minimap/outline panel: "Income (rows 2-8) | Expenses (rows 10-25) | Totals (row 27)"
- Click to navigate

### Contextual Suggestions
- When a user selects a range, offer relevant actions:
  - Selected a column of numbers → "Sum: $4,200 | Average: $350 | 2 outliers detected"
  - Selected a formula cell → "This calculates [explanation]. It depends on [cells]."
  - Selected an error cell → "This is broken because [reason]. Fix: [suggestion]."

---

## Phase 3: Conversation That Understands Context (Weeks 5-7)
*Goal: When users do ask questions, the AI actually helps.*

### Selection-Aware Chat
- The chat always knows what the user is looking at
- "Explain this" → explains the selected cell/range without asking "explain what?"
- "Is this right?" → audits the selected formula and gives a confidence answer
- "What if I change this to $500?" → shows downstream impact

### Better Memory
- Remember what the user has already asked about this sheet
- "You asked about rent earlier — it's in B12, and it's the largest single expense"
- Don't lose context after 4 exchanges

### Error-Aware Responses
- When the AI suggests an action that fails, explain why and offer an alternative
- When a formula returns #REF!, explain the specific broken reference — not generic docs

---

## Phase 4: Revenue & Retention (Weeks 8-12)
*Goal: Convert free users to Pro based on real value delivered.*

### Pro Features That Matter
- Free: Import, auto-insights, 3 AI questions/day, auditor (basic)
- Pro ($7/mo): Unlimited AI, full auditor with auto-fix, version history, export reports, priority cloud models

### Value Proof
- "smartsh!t found 3 formula errors in your budget" → share-worthy moment
- Monthly email: "This month you imported 4 spreadsheets. We caught 7 issues and answered 12 questions."
- Before/after: "Your spreadsheet health improved from 62/100 to 94/100"

### Retention Hooks
- Saved workbooks with persistent auditor history
- "Your Q1 budget had 2 over-budget categories — tap to compare with Q2"

---

## What We're NOT Building in v1

| Feature | Why Not Yet |
|---------|-------------|
| Real-time collaboration | Needs Yjs/CRDT infra — not the core problem |
| Postgres EAV cell storage | Current local-first arch works for target users |
| Full autonomous agent loop | Overkill — users need understanding, not automation |
| pgvector / RAG | Only matters for multi-sheet workspaces (v2) |
| Custom formula compiler | HyperFormula is sufficient |
| Workflow automation | Solving "understand" before "automate" |
| Template marketplace | Premature — build audience first |

---

## Success Metrics

| Metric | Target (3 months) |
|--------|-------------------|
| Import → insight shown | <3 seconds |
| Auditor findings per import | Track (proves value) |
| Users who import a file on first visit | >50% |
| AI response relevance (thumbs up rate) | >70% |
| Pro conversion from auditor users | >8% |
| Returning users (week 2) | >30% |

---

## Technical Priorities

| Priority | What | Why |
|----------|------|-----|
| 1 | Auto-insights engine | The core "aha" moment |
| 2 | Cell inspector / formula explainer | Solves "what does this do?" |
| 3 | Auditor prominence | Proves value without user effort |
| 4 | Smart search / navigation | Solves "where is this?" |
| 5 | Selection-aware chat context | Makes conversations useful |

---

> This app exists because spreadsheets are hard to read, not hard to write.
> The AI helps you understand what's already there — that's the job.
