# SEO, Paywall, Branding & Production Polish

> Final production-readiness pass: auth token flow, paywall gating, logos/favicons, legal pages, SEO keywords, sitemap, mobile-friendliness, page speed, and HTTPS.

**Status:** Assessment Complete — Action Items Below

---

## 1. Auth Token & Paywall Flow — VERIFIED ✅

The subscription system is correctly wired end-to-end:

| Layer | Implementation | Status |
|-------|---------------|--------|
| Client `useUsage()` | Checks Clerk JWT claims for `plan: 'pro'` or `stripeSubscriptionId`. Falls back to server `/api/usage` check. BYOK users bypass entirely. | ✅ Correct |
| Client `UpgradePrompt` | Shows remaining count when `remaining > 0`, shows upgrade card at 0. Triggers `/api/checkout` for Stripe. | ✅ Correct |
| Client `ChatPanel` | `canAsk` gates the send button. `recordUsage()` fires on each AI query. | ✅ Correct |
| Server `checkUsage()` | Pro users (`isPro: true`) return `unlimited()`. Free users checked against Postgres `ai_usage_daily` table. | ✅ Correct |
| Server `requireAuth` | All `/api/chat` and `/api/workbooks` routes require valid Clerk JWT. | ✅ Correct |
| Server Stripe webhook | `verifyWebhookSignature` with HMAC-SHA256, timing-safe compare, 5-min replay window. Updates Clerk metadata on subscription events. | ✅ Correct |
| Daily reset | Counter uses `CURRENT_DATE` in Postgres + client uses `getToday()` comparison. | ✅ Correct |

**No changes needed.** The paywall properly distinguishes subscribers from free users at both client and server layers.

---

## 2. Logos & Favicons — ISSUES FOUND

| Asset | Location | Issue | Fix |
|-------|----------|-------|-----|
| Favicon SVG | `public/favicon.svg` | ✅ Exists, referenced in `index.html` | — |
| PWA icons | `public/pwa-icon-192.png`, `pwa-icon-512.png` | ✅ Exist, referenced in `manifest.json` | — |
| Apple touch icon | `public/apple-touch-icon.png` | ✅ Exists | — |
| Landing logo | `landing/smart-logo.png` | ⚠️ 2.5 MB PNG — massively oversized for web | Compress to WebP or optimized PNG (<100KB) |
| Landing favicon | `landing/smart-favicon.png` | ⚠️ 1.3 MB PNG — should be <50KB | Compress |
| OG image | Not present | ❌ No `og:image` meta tag, no social preview image | Create 1200×630 OG image |
| Twitter image | Not present | ❌ No `twitter:image` tag | Same as OG image |
| Logo in Terms/Privacy | Not present | ⚠️ Legal pages have no logo/brand mark | Add logo to nav on legal pages |
| Structured Data logo | `"logo": "https://smartsht.com/smart-logo.png"` | ✅ Correct path | Ensure it's <5MB for Google |

### Action Items:
- [ ] Compress `landing/smart-logo.png` to <100KB (use WebP or optimized PNG)
- [ ] Compress `landing/smart-favicon.png` to <50KB
- [ ] Create a 1200×630 OG social preview image and add `og:image` + `twitter:image` meta tags
- [ ] Add brand logo/nav to terms.html and privacy.html headers

---

## 3. Sitemap — NEEDS EXPANSION

Current sitemap only has 3 URLs. For search visibility, it should include the app page and any discoverable routes.

### Improved sitemap:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://smartsht.com/</loc>
    <lastmod>2026-07-25</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://smartsht.com/app</loc>
    <lastmod>2026-07-25</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://smartsht.com/terms</loc>
    <lastmod>2026-07-23</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://smartsht.com/privacy</loc>
    <lastmod>2026-07-23</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>
```

---

## 4. SEO Keywords — NEEDS MORE COVERAGE

Current meta keywords: `"spreadsheet, ai, budget, expenses, no formulas, easy spreadsheet"`

These are too few and too generic. For search discoverability, the landing page needs richer keyword signals across the page content and meta tags.

### Recommended keyword clusters:

**Primary (high-intent, lower competition):**
- AI spreadsheet
- AI budget planner
- spreadsheet without formulas
- talk to spreadsheet
- AI expense tracker
- natural language spreadsheet
- smart spreadsheet assistant

**Secondary (broader reach):**
- free budget template
- monthly budget calculator
- personal finance spreadsheet
- invoice generator free
- expense tracking app
- Excel alternative
- Google Sheets alternative
- spreadsheet for beginners
- AI formula helper
- spreadsheet auditor
- formula error checker

**Long-tail (blog/content targets):**
- how to budget without spreadsheet formulas
- AI that builds spreadsheets
- free AI budget tool
- spreadsheet formula error finder
- talk to your data
- no-code spreadsheet
- plain English spreadsheet commands

---

## 5. Mobile-Friendliness — VERIFIED ✅

| Check | Status |
|-------|--------|
| `viewport` meta tag | ✅ `width=device-width, initial-scale=1.0, viewport-fit=cover` |
| Responsive CSS (landing) | ✅ `@media (max-width: 768px)` breakpoint with stacked layouts |
| Touch targets (app) | ✅ `@media (pointer: coarse)` increases tap targets |
| iOS zoom prevention | ✅ `input { font-size: 16px !important }` on mobile |
| Safe area insets | ✅ `env(safe-area-inset-*)` for notched phones |
| PWA manifest | ✅ `display: standalone`, icons, orientation |
| Mobile toolbar | ✅ `MobileToolbar.tsx` + `MobileMenu.tsx` exist |

**No changes needed.** Mobile is well-handled.

---

## 6. Page Speed — ASSESSMENT

| Factor | Status | Notes |
|--------|--------|-------|
| Landing page | ✅ Static HTML, no JS framework, system fonts preconnected | Fast |
| App initial load | ⚠️ 897KB gzip single-file bundle (with QuickJS WASM inlined) | Acceptable for an app, but the singlefile plugin is the culprit. WASM should lazy-load. |
| Font loading | ✅ `preconnect` + `display=swap` for Google Fonts | Good practice |
| Images on landing | ❌ 2.5MB + 1.3MB PNGs never displayed (referenced from nav only) | Compress immediately |
| Code splitting | ✅ 12 lazy-loaded dialogs/panels | Good |
| CSS | ✅ Tailwind + minimal custom CSS, no render-blocking sheets | Good |

### Action Items:
- [ ] Compress the oversized PNG assets (already in logos section above)
- [ ] Consider removing `vite-plugin-singlefile` for production builds to allow WASM lazy-loading
- [ ] Add `loading="lazy"` to any images below the fold

---

## 7. Security (HTTPS) — VERIFIED ✅

| Check | Status |
|-------|--------|
| Canonical URL | ✅ `https://smartsht.com` |
| HSTS | Should be set via nginx (`Strict-Transport-Security`) |
| Mixed content | No `http://` references found in codebase |
| CSP | Not present — would be a good addition for XSS prevention |
| Sentry `sendDefaultPii: false` | ✅ Configured |

### Action Items:
- [ ] Verify `Strict-Transport-Security` header in nginx config
- [ ] Consider adding a Content-Security-Policy meta tag

---

## 8. Legal Pages (Terms/Privacy) — MOSTLY GOOD

| Check | Status |
|-------|--------|
| Terms of Service | ✅ Exists at `/terms` with proper content |
| Privacy Policy | ✅ Exists at `/privacy` |
| Canonical URLs | ✅ Set on both pages |
| `robots: index, follow` | ✅ Present |
| Logo/brand in header | ❌ Missing — just a text back-link |
| Structured data on legal pages | Not needed (Google doesn't index these prominently) |

---

## 9. Summary of Required Changes

### Critical (do now):
1. Expand meta keywords on landing page
2. Add OG/Twitter image meta tags
3. Update sitemap to include `/app`
4. Compress oversized logo/favicon PNGs

### Important (this week):
5. Add brand nav header to terms.html and privacy.html
6. Add more keyword-rich content to landing page (feature descriptions, comparison text)
7. Verify HSTS header in nginx

### Nice-to-have:
8. Consider CSP header
9. Consider removing singlefile plugin for better WASM lazy-loading
10. Add a blog/content section for long-tail SEO (future)
