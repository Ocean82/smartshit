# Contributing to smartsh!t

Thanks for your interest in helping build an AI spreadsheet that normal people can actually use.

## Quick start for contributors

1. Fork the repo and clone your fork.
2. Install [Node.js 20+](https://nodejs.org/) and [Ollama](https://ollama.com/).
3. From the project root:

```bash
npm install
npm install --prefix server
npm run model:setup   # after placing a GGUF model in models/
```

4. Run both processes:

```bash
npm run dev:server    # terminal 1 — API on :8787
npm run dev           # terminal 2 — UI on :5173
```

## What we need help with

- **Intent matching** — natural-language phrases that should map to spreadsheet actions
- **Templates** — budget, expense, invoice, inventory layouts
- **Local LLM quality** — prompts and parsing for small models on CPU
- **Accessibility** — keyboard navigation, screen reader labels
- **Docs** — setup guides for Windows, macOS, and Linux
- **Tests** — intent resolution, formula engine edge cases

## Pull request guidelines

- Keep PRs focused — one feature or fix per PR.
- Match existing TypeScript/React style in `src/` and `server/`.
- Test locally with both frontend and server running.
- Do not commit model weights, `.env` files, or `node_modules/`.

## Code of conduct

Be respectful and constructive. This project is for everyone who hates spreadsheet formulas.

## Questions?

Open a [GitHub Discussion](https://github.com/Ocean82/smartshit/discussions) or an issue with the `question` label.
