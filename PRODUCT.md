# Product

## Register

product

## Platform

web

## Users

**Primary:** Anyone who opens a spreadsheet and feels lost — budget owners, expense reporters, people handed a financial model they didn't build. They range from complete beginners who want to learn what their data means, to average users who want confidence in what they're reading, to professionals who use it to double-check work and catch errors fast.

The common thread: they don't want to fight formulas. They want clarity, control, and trust in their numbers.

## Product Purpose

smartsh!t makes spreadsheets legible. Import any file and the app immediately tells you what it's tracking, flags formula errors, highlights unusual values, and answers questions about your specific data in plain English. The auditor catches silent accounting errors (skipped cells in SUMs, inconsistent formulas, outliers) before they compound. Chat handles everything from "explain this formula" to "bold the headers" — no formula syntax required.

Success looks like: users feel confident their numbers are correct, spend less time deciphering formulas, catch errors before they matter, and feel in control of their financial data.

## Positioning

The only spreadsheet that reads itself to you and catches your mistakes before they matter — and it does it instantly because the spreadsheet is loaded directly into memory for the AI to read, not re-parsed on every question.

## Brand Personality

**Punk-in-a-jacket.** Professional humor, beach-side with a corporate laptop that gets the job done. The voice is a sharp colleague who swears occasionally, catches your mistakes before your boss does, and explains things so clearly you feel smart — not talked down to. Confident without posturing. Irreverent without being crude. The name "smartsh!t" sets the tone: we're serious about the work, not serious about ourselves.

Not "full death metal scream" — that alienates the everyday budget person. Not "full suit and tie in a cubicle" — that's forgettable. We sit between: competent enough to trust with your finances, casual enough that using this feels like relief rather than obligation.

**Voice markers:**
- Direct, concise, occasionally funny
- Shows its work without lecturing
- Treats the user as an intelligent adult who simply doesn't want to deal with formulas
- Never condescending, never jargon-heavy, never "AI magic" hand-waving
- Earns trust by being useful, not by looking impressive

## Anti-references

- **Sloppy or homemade-looking UIs** — anything that looks vibe-coded, unfinished, or like a weekend prototype
- **Exposed raw grids** — visible gridlines that feel like graph paper or an outdated template
- **Cluttered, dense interfaces** — Excel's toolbar sprawl, headers stuffed with metadata, rainbow colors, chaotic fonts
- **The "wall of text" chatbot** — giant chat windows dumping paragraphs of cell references that users can't map back to their data
- **Disembodied data tables** — naked HTML tables with no visual context or guidance
- **Ambiguous warning badges** — generic red icons without immediate, clear explanation
- **Horizontal scroll hell** — endless columns creating user fatigue
- **Hard-coded meta-data colors** — relying on cell colors alone to convey meaning (green = good, yellow = review)
- **Destructive inline editing** — free-text entry that breaks structured data
- **Merge cells, unconstrained data entry** — patterns that break sorting, filtering, and formula logic

## Design Principles

1. **Show, don't dump** — surface insights progressively. A health score first, details on demand. Never 50 errors at once.
2. **Earn trust by showing work** — every AI conclusion comes with an explorable "why." Flagged a row? Explain the reasoning in plain language, one click away.
3. **Speed is a feature** — instant responses from the intent parser, zero-latency local analysis. The AI should feel like it already knows the answer.
4. **Control without complexity** — users approve changes before they happen. Preview everything, undo anything. Confidence through reversibility.
5. **Clarity over cleverness** — plain English over jargon. "This expense is 200% higher than your monthly average" over "Row 14 violates Type Float constraint."

## Accessibility & Inclusion

This application requires accessibility and usability **beyond standard WCAG 2.1/2.2 AA**, because it blends two complex interfaces (data tables + AI tools) for users who struggle with spreadsheets.

### Cognitive accessibility (COGA-informed)
- **Jargon-free AI translations** — translate spreadsheet errors into plain language, not technical references
- **Predictable layout anchors** — no dynamic UI shifting during AI processing; stable layouts so users don't lose their place
- **Gradual disclosure** — high-level health score ("3 things need your attention"), expand one card at a time
- **Clear error recovery** — explicit multi-step undo pipeline; any AI-recommended fix is reversible with a single visible button
- **Visual context reminders** — sticky headers, highlighted active row during AI evaluation

### AI-specific accessibility (HCID)
- **Screen reader notification of AI state changes** — `aria-live="polite"` regions so users know when analysis completes
- **Keyboard-accessible AI actions** — tab through feedback cards, execute fixes via Enter, full keyboard navigation
- **Explorable explanations** — every flagged item has an accessible tooltip or micro-text explaining the AI's reasoning

### Standard compliance
- WCAG 2.1 AA minimum across all surfaces
- 4.5:1 contrast for body text, 3:1 for UI controls
- Respect `prefers-reduced-motion`
- Support for screen readers, keyboard-only navigation, and high-contrast modes
