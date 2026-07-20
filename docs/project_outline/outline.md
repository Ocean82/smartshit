# smartsh!t — Product Vision

> **One sentence:** smartsh!t is the tool you wish you had the first time someone
> sent you a complex spreadsheet and said "the numbers are all in there."

---

## The Problem

Every day, people open spreadsheets they didn't build:
- A business budget their predecessor created
- A financial model from their accountant
- An expense report template from their company
- A project tracker with 15 linked sheets

They stare at a grid of numbers and formulas. They don't know:
- What formulas are calculating
- Whether the numbers are correct
- Where to find the specific thing they need
- What's been updated vs. what's stale

They're afraid to change anything because they might break something.
They can't ask the spreadsheet what it does. Until now.

---

## What smartsh!t Does

### 1. Explains What's There
Import any spreadsheet. smartsh!t immediately tells you:
- What it's tracking (budget, invoice, project plan, etc.)
- Key totals and what they mean
- The structure (where income is, where expenses are, where totals are)
- What looks unusual or potentially wrong

### 2. Audits for Errors
The built-in auditor scans every formula and flags:
- Broken references (#REF!, #VALUE!, etc.)
- Formulas that skip adjacent cells (the silent $2000 error)
- Inconsistent patterns (one formula doesn't match its neighbors)
- Magic numbers buried in formulas
- Statistical outliers that might be typos

### 3. Helps You Navigate
- "Where are the expenses?" → jumps to the right section
- Click any formula → see what it depends on and what depends on it
- Section detection shows you the logical layout without scrolling

### 4. Answers Questions About Your Data
- "What's my biggest expense?" → answered from the data, not hallucinated
- "Is this formula correct?" → audited and explained
- "What happens if I change rent to $1200?" → shows downstream impact

---

## What smartsh!t Is NOT

- **Not a chatbot with a spreadsheet attached.** The chat is a secondary tool, not the primary interface.
- **Not trying to replace Excel/Sheets.** People already have their spreadsheets. We help them understand what's in them.
- **Not an automation platform.** We solve "understand" before "automate."
- **Not a formula tutor.** We explain YOUR specific formulas, not generic function docs.

---

## Target Users

### Primary: The Inheritor
Someone who received a spreadsheet built by someone else and needs to understand it, use it, and trust it. Common scenarios:
- New employee inheriting a department budget
- Small business owner reading their bookkeeper's reports
- Manager reviewing expense reports from a team
- Freelancer trying to use a client's template

### Secondary: The Builder Who Lost Track
Someone who built a complex spreadsheet months ago and can no longer remember what everything does. Their own formulas are now opaque to them.

### NOT our user (for now):
- Power users who want to build complex models from scratch
- Data analysts who need pivot tables and SQL
- Teams who need real-time collaboration

---

## Revenue Model

**Free tier:**
- Import and view any spreadsheet
- Auto-insights on import (the hook)
- Basic auditor (shows issues exist but not auto-fix)
- 3 AI questions per day

**Pro ($7/month):**
- Unlimited AI questions
- Full auditor with auto-fix suggestions
- Cell inspector with dependency chains
- Export insights as PDF report
- Version history
- Cloud save
- Priority cloud LLM providers

**Why this works:** The free tier delivers enough value to prove the product (auto-insights + basic audit). Pro unlocks the depth (full audit, unlimited questions, reports). The auditor finding a real error is the conversion trigger.

---

## Architecture Principles

1. **Local-first:** Spreadsheet data stays in the browser. No upload required for basic functionality.
2. **Instant by default:** 80%+ of interactions resolve locally without a network round-trip.
3. **Proactive over reactive:** Show value before the user asks for it.
4. **Explain, don't assume:** When in doubt, explain what the AI found rather than silently changing things.
5. **Safe mutations:** Any AI-suggested change requires explicit approval and can be undone.

---

## Long-Term Direction (v2+, Revenue-Justified)

These features only get built when v1 proves product-market fit:

| Feature | Trigger |
|---------|---------|
| Multi-sheet workspace understanding | When users import workbooks with 5+ sheets |
| "What-if" scenario modeling | When Pro users ask "what if" questions frequently |
| Persistent cross-session memory | When returning users want continuity |
| Cross-sheet formula tracing | When complexity of imported files demands it |
| Collaborative annotations | When teams adopt it (not individuals) |
| Postgres-backed cell storage | When file sizes exceed browser limits |

---

> "The numbers are all in there" is not helpful.
> smartsh!t makes it helpful.
