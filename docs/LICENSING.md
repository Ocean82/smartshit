# Licensing — action required

**Status:** unresolved. This needs an owner decision, not a code change.
**Raised:** 2026-07-24 (see `docs/repo-assessment-2026-07-24.md`, item P2-2).

---

## The conflict

`src/engine/spreadsheet.ts` builds HyperFormula with the open-source license key:

```ts
const HF_OPTIONS = {
  licenseKey: 'gpl-v3',
  precisionRounding: 10,
} as const
```

HyperFormula 3.3.0 is **dual-licensed** by Handsoncode: either a paid proprietary
license, or **GPL-3.0-only**. Per the vendor's own documentation, the license key
*is* the declaration of which one you are using — `gpl-v3` means "I am using this
under GPLv3."

Meanwhile this project declares **MIT** in three places:

| Location | Declares |
|---|---|
| `LICENSE` | `MIT License — Copyright (c) 2026 Ocean82` |
| `package.json` | `"license": "MIT"` |
| `README.md` | MIT badge + "MIT licensed. Forks and contributions welcome." |

**GPLv3 and MIT are not compatible in this direction.** GPLv3 is a strong copyleft:
a work that links GPLv3 code and is then *distributed* must itself be offered under
GPLv3, including source. Shipping a bundle that contains HyperFormula-under-GPLv3
while telling users the whole thing is MIT is a licence misstatement.

This matters more than a typical dependency note because:

- `smartsht.com` distributes the compiled bundle to every visitor — the GPL is
  triggered by conveying the software, and serving the JS bundle to a browser is
  conveying it.
- There is a **paid Pro tier ($7/mo)**, so this is commercial distribution.
- The README actively invites forks under MIT terms, which the project may not
  have the right to grant.

*(Note: GPLv3, unlike AGPLv3, is generally not triggered by pure server-side use.
The exposure here comes from shipping the engine to the client, which this app does.)*

---

## The options

### 1. Buy a HyperFormula proprietary licence — *recommended if the Pro tier continues*

Contact Handsoncode sales, receive a key, and replace the constant:

```ts
const HF_OPTIONS = {
  licenseKey: import.meta.env.VITE_HYPERFORMULA_LICENSE_KEY ?? 'gpl-v3',
  precisionRounding: 10,
} as const
```

Keeps the project MIT and keeps the commercial model clean. Costs money; the key
is validated offline against the build date, so it must be refreshed when
upgrading HyperFormula.

- **Effort:** low (one constant + a build-time env var)
- **Cost:** vendor pricing
- **Outcome:** MIT stays truthful

### 2. Relicense the project to GPL-3.0

Change `LICENSE`, `package.json`, and the README badge to GPLv3, and publish
source for distributed builds.

- **Effort:** low mechanically, **high strategically** — GPLv3 obliges you to
  offer source to every user of the hosted app's bundle, and deters commercial
  adopters and some contributors.
- **Cost:** none
- **Outcome:** compliant, but the "MIT, forks welcome" positioning is gone

### 3. Replace the formula engine

Swap HyperFormula for a permissively-licensed engine (e.g. `formulajs` (MIT) plus
a hand-rolled dependency graph, or `fast-formula-parser` (MIT)).

- **Effort:** **high** — `SpreadsheetEngine` depends on HyperFormula for the
  dependency graph, incremental recalculation, ~400 built-in functions and the
  error model. `getComputedValue`'s `DetailedCellError` handling and the entire
  auditor error-detection path are shaped around it.
- **Cost:** none in licence fees; substantial in engineering time and risk
- **Outcome:** MIT stays truthful, no vendor dependency

---

## Recommendation

**Option 1** while the Pro tier exists. It is the cheapest path that keeps every
public claim accurate, and it is a one-line code change once the key is issued.

**Option 2** is the honest fallback if the project is genuinely
hobby/open-source and no licence budget exists — but it should be a deliberate
choice, because it changes what forkers and commercial users are permitted to do.

**Option 3** only if vendor independence is itself a goal.

Whichever is chosen, this should be settled **before the paid tier grows** — the
cost of unwinding a licence misstatement rises with the number of paying users
and downstream forks.

> Not legal advice. Worth five minutes with a solicitor before the user base grows.

---

## Also worth noting: `xlsx@0.18.5`

Unrelated to the above, but in the same "dependency needs a decision" bucket.

`xlsx` is pinned at `0.18.5`, which carries two **high**-severity advisories:

- Prototype pollution — GHSA-4r6h-8v6p-xvw6 (fixed in `>=0.19.3`)
- ReDoS — GHSA-5pgg-2g8v-p4x9 (fixed in `>=0.20.2`)

**`npm audit fix` cannot resolve these.** SheetJS stopped publishing to npm after
`0.18.5` and moved to their own CDN, so `0.18.5` *is* the latest version the npm
registry knows about. This is the file-import path, parsing untrusted user files.

**Interim mitigation (already applied)** — `src/io/xlsx.ts` sanitises parser
output, stripping `__proto__` / `constructor` / `prototype` keys from the sheet
map before iteration. Covered by `src/io/xlsx.test.ts`, which asserts a crafted
workbook cannot reach `Object.prototype`. This blunts the prototype-pollution
vector but does **not** address the ReDoS.

**Proper fix**, one of:

1. Install from the SheetJS CDN, which publishes patched releases:
   ```bash
   npm remove xlsx
   npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
   ```
   Verify `npm ci` still works in CI — the tarball URL must be reachable from the
   build environment. *(This could not be validated from the review sandbox, whose
   egress is restricted to the npm registry, which is why it was not applied.)*
2. Migrate to `exceljs` (MIT, on npm, actively maintained). Larger change: the
   import/export code uses `XLSX.read`, `XLSX.writeFile`, and
   `XLSX.utils.{aoa_to_sheet, book_new, book_append_sheet, sheet_to_json}`.

Option 1 is the smaller change and keeps the existing API surface.
