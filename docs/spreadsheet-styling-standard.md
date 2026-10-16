# Spreadsheet Styling Standard — "homemade → hired a pro"

Status: design reference (2026-10-15). Source: distilled in our own words from
industry spreadsheet-design conventions; no third-party text or code is copied.
This is the house standard the AI follows when a user asks to style, clean up,
or "make this look professional." It maps each principle to the smartsht tools
that already exist, so it is directly buildable — not aspirational.

Scope: this doc is the SPEC for two deferred features —
- **Q1(b): the one-shot "professionalize my sheet" makeover** (an `execute_macro`
  that chains the recipes below), and
- **Q4: the styling-skills catalog** (new `kind: 'recipe'` capabilities whose
  trigger phrases map to these outcomes).

It is not itself code. It defines WHAT "professional" means here and WHICH
existing tools produce it.

---

## The tools we build on (already shipped)

Everything below is expressible with primitives that exist today. No new engine
work is required for the core standard.

- `format_cells` — bold, italic, underline, strikethrough, fontSize, fontFamily,
  bgColor, fontColor, textAlign, verticalAlign, textWrap, borders (per-side), and
  a `condition` (`is_number`, `contains`, `negative`, `positive`, `eq`, `lt`,
  `gt`, `lte`, `gte`) for conditional targeting.
- `format_cells` numberFormat vocabulary: `number`, `number-int`, `currency`,
  `currency-int`, `currency-gbp`, `currency-eur`, `currency-jpy`, `accounting`,
  `accounting-neg`, `percent`, `percent-int`, `date`, `date-iso`, `date-long`,
  `date-short-eu`, `time`, `time-24`, `datetime`, `fraction`, `scientific`,
  `text`.
- `style_recipe` — bounded one-shot macros: `header`, `total_row`, `table_polish`.
- Layout: `set_column_width`, `set_row_height`, `auto_fit`, `rename_header`.
- `execute_macro` — runs a multi-step plan as one undoable group (the backbone of
  the makeover).

The makeover is the sequencing of these; the catalog is their trigger phrasing.
Nothing here needs native tool-calling or a new framework.

---

## Part 1 — The principles (what "professional" means)

### 1.1 Number formats are not optional

An unformatted ratio or amount is the single clearest "homemade" tell. A raw
`0.6029` or `12400000` in a finished sheet is a defect.

- Currency → a currency format (`currency` / `currency-int`), never a bare number.
- Percentages → `percent` (one decimal) by default; `percent-int` when the scale
  makes decimals noise.
- Dates → a real date format (`date` / `date-iso`), never a number like `2,028`.
- Plain counts → `number-int`; measured quantities → `number` with a sensible
  decimal count.
- Infer the format from the column's role and content, not from the header word
  alone (a column of `0.08`, `0.2` is almost certainly percent even if unlabeled).

### 1.2 Hierarchy: headers, data, and totals must look different

A reader should tell the three apart at a glance.

- **Headers** — bold, a fill, often a bottom border. (`style_recipe: header`.)
- **Data** — plain; let the numbers carry the weight.
- **Totals / subtotals** — bold, a top border (a hairline above the sum), and the
  total should be a simple sum of the contiguous cells directly above it.
  (`style_recipe: total_row`.)

### 1.3 Restraint beats decoration

- **One accent color.** A second competes; a third is decoration. Pick one for
  KPIs / emphasis and stop.
- **Near-white background.** Dark fills cost legibility (and toner on print) and
  fight the app's own selection highlight. Reserve fills for headers, total rows,
  and deliberate standouts — not every cell.
- **Do not border every cell.** Borders mark structure (header underline, total
  overline, section edges), not individual data cells.
- **Body text ≥ ~10pt.** Sheets get printed and squinted at.

### 1.4 Layout and breathing room

- Column widths: wide enough that content is readable, not so wide there's a sea
  of empty space. Label columns wider than figure columns. (`set_column_width` /
  `auto_fit`.)
- Row heights: comfortable; `auto_fit` after wrapping long text so rows aren't
  clipped.
- Group related rows; separate sections with a blank row rather than a heavy
  border.
- Wrap only the columns that hold sentences (`textWrap` on description columns),
  not the whole sheet — wrapping a figures column just makes rows tall.

### 1.5 Conditional formatting that stays true

When highlighting by rule (negatives red, numeric cells, values over a
threshold), prefer a live `condition` on `format_cells` (`negative`, `is_number`,
`gt`, etc.) so it keeps holding as the data changes — not a one-time fill painted
onto whatever cells happen to match today.

### 1.6 Color conventions (when the user gives none)

These are the widely-understood financial-model text-color conventions. Apply
them only when the user has NOT specified colors and has NOT provided an
already-styled sheet (see §3). Use judgment — not every sheet is a finance model.

| Color | Meaning |
| --- | --- |
| Blue | Hardcoded inputs / assumptions the user will change |
| Black | Formulas and derived values |
| Green | Links pulling from another sheet in the same workbook |
| Red | External links / error-flag values |
| Gray | Static constants |

### 1.7 Finance-model extras (only for finance-style sheets)

When the sheet is clearly a financial model (P&L, budget, valuation, 3-statement)
and the user hasn't overridden these:

- Zeros shown as `-` (dash), not `0`.
- Negatives red and in parentheses: `(500)`, not `-500` (`accounting-neg`).
- Units in the header: "Revenue ($mm)", not a bare "Revenue".
- Totals sum the contiguous range directly above, with a border above the total.
  (Styling an *existing* total — bold + top border — is value-safe formatting;
  *creating* a totals row writes data and belongs to the opt-in totals step in
  Part 2, not the value-safe pass.)
- Section headers that span columns: left-justified, dark fill, white text.
- Numeric column labels (dates) right-aligned to match the data; row labels
  left-justified, sub-metrics indented.

---

## Part 2 — The "professionalize my sheet" makeover (Q1(b))

A single request ("make this look professional", "clean this up", "format this
like a pro") runs an ordered `execute_macro` of the existing recipes/tools. It
must be **preview-first by default** and show the full diff before applying
(it is multi-step and touches many cells); in Auto mode the individual low-risk
format steps are each auto-eligible, but a whole-sheet makeover is substantial
enough that previewing the batch is the safer default — confirm this policy when
building.

### Two passes: value-safe formatting, and an opt-in data step

Not every styling primitive is value-safe. `style_recipe: header` is pure
formatting, but **`style_recipe: total_row` and `style_recipe: table_polish`
WRITE cell contents** — `total_row` adds a "Total" label and SUM formulas, and
`table_polish` internally calls `generateTableTotals`, so both produce
`cellUpdates` and carry `persistenceCaveat('style_recipe')`. They are NOT
reversible beyond the session once the file is saved and reopened. So the
makeover is split:

- **Formatting pass (default, value-safe):** header styling, per-column number
  formats, column widths, and conditional emphasis. These change only
  presentation, never a cell's value — safely reversible.
- **Totals step (opt-in, writes data):** adding or refreshing a totals row. This
  is a separate, explicitly-surfaced step that writes values/formulas. It must
  NOT run silently as part of "make it look nice": either (a) the user asked for
  totals ("add a totals row", "with a sum at the bottom"), or (b) the makeover
  offers it as a distinct, separately-confirmed action carrying the persistence
  caveat. It is never auto-applied, regardless of posture.

### Formatting pass — ordered plan (value-safe)

Skip any step that doesn't apply to the detected sheet shape.

1. **Detect the table region and header row** (reuse the auditor / `styleRecipes`
   table-range detection — do not reinvent).
2. **Header** — `style_recipe: header` (bold + fill + bottom border, freeze the
   header row if supported). Format-only.
3. **Number formats per column** — infer each column's role (currency / percent /
   date / count) from its values and apply the matching `numberFormat` via
   `format_cells` on the column range. This is the highest-impact single step,
   and it is pure formatting.
4. **Column widths** — `auto_fit` (or `set_column_width` with label-wider-than-
   figure heuristics) so nothing is clipped or swimming in space.
5. **Standout emphasis** — at most one accent: e.g. negatives red
   (`condition: negative`) on financial columns, or a KPI highlight. Do not pile
   on multiple conditional rules. Format-only (live `condition`, no value write).

For a banded-table look, prefer a **format-only** banding step (header + row-fill
alternation via `format_cells`) rather than `table_polish`, because
`table_polish` also writes a totals row. Only reach for `table_polish` when the
user explicitly wants the totals it generates — in which case it belongs in the
opt-in data step below, not the value-safe pass.

### Totals step (separate, opt-in, writes data)

- `style_recipe: total_row`, idempotent (must not stack a second total row), with
  the §1.7 total conventions (sum the contiguous range above, border above).
- Surfaced as its own confirm carrying the persistence caveat; never auto-applied.

Boundaries:
- The **formatting pass never changes a cell VALUE** — only presentation — so it
  is safely reversible and honest. The **totals step does write values**, is
  opt-in, carries the caveat, and is never silent or auto-applied.
- No row deletion anywhere in the makeover.
- One `execute_macro` → one undo entry. If both passes run they still commit as a
  single undo group, but the user has seen the data-writing totals step called
  out before confirming.

---

## Part 3 — Respect an already-styled sheet

If the sheet already has an established format (fills, fonts, number formats the
user set), the makeover must **match and extend** it, not overwrite it:

- Read the existing style first.
- Only format cells that are currently unformatted, matching the surrounding
  style.
- Never strip a user's deliberate formatting to impose the house default.

A user who already styled their sheet is telling us their house style IS the
standard. "Professionalize" then means "finish what they started consistently,"
not "replace it."

---

## Part 4 — The styling-skills catalog (Q4)

Each outcome below becomes a `kind: 'recipe'` capability in
`shared/capabilities.js` (the currently-unused recipe slot), with `examples[]`
trigger phrases the MiniLM router matches, resolving to the tool/plan noted.
Build these on the existing capability + Apply/Reject + posture machinery — no
new mechanism.

The **Writes data?** column flags the entries that change cell contents (not just
presentation). Those carry `persistenceCaveat('style_recipe')`, are preview-only,
and are never auto-applied — even under Auto posture, which is limited to the
value-safe formatting tools.

| Trigger intent | Example phrases | Resolves to | Writes data? |
| --- | --- | --- | --- |
| Professionalize whole sheet | "make this look professional", "clean up the formatting", "format this like a pro" | the §2 makeover (value-safe formatting pass; totals only if asked/opted-in) | formatting pass no; opt-in totals yes |
| Style the header | "bold the headers", "make a header row", "style the top row" | `style_recipe: header` | no (format-only) |
| Add/refresh a totals row | "add a totals row", "sum at the bottom" | `style_recipe: total_row` | **yes** — label + SUM formulas (caveat, preview-only) |
| Banded table | "format as a table", "make it a nice table", "add zebra striping" | format-only banding via `format_cells`; use `style_recipe: table_polish` only when the user also wants its generated totals | `table_polish` **yes**; format-only banding no |
| Currency column | "format column B as money", "make amounts currency" | `format_cells` numberFormat currency | no |
| Percent column | "show these as percentages" | `format_cells` numberFormat percent | no |
| Red negatives | "make negatives red", "flag negative numbers" | `format_cells` condition negative | no |
| Highlight numeric cells | "highlight cells with numbers", "color numeric cells" | `format_cells` condition is_number | no |
| Fit columns | "fix the column widths", "auto-size the columns" | `auto_fit` / `set_column_width` | no |

Guard the whole-sheet makeover trigger so it out-ranks the narrow single-tool
recipes when the phrasing is general ("make it look nice") but defers to the
specific recipe when the user names one ("bold the headers").

---

## What we deliberately do NOT adopt

For the record (these were evaluated and set aside):
- A JSX/TSX build-time workbook-authoring framework — opposite model to our live
  grid; would be a rewrite, not an adaptation.
- Any server-side Python / LibreOffice / openpyxl rendering runtime — we are
  in-browser TypeScript with QuickJS/SheetJS.
- Native LLM tool-calling as a prerequisite — the catalog works on our existing
  prompt-JSON + capability router. (Native tool-calling remains a separate
  backlog item; it would improve reliability but is not required for this.)

---

## Build order (when we pick this up)

1. This standard (done — this doc).
2. Column-role inference — **already exists, no new helper needed** (verified
   2026-10-15). `inferRole` in `src/ai/sheetProfile.ts` classifies each column
   into a `ColumnRole` (`src/ai/types.ts`): `date | category | amount | quantity
   | label | id | percentage | description | unknown`, combining a header-keyword
   regex with a numeric-ratio fallback. `buildSheetProfile` attaches it per
   column (`ColumnProfile.role`) alongside `dtype` and `detectedPurpose`
   (`budget | invoice | inventory | sales | generic`). The makeover's step 3 maps
   roles → formats:
   - `date` → a date format
   - `percentage` → `percent`
   - `quantity` → `number-int`
   - `amount` → `currency` **on a financial `detectedPurpose`** (budget / invoice
     / inventory / sales); `number` on `generic`, because `amount` currently
     conflates money with plain large numbers (the one gap — resolve it with
     `detectedPurpose`, not a new role).
   - `id` / `category` / `label` / `description` → leave as text.
   No inference work is required before building the makeover; only the
   role→format mapping table above.
3. The `execute_macro` makeover plan (§2), preview-first, with a full-diff
   preview and a single undo entry.
4. The `kind: 'recipe'` catalog entries (§4), with trigger phrases + regression
   tests, pre-empting the narrower recipes appropriately.
5. The already-styled-sheet guard (§3).

Each is independently shippable; (3) is the headline "homemade → pro" feature.
