# smartsh!t

**The spreadsheet that explains itself.**

🌐 **[smartsht.com](https://smartsht.com)**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Sponsor](https://img.shields.io/badge/Sponsor-Ocean82-ea4aaa?logo=github-sponsors&logoColor=white)](https://github.com/sponsors/Ocean82)

> Built by **[Ocean82](https://github.com/Ocean82)** — MIT licensed. Forks and contributions welcome.

---

## The Problem

Someone sends you a spreadsheet. A budget, an expense report, a financial model. You open it and see a wall of numbers, formulas, and tabs. You don't know what half the cells do. You're afraid to change anything. You can't ask the spreadsheet what it means.

**smartsh!t fixes that.**

Import any spreadsheet. The app immediately tells you what it's tracking, flags formula errors, highlights unusual values, and answers questions about your specific data — in plain English.

---

## What It Does

| Feature | How It Helps |
|---------|-------------|
| **Auto-Insights** | Import a file → instantly see key totals, structure, and what looks unusual |
| **Formula Auditor** | Catches broken references, skipped cells in SUMs, inconsistent formulas, and outliers |
| **Natural Language Q&A** | "Where am I overspending?" "What does this formula do?" "Is this number correct?" |
| **Instant Actions** | "Bold the headers" "Sort by amount" "Add a row" — no formulas needed |
| **Templates** | 50+ built-in templates for budgets, invoices, trackers, and more |

---

## Screenshots

![smartsh!t — AI-powered spreadsheet understanding](docs/images/smartshit-screenshot.png)

Import a budget → the auditor flags a formula that skips a cell → the AI explains what your spreadsheet is tracking and where the risk is.

---

## Quick Start

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ |
| Ollama | latest (optional — cloud AI works too) |

### 1. Clone and install

```bash
git clone https://github.com/Ocean82/smartshit.git
cd smartshit
npm install
npm install --prefix server
```

### 2. Configure AI (pick one)

**Option A — Local (Ollama, free, private):**
```bash
npm run model:setup
```

**Option B — Cloud (faster, no GPU needed):**
Copy `.env.example` to `.env` in `server/` and add one API key:
```
OPENROUTER_API_KEY=your-key-here
```

### 3. Run

```bash
# Terminal 1 — API server
npm run dev:server

# Terminal 2 — Web UI
npm run dev
```

Open **http://localhost:5173**

### Try It

1. Import any `.xlsx` or `.csv` file (a budget, expense report, anything)
2. Read the auto-insights summary
3. Check the auditor findings
4. Ask: "Explain this spreadsheet" or "What's my biggest expense?"

---

## Architecture

```
┌─────────────────────┐        ┌──────────────────┐
│  React + Vite       │  SSE   │  Express server  │
│  HyperFormula       │◄──────►│  Intent parser   │
│  Zustand store      │        │  LLM routing     │
│  Auditor engine     │        │  (port 8787)     │
└─────────────────────┘        └────────┬─────────┘
                                        │
                               ┌────────┴─────────┐
                               │  Ollama (local)   │
                               │  OR cloud LLM     │
                               └──────────────────┘
```

| Layer | Tech |
|-------|------|
| Frontend | React 19, Vite 7, Tailwind CSS 4, Zustand, HyperFormula |
| Backend | Express 5, TypeScript, SSE streaming |
| AI | Ollama (local) / OpenRouter / Groq / Hugging Face / BYOK |
| Auditor | TypeScript-native, runs in-browser against HyperFormula |
| I/O | SheetJS (`xlsx`) for Excel import/export |

---

## Key Concepts

### The Auditor
A rule-based engine that scans your spreadsheet for real problems:
- **Error cells** — #REF!, #VALUE!, #DIV/0!
- **Range gaps** — a SUM that skips an adjacent cell (the silent accounting error)
- **Inconsistent formulas** — one formula breaks the pattern in a column
- **Magic numbers** — constants buried inside formulas instead of in input cells
- **Outliers** — values that are statistically far from their column average
- **Circular references** — formulas that depend on themselves

### The Intent Parser
80% of common operations (sort, format, add a row, sum a column) are handled instantly by a local regex parser — no LLM round-trip, no latency. Complex or open-ended questions route to the AI.

### Hybrid AI
Deterministic analysis (budget breakdowns, outlier detection, auditor findings) runs locally in the browser. Only open-ended questions or complex requests go to an LLM. This means most of the app works without any AI backend at all.

---

## Configuration

Copy `.env.example` to `.env` in the `server/` directory:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8787` | API port |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama endpoint |
| `OPENROUTER_API_KEY` | — | Recommended cloud provider |
| `GROQ_API_KEY` | — | Alternative cloud provider |
| `LLM_PROVIDER_ORDER` | `openrouter,groq,ollama` | Failover order |

---

## Contributing

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for setup and PR guidelines.

**Areas where help is welcome:**
- Auditor rules (new error patterns to detect)
- Intent parser patterns (more instant-response phrases)
- Accessibility improvements
- Import format support (Google Sheets export, Numbers)
- Documentation and tutorials

---

## Roadmap

See [docs/project_outline/roadmap-v1.md](docs/project_outline/roadmap-v1.md) for the full plan.

**Next up:**
- [ ] Auto-insights on import (proactive value without asking)
- [ ] Cell inspector (explain any formula on hover)
- [ ] Smart search (find things by description, not cell reference)
- [ ] Auditor auto-run on import with prominent findings display

---

## License

MIT License — Copyright (c) 2026 **[Ocean82](https://github.com/Ocean82)**.

See [LICENSE](LICENSE). Free to use, modify, and distribute with attribution.

---

## Sponsorship

If smartsh!t saves you from spreadsheet confusion, consider sponsoring:

**[Sponsor Ocean82 on GitHub](https://github.com/sponsors/Ocean82)**

---

**Topics:** `spreadsheet` · `ai` · `formula-auditor` · `budget` · `react` · `typescript` · `hyperformula` · `open-source` · `self-hosted`
