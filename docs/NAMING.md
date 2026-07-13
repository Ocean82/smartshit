# Naming Canon

Use these spellings consistently. Wrong Clerk instance or wrong technical IDs break production auth and cloud APIs.

| Layer | Canonical value | Notes |
|-------|-----------------|-------|
| **Brand / UI copy** | `smartsh!t` | Titles, chat persona, WelcomeOverlay, App chrome |
| **Public domain** | `smartsht.com` | Never put `!` in hostnames, emails, APP_URL |
| **Clerk Frontend API** | `https://clerk.smartsht.com` | SmartSht instance only; JWKS: `/.well-known/jwks.json` |
| **Clerk Backend API** | `https://api.clerk.com` | Via `@clerk/backend` / `@clerk/express` with SmartSht `CLERK_SECRET_KEY` |
| **Technical IDs (no `!`)** | `smartsht` | DB schema, S3 prefix, localStorage keys (new), event names, npm-safe short ids |
| **Ollama model name** | `smartshit` | **Keep** — already registered on EC2 via `ollama create smartshit`; env `SMARTSHIT_MODEL` |
| **GitHub repo** | `Ocean82/smartshit` | Out of scope to rename; document as legacy repo slug |
| **Forbidden in prod** | `pk_test_*`, `amused-mollusk`, BurntBeats Clerk instance | Production must use SmartSht `pk_live_*` |

## Spelling rules

- User-facing: always `smartsh!t` (with bang) except where URLs must stay `smartsht.com`
- Code identifiers / env / paths: prefer `smartsht` over `smartshit` except Ollama model + existing `SMARTSHIT_*` env names
- Do not invent a fourth spelling (`SmartSheet`, `smart-shit`, etc.) in new code
