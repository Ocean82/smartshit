# Design

Visual system documentation for smartsh!t. Generated from existing codebase.

## Color Palette

The app uses a custom OKLCH-based token system defined in `src/index.css` as CSS custom properties, with a brand hue of **250** (deep navy-blue) derived from the logo gradient (`#1e3a8a` → `#60a5fa`). Tailwind utility classes are layered on top for layout and common patterns.

### Brand System (CSS Custom Properties)

| Token | Role | Value |
|-------|------|-------|
| `--brand-hue` | Anchor hue for all tinting | `250` |
| `--accent-600` | Primary CTA, send button, user bubbles | `oklch(0.50 0.20 250)` |
| `--accent-500` | Step indicators, interactive highlights | `oklch(0.55 0.19 250)` |
| `--accent-100` | Light accent backgrounds | `oklch(0.93 0.04 250)` |
| `--neutral-950` | Title bar, chrome surfaces | `oklch(0.12 0.035 250)` |
| `--neutral-900` | Badge backgrounds on dark chrome | `oklch(0.18 0.03 250)` |
| `--neutral-100` | Panel backgrounds, scrollbar track | `oklch(0.965 0.007 250)` |
| `--neutral-50` | Body background | `oklch(0.985 0.005 250)` |
| `--surface-body` | Page-level background | `var(--neutral-50)` |
| `--surface-chrome` | Title bar background | `var(--neutral-950)` |
| `--ink-primary` | Body text | `var(--neutral-900)` |
| `--ink-secondary` | Labels, descriptions | `var(--neutral-600)` |
| `--ink-on-dark` | Text on chrome surfaces | `oklch(0.92 0.01 250)` |

### Semantic Colors

| Role | Value | Usage |
|------|-------|-------|
| Success | `oklch(0.64 0.17 155)` | Applied actions, online status |
| Warning | `oklch(0.78 0.14 70)` | Import warnings, loading states |
| Error | `oklch(0.60 0.2 25)` | Rejected actions, offline status |
| Info | `oklch(0.62 0.15 240)` | Processing badges |

### Design Principle

All neutrals carry a faint blue tint (chroma 0.005–0.035 at hue 250) creating subconscious cohesion with the brand accent. Pure grays are avoided. The tint is subtle enough to not read as "blue" consciously, but eliminates the lifeless quality of zero-chroma neutrals.

## Typography

### Font Stack

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
```

System font stack throughout. No custom display or body fonts loaded.

### Scale

| Context | Size | Weight | Notes |
|---------|------|--------|-------|
| Title bar brand | `text-sm` (14px) | `font-semibold` | White on dark, `tracking-tight` |
| Panel headers | `text-sm` (14px) | `font-bold` | e.g., chat header |
| Body text | `text-sm` (14px) | normal | Chat messages, descriptions |
| Small labels | `text-xs` (12px) | `font-medium` | Skill pills, action labels |
| Micro text | `text-[10px]` / `text-[11px]` | normal | Status bar, timestamps, badges |
| Buttons (title bar) | `text-[11px]` | normal | Compact utility buttons |

### Line Height

`leading-relaxed` (1.625) on chat messages. Default Tailwind elsewhere.

## Spacing

No formal spacing scale beyond Tailwind defaults. Common patterns:

- `px-3 py-3` / `px-4 py-3` — panel padding
- `gap-2` / `gap-3` — flex gaps between elements
- `space-y-3` — vertical rhythm in message lists
- `rounded-2xl` / `rounded-xl` / `rounded-lg` — border radius scale (large for bubbles/dialogs, medium for buttons, small for badges)

## Components

### Layout Shell

```
┌─────────────────────────────────────────────────┐
│ TitleBar (h-10, bg-slate-900)                   │
├─────────────────────────────────────────────────┤
│ MenuBar (desktop only)                          │
│ Toolbar (desktop only)                          │
│ FormulaBar                                      │
├────────┬────────────────────────┬───────┬───────┤
│ File   │ SpreadsheetGrid        │ Dock  │ Panel │
│ Explr  │ + ChartOverlay         │ Panel │ Rail  │
│        │                        │       │       │
│        ├────────────────────────┤       │       │
│        │ SheetTabs              │       │       │
├────────┴────────────────────────┴───────┴───────┤
│ StatusBar (h-6, desktop only)                   │
└─────────────────────────────────────────────────┘
```

### Chat Bubbles

- **User**: `bg-blue-600 text-white rounded-2xl rounded-tr-sm`
- **Assistant**: `bg-gray-100 text-gray-800 rounded-2xl rounded-tl-sm`
- Bot avatar: 28px circle, gradient `from-slate-700 to-blue-600`
- User avatar: 28px circle, `bg-gray-200`

### Action Cards

- Border-2 with semantic color: `border-amber-200 bg-amber-50` (pending), `border-green-200 bg-green-50` (applied), `border-red-200 bg-red-50` (rejected), `border-blue-200 bg-blue-50` (preview)
- `rounded-xl p-3`

### Buttons

- **Primary**: `bg-slate-800 text-white rounded-xl` → `hover:bg-slate-700`
- **Secondary**: `border border-gray-200 bg-white text-slate-500 rounded-xl` → `hover:bg-slate-100`
- **Destructive confirm**: `bg-red-500/80 text-white` → `hover:bg-red-500`
- **Skill pills**: `bg-slate-50 border border-slate-200 rounded-lg` → `hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700`
- **Suggestion chips**: `rounded-full border border-blue-200 bg-blue-50 text-blue-800`

### Dialogs / Overlays

- Welcome overlay: `bg-white rounded-3xl shadow-2xl w-[520px]`
- Backdrop: `bg-black/50 backdrop-blur-sm`
- Step indicators: pill dots (`h-1.5 rounded-full`, active `w-6 bg-blue-600`, inactive `w-1.5 bg-gray-200`)

## Iconography

**Lucide React** — consistent 14-18px stroke icons throughout. Key icons:
- `Sparkles` (AI/magic), `Bot` (assistant), `Send` (submit)
- `Check` / `XCircle` (approve/reject), `Loader2` (loading spinner)
- `Pin` / `PinOff`, `ThumbsUp` / `ThumbsDown` (feedback)
- `Paperclip` (attach), `Download` (export)

## Motion & Animation

- `transition-colors` on most interactive elements (implicit Tailwind 150ms)
- `animate-spin` on Loader2 during AI processing
- `animate-pulse` for loading states
- `animate-slide-up` (custom): `translateY(100%) → translateY(0)` over 250ms ease-out (mobile bottom sheets)
- `animate-marching-ants`: 400ms linear infinite (copy/cut cell feedback)
- `backdrop-blur-sm` on modal overlays
- `active:scale-95` on mobile buttons (touch feedback)

## Responsive Strategy

| Breakpoint | Behavior |
|------------|----------|
| < 768px (mobile) | Hide MenuBar, Toolbar, StatusBar, PanelRail. Show MobileToolbar, MobileMenu, chat FAB. Force 16px inputs (prevent iOS zoom). 4px scrollbars. |
| ≥ 768px (desktop) | Full app shell with all panels, resize handles, keyboard shortcuts |

### Mobile-specific

- Safe area insets (`env(safe-area-inset-*)`)
- Touch-friendly tap highlights
- `overscroll-behavior: contain` on grid
- `-webkit-overflow-scrolling: touch`
- Chat panel as fixed full-screen overlay

## Framework & Build

- **React 19** + **Vite 7** (SPA, `index.html` entry)
- **Tailwind CSS 4** via `@tailwindcss/vite` plugin
- **Zustand** for state
- **Lucide React** for icons
- No component library (custom components throughout)
- `vite-plugin-singlefile` for single-file production builds
