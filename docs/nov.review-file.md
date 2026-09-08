 Repo Review — 2026-09-08

Investigation of `Ocean82/smartshit` at `0cd7527`. Every finding below was
reproduced locally, not inferred from reading alone.

## Baseline: what actually passes

I ran the full CI pipeline end to end before looking for problems, so the
findings are scoped against a known-green build:

| Gate | Result |
|------|--------|
| `npm run lint:ci` (`--max-warnings=0`) | clean |
| `npm run typecheck` | clean |
| `npm run test` (frontend) | 107 files, **1513 passed** |
| `npm run test --prefix server` | 25 files, **326 passed** |
| `npm run test:realengine` | 8 passed (real WASM tier) |
| `npm run build` + `build --prefix server` | succeed |
| `node scripts/v1-release-checklist.mjs` | all 8 gates PASS |

**This is a genuinely well-maintained codebase.** Zero `TODO`/`FIXME`/`HACK`
markers in non-test source, zero stray `console.log` in `src/`, comments that
explain *why* rather than *what*, and rate limiting that correctly uses
`ipKeyGenerator` for IPv6 /56 normalisation (a subtlety most projects get
wrong). The findings below are refinements, not rescues.

Findings are ordered by real-world impact.

---

## 1. `.well-known/security.txt` is unreachable in production — nginx denies it

**Severity: high (silent 403 on a file you deliberately ship)**

`landing/smartsht.nginx.conf:151` ends with a blanket dotfile block:

```nginx
location ~ /\. { deny all; }
```

The regex `/\.` matches `/.well-known/security.txt`. You ship that file in
**two** places (`public/.well-known/security.txt`, `landing/.well-known/security.txt`),
Vite emits it into `dist/.well-known/` (verified in the build output), and
`deploy.sh` rsyncs it — and then nginx returns 403 for every request.

The file itself advertises `Canonical: https://smartsht.com/.well-known/security.txt`,
so a researcher following the canonical URL hits a 403. This also pre-emptively
breaks ACME `http-01` renewal and any future Apple/Google association files.

**Fix** — add an exception *before* the deny rule:

```nginx
# .well-known must stay reachable (security.txt, ACME challenges,
# app-association files). It is matched by the dotfile deny below,
# so this more-specific prefix must come first.
location ^~ /.well-known/ {
    allow all;
    default_type text/plain;
    charset utf-8;
}

location ~ /\. { deny all; }
```

`^~` beats a regex `location` in nginx's matching order, so ordering in the file
is not strictly required — but keeping it above the deny documents the intent.

---

## 2. `GROQ_MODEL` default disagrees with every doc and env file

**Severity: high (wrong model silently used when the var is unset)**

Three-way drift on the single most cost- and quality-relevant setting:

| Source | Value |
|--------|-------|
| `server/src/config.ts:54` (**the actual default**) | `openai/gpt-oss-120b` |
| `README.md:81` and `:168` | `qwen/qwen3.6-27b` |
| `.env.example:46`, `server/.env.example:27`, `server/.env.production:15` | `qwen/qwen3.6-27b` |

Anyone who deploys without explicitly setting `GROQ_MODEL` — which the README
tells them is unnecessary, since it documents the default as the Qwen model —
gets a **different, larger, more expensive model** than documented. The failure
is silent: `openai/gpt-oss-120b` is in `KNOWN_GROQ_MODELS`, so not even the
config warning fires.

**Fix** — pick one and make the code authoritative. Given every env file and the
README agree on Qwen, change the code:

```ts
// server/src/config.ts:54
const groqModel = process.env.GROQ_MODEL ?? 'qwen/qwen3.6-27b'
```

Then add a regression test so this cannot drift again — `server/src/config.test.ts`
already has the pattern:

```ts
it('defaults GROQ_MODEL to the value documented in .env.example', async () => {
  delete process.env.GROQ_MODEL
  expect((await loadConfig()).groqModel).toBe('qwen/qwen3.6-27b')
})
```

If you *intend* `gpt-oss-120b`, update README + all three env files instead. The
point is that exactly one of these four sources should be authoritative.

---

## 3. `.gitignore`'s `*.sh` rule will silently swallow future shell scripts

**Severity: high (data loss / "why is my script not on the server")**

`.gitignore:56` ignores `*.sh` globally, with two hand-maintained exceptions:

```gitignore
*.sh
!scripts/deploy.sh
!scripts/deploy-remote.sh
```

Verified with `git check-ignore`: any new script — `scripts/foo.sh`,
`server/scripts/bar.sh` — is ignored. Since `deploy.sh` runs `git reset --hard
origin/main` on the server, a new helper script that never got committed simply
does not exist in production, and `git status` stays clean so nothing warns you.
This is the classic way a deploy breaks at 2am.

**Fix** — invert to ignore only the scratch pattern you actually meant, rather
than everything:

```gitignore
# Dev debug/test scratch scripts (never ship). Scoped patterns instead of a
# blanket *.sh, which silently swallowed any new committed shell script.
/debug-*.sh
/test-*.sh
/tmp-*.sh
```

Committed scripts under `scripts/` then need no exception list at all, and the
two `!` lines can be deleted.

---

## 4. `public/app/` is a duplicate icon set that ships dead bytes

**Severity: medium (confusing + wasted deploy payload)**

`public/app/` contains 8 tracked files (`manifest.json` plus 7 icons) that are
byte-identical in purpose to the ones at `public/` root. Because Vite's `base`
is `/app/` and it copies `public/` wholesale, the build produces:

- `dist/manifest.json` + `dist/favicon.svg` + … (from `public/`)
- `dist/app/manifest.json` + `dist/app/favicon.svg` + … (from `public/app/`)

Verified in the build output. The served path is `/app/` → `alias
/var/www/smartsht/app/`, so the *real* runtime files are `dist/*` (served at
`/app/*`). `dist/app/*` lands at `/app/app/*` — **nothing references it**.
`index.html` uses relative hrefs (`manifest.json`, `favicon.svg`) which resolve
against `/app/`, i.e. to the root copies.

The `public/app/` copies were almost certainly created to fix a 404 before
`base: "/app/"` was set correctly, and were never cleaned up.

**Fix**:

```bash
git rm -r public/app
```

Then confirm `/app/manifest.json` and `/app/favicon.svg` still resolve after a
build — they will, from `dist/manifest.json` and `dist/favicon.svg`.

Worth also noting: both manifests declare `"id": "/"` while `start_url` and
`scope` are `/app/`. An `id` outside scope is legal but makes the install
identity the landing page. Setting `"id": "/app/"` is more correct, though
changing it re-registers the PWA for existing installs — do it deliberately.

---

## 5. ESLint's `**/*.mjs` config block is dead — no script is ever linted

**Severity: medium (false sense of coverage)**

`eslint.config.js:136` defines globals and rules for `**/*.mjs`, but line 36
ignores `scripts/**` outright. Verified:

```
$ npx eslint scripts/v1-release-checklist.mjs
warning  File ignored because of a matching ignore pattern
$ npx eslint server/scripts/setup-model.mjs
(no output — not matched by any config)
```

So all five `.mjs` files — including `precompute-embeddings.mjs`, which
generates the intent vectors the AI classifier depends on, and
`copy-deploy-models.mjs`, which runs during deploy — are completely unlinted.
The `**/*.mjs` block gives the impression they are covered. (They do at least
all pass `node --check`; I verified that separately.)

**Fix** — drop `scripts/**` from `ignores` and let the existing `.mjs` block do
its job. It needs a couple more globals for the scripts to lint clean:

```js
// eslint.config.js — remove 'scripts/**' from the top-level ignores array,
// then extend the existing mjs block:
{
  files: ['**/*.mjs'],
  languageOptions: {
    globals: {
      process: 'readonly', console: 'readonly', Buffer: 'readonly',
      URL: 'readonly', fetch: 'readonly', setTimeout: 'readonly',
      __dirname: 'readonly',
      // added:
      TextEncoder: 'readonly', TextDecoder: 'readonly',
      performance: 'readonly', structuredClone: 'readonly',
    },
  },
  rules: { 'no-console': 'off' },
},
```

Run `npx eslint scripts server/scripts --no-ignore` once first to see what
surfaces, and fix or downgrade from there.

---

## 6. `shared/*.js` files are neither typechecked nor linted

**Severity: medium (unguarded code on a correctness-critical path)**

`shared/intentPhrases.js` and `shared/capabilities.js` (195 lines) are
hand-written ESM with sidecar `.d.ts` files. They exist in plain JS for a good,
well-documented reason — the Node precompute script and the bundled client must
import the *exact same* data so vectors cannot drift.

But the root `tsconfig.json` sets no `allowJs`/`checkJs`, so `tsc --noEmit`
skips them entirely, and ESLint's `files: ['src/**/*.{ts,tsx}', 'shared/**/*.ts']`
only matches `.ts`. Verified: `npx eslint shared/intentPhrases.js` produces no
output.

The `.d.ts` therefore *asserts* a shape nobody verifies. If `INTENT_PHRASES`
loses a key that `IntentType` declares, nothing catches it — the client rejects
a hash-mismatched binary at runtime, which is a much later and vaguer failure.

**Fix** — cheapest option, keep the `.js` but make TS check it against its own `.d.ts`:

```jsonc
// tsconfig.json
"allowJs": true,
"checkJs": true,
```

and widen the ESLint glob to `'shared/**/*.{ts,js}'`. If `checkJs` proves noisy,
the targeted alternative is a tiny type-level test:

```ts
// shared/intentPhrases.test.ts
import { INTENT_PHRASES } from './intentPhrases.js'
import type { IntentType } from './intentTypes'

it('covers every IntentType', () => {
  const required: IntentType[] = [/* … */]
  for (const k of required) expect(INTENT_PHRASES[k]?.length).toBeGreaterThan(0)
})
```

---

## 7. `deploy`/`deploy:server`/`deploy:frontend` are PowerShell-only

**Severity: medium (unrunnable for most contributors)**

```json
"deploy": "powershell -ExecutionPolicy Bypass -File scripts/deploy-remote.ps1",
```

All three npm deploy scripts hard-invoke `powershell`, so they fail on macOS and
Linux — despite `scripts/deploy-remote.sh` existing and being the obvious POSIX
equivalent. CI runs `ubuntu-latest`, and the README's Quick Start makes no
mention of Windows being required.

**Fix** — dispatch on platform so one command works everywhere:

```json
"deploy":          "node scripts/deploy-dispatch.mjs",
"deploy:server":   "node scripts/deploy-dispatch.mjs --server",
"deploy:frontend": "node scripts/deploy-dispatch.mjs --frontend"
```

```js
// scripts/deploy-dispatch.mjs
import { spawnSync } from 'node:child_process'
const args = process.argv.slice(2)
const win = process.platform === 'win32'
const { status } = win
  ? spawnSync('powershell', ['-ExecutionPolicy', 'Bypass', '-File',
      'scripts/deploy-remote.ps1', ...args.map(a => a.replace(/^--/, '-'))],
      { stdio: 'inherit' })
  : spawnSync('bash', ['scripts/deploy-remote.sh', ...args], { stdio: 'inherit' })
process.exit(status ?? 1)
```

Note the flag translation: the `.ps1` takes `-Server`/`-Frontend`, the `.sh`
takes `--server`/`--frontend`. Verify the `.sh` accepts those exact flags before
wiring this up.

---

## 8. `server/Modelfile.local` hardcodes a personal machine path

**Severity: medium (unusable by anyone else; silently skipped)**

```
server/Modelfile.local:3:  FROM D:/spreadsheet/smartsht/models/Spreadsheet-RL-4B.Q4_K_M.gguf
server/Modelfile.spreadsheet-rl:4:  FROM /home/ubuntu/Spreadsheet-RL-4B.Q4_K_M.gguf
```

`setup-model.mjs` selects `Modelfile.local` on Windows and
`Modelfile.spreadsheet-rl` as the Linux fallback. Both `FROM` paths are
absolute and machine-specific — `D:/spreadsheet/...` is your dev box,
`/home/ubuntu/...` is the deploy box. A contributor on either platform gets a
model build failure pointing at a path that does not exist on their machine.

Meanwhile `server/Modelfile` (the dev one) correctly uses a **relative** path:
`FROM ../models/qwen2.5-coder-1.5b-q8_0.gguf`.

**Fix** — make the other two relative too, matching the repo's own `models/`
convention that `.gitignore` and `models/README.md` already establish:

```
FROM ../models/Spreadsheet-RL-4B.Q4_K_M.gguf
```

and have `setup-model.mjs` resolve/verify the GGUF before shelling out to
`ollama create`, with a clear message naming the expected path. The script
already reads `SMARTSHT_GGUF_SRC` elsewhere in the codebase
(`copy-deploy-models.mjs:253`) — reusing that override here would be consistent.

---

## 9. `RELEASE_AUDIT_FINDINGS.md` is stale and contradicts the code

**Severity: low-medium (actively misleading operator doc)**

Dated July 25 2026, and now wrong in ways that matter:

- **Wrong env var name.** Line 101 says to set `STRIPE_PRO_PRICE_ID`. That
  variable does not exist anywhere in the codebase — the real names are
  `STRIPE_PRICE_ID` / `STRIPE_PRICE_ID_ANNUAL`. Someone following this doc gets
  a checkout that throws `STRIPE_PRICE_ID not configured`.
- **Wrong env var name (again).** Line 91 says `AWS_REGION`; the code reads
  `S3_REGION` (`config.ts:201`). `AWS_REGION` appears in no source file.
- **Wildly stale numbers.** Claims "38 test files, 369 tests" and "6 server test
  files, 34 tests". Actual: 107/1513 and 25/326.
- **Describes a build that no longer exists.** Says "Vite singlefile production
  bundle" — `vite.config.ts` now carries a long comment explaining why
  `vite-plugin-singlefile` was deliberately *removed*.
- **References a stale branch**, `arena/019f98e3-smartshit`.

**Fix** — this is a point-in-time audit report, so don't try to keep it live.
Move it to `docs/ARCHIVE.md`'s orbit and mark it historical:

```bash
git mv RELEASE_AUDIT_FINDINGS.md docs/archive/release-audit-2026-07-25.md
```

with a header banner:

> **Historical.** Point-in-time audit from 2026-07-25. Env var names and test
> counts are stale — see `docs/ENV.md` and the README for current values.

At minimum, fix the two wrong variable names even if you keep the file where it
is; those are the parts someone will actually copy-paste.

---

## 10. `.env.production` files ship real production identifiers

**Severity: low (not secrets — but worth a deliberate decision)**

Both committed `.env.production` files are template-shaped (`sk_live_YOUR_...`
placeholders), and `server/.env.production:2` even says "NEVER commit this file
with real secrets" — that discipline held. No actual secret leaked.

However, they do commit **real live infrastructure identifiers**:

- `VITE_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsuc21hcnRzaHQuY29tJA` (public by
  design — fine, and correctly annotated as such)
- `STRIPE_PRICE_ID=price_1Tshf9P38C54URjEpxmSrir2` and the annual ID
- `S3_BUCKET=burntbeatz2-storage`

`.env.example` goes further, disclosing test-mode price IDs, Stripe **product**
IDs, and live/test **webhook endpoint IDs** (`we_1Tshf...`).

None of these are exploitable alone. But bucket names and webhook IDs are useful
reconnaissance, and price IDs are the kind of thing that changes and then rots.

**Fix** — keep the placeholders, drop the real identifiers to comments:

```bash
# STRIPE_PRICE_ID — get from https://dashboard.stripe.com/prices
STRIPE_PRICE_ID=price_...
# S3_BUCKET — your bucket name
S3_BUCKET=your-bucket-name
```

And delete the trailing "Test-mode equivalents / Webhooks" block from
`.env.example` — that belongs in a private runbook, not a public template.

---

## 11. Main bundle is 1.70 MB (506 KB gzipped)

**Severity: low (works fine; a known trade-off)**

```
dist/assets/index-BVkm4MBb.js   1,697.93 kB │ gzip: 505.80 kB
(!) Some chunks are larger than 500 kB after minification.
```

Lazy-loading is already done well — dialogs, `TemplateGallery`,
`VersionHistoryPanel`, `chatService`, `nlpEngine`, ONNX all split out correctly.
The 1.7 MB is the unavoidable core: React 19 + xlsx + zustand + the formula
engine.

The `xlsx` library is the biggest single lever — it's needed only on
import/export, not at first paint.

**Fix** (optional, only if first-paint latency is a real complaint) — split
vendor chunks so React and xlsx cache independently across deploys:

```ts
// vite.config.ts → build
rollupOptions: {
  output: {
    manualChunks: {
      react: ['react', 'react-dom'],
      xlsx: ['xlsx'],
    },
  },
},
chunkSizeWarningLimit: 700,
```

Better still, confirm `xlsx` is only reached through a dynamic `import()` in
`src/io/xlsx.ts`; if any eagerly-loaded module imports it statically, that alone
pulls ~400 KB into the entry chunk.

---

## 12. Smaller observations

- **`landing/` and `public/` duplicate six identical files** — `favicon.svg`,
  `logo.png`, `og-image.png`, `robots.txt`, `sitemap.xml`, `llms.txt` are
  byte-identical (verified with `cmp`). Two copies drift eventually. Consider a
  `brand/` source directory with a copy step, or generate `landing/` assets at
  deploy time from `public/`.
- **`sitemap.xml` references `screenshot.png`, which only exists in `landing/`** —
  the `public/` copy of the sitemap points at `https://smartsht.com/screenshot.png`.
  That resolves in production (served from the landing webroot) but the two
  copies of the sitemap being identical while their sibling assets are not is
  the exact drift risk above.
- **`sitemap.xml` `lastmod` dates are stale** — `2026-08-16` for the homepage.
  Worth generating at deploy time.
- **`deploy.sh` log message is slightly misleading** — line 152 gates on
  `server/models/minilm/model.onnx` but the log says it's ensuring
  `public/models/minilm/intent-vectors.bin`. The gate is correct (the script
  *reads* the server model to *write* the public vectors), but the message
  reads like the gate and target are the same path. A one-line comment would
  save a future reader the trip through `precompute-embeddings.mjs`.
- **`npm ci --prefix server` fails on a clean machine without
  `ONNXRUNTIME_NODE_INSTALL=skip`** — reproduced: `onnxruntime-node`'s postinstall
  fetches CUDA binaries from `api.nuget.org` and dies with `ECONNRESET`. CI
  already sets this and documents it thoroughly, but the README's Quick Start
  (`npm install --prefix server`) does not mention it. Add a note, or commit an
  `.npmrc` in `server/` if the CPU runtime is always sufficient locally.

---

## Suggested order of work

1. **#1 nginx `.well-known`** — one-line config fix, currently serving 403s.
2. **#2 `GROQ_MODEL` default** — one-line fix + one test; wrong model in prod.
3. **#3 `.gitignore` `*.sh`** — prevents a future lost-script incident.
4. **#9 stale audit doc** — fix the two wrong env var names at minimum.
5. **#4 delete `public/app/`** and **#5/#6 lint+typecheck coverage** — cleanup
   that stops the next drift.
6. Everything else as capacity allows.