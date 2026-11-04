# ASCEND — Final Certification: Design System Specification (as-built)

Round 1a. This document describes the design system **as it actually exists in source** at master `62e25543` — extracted from `src/app/globals.css`, `tailwind.config.js`, `src/components/ui/*`, `src/app/layout.tsx`, and `src/lib/accent-themes.ts`. It is a specification of record, not a redesign proposal. Where two definitions compete, both are named and the canonical one is marked **by measured usage** (counts from `design-consistency-audit.md`).

## 1. Where the system lives (three layers)

| Layer | File(s) | Holds |
|---|---|---|
| CSS tokens + global component classes | `src/app/globals.css` | Both color-token schemes (below), `.btn-*`, `.card`, `.modal-*`, `.segmented-*`, type classes, focus rules, reduced-motion, dark depth polish |
| Tailwind theme extension | `tailwind.config.js` | Color mappings onto CSS vars **plus** hardcoded brand/chart palettes, semantic font-size scale, `shadow-xs`, keyframe animations |
| Component kit | `src/components/ui/*` (15 components) | Button, Card, Sheet, SegmentedControl, Toast, Badge, EmptyState, etc. — adoption is partial (see consistency audit) |
| Runtime theming | `src/lib/accent-themes.ts`, `src/app/page.tsx` | 7 accent variants; the active variant's values are written over the CSS vars at runtime (`accentVariantToCssVars` → `applyAccentVars`) |

Default theme is **dark** (`<html class="dark" data-theme="dark">` in `layout.tsx`, before-paint bootstrap in `public/theme-init.js`); light is the Chalk palette. `darkMode: 'class'`.

## 2. Brand identity (verified from source)

| Brand color | Value | Where it is law |
|---|---|---|
| Vermilion (primary accent) | `#E44427` | `--accent: 228 68 39` (light), `--brand-vermilion`, Tailwind `brand.vermilion` / `vermilion.DEFAULT`, `accent-themes.ts` default theme |
| Vermilion, dark-theme brightened | `#EB4E30` | `--accent: 235 78 48` in the dark block **only** (the hex-layer `--accent-hex` does *not* brighten — see §3.3) |
| Vermilion dim | `#C7351B` | `--accent-dim` (both themes); also the light-theme accent-as-text color |
| Graphite | `#171916` | `--text-primary` (light), `--brand-graphite`, dark `--bg` (hex layer) |
| Chalk | `#F3F0E7` | `--bg-primary` (light), `--text-primary` (dark), `--brand-chalk` |
| Sage | `#858076` | `--sage` / `--sage-hex`, Tailwind `sage.DEFAULT` |

**Logo orange is a separate, deliberate value:** the app icon (`public/icon.svg`) is a `#FF6B1F` rounded square with a white A-barbell mark (the owner's approved logo asset). `#FF6B1F` appears **nowhere** in the UI token system — it is a brand-asset color only.
**PWA chrome:** `public/manifest.json` `theme_color` and `background_color` are both `#171916` (Graphite), and the Next viewport `themeColor` in `layout.tsx` is `#171916`. The installed-app chrome is therefore graphite, not vermilion and not logo orange.

## 3. Color tokens

### 3.1 Scheme A — RGB-triplet vars (**canonical by usage**)

Defined in `globals.css` for `:root` (light) and `.dark, :root[data-theme='dark']`. Tailwind maps these to the utility palette (`bg-bg-card`, `text-text-secondary`, `bg-accent`, …), components consume them ~5,767 times across 103 files, and the runtime accent system writes this scheme.

| Token | Light | Dark |
|---|---|---|
| `--bg-primary` | `243 240 231` · #F3F0E7 | `18 20 17` · #121411 |
| `--bg-secondary` | `232 229 220` · #E8E5DC | `24 27 23` · #181B17 |
| `--bg-tertiary` | `223 220 210` · #DFDCD2 | `32 35 31` · #20231F |
| `--bg-card` | `255 255 255` · #FFFFFF | `36 40 35` · #242823 |
| `--bg-elevated` | `255 255 255` · #FFFFFF | `46 50 45` · #2E322D |
| `--text-primary` | `23 25 22` · #171916 | `243 240 231` · #F3F0E7 |
| `--text-secondary` | `94 97 90` · #5E615A | `175 179 171` · #AFB3AB |
| `--text-muted` | `98 93 80` · #625D50 | `158 162 154` · #9EA29A |
| `--border` | `226 223 214` · #E2DFD6 | `52 57 50` · #343932 |
| `--border-subtle` | `234 231 223` · #EAE7DF | `40 44 39` · #282C27 |
| `--border-hover` | `160 156 148` · #A09C94 | `82 90 79` · #525A4F |
| `--accent` | `228 68 39` · #E44427 | `235 78 48` · #EB4E30 |
| `--accent-dim` | `199 53 27` · #C7351B | `199 53 27` · #C7351B |
| `--accent-glow` | rgba(228,68,39,0.16) | rgba(235,78,48,0.28) |
| `--sage` | `133 128 118` · #858076 | `133 128 118` · #858076 |
| `--success` | `21 115 71` · #157347 | `74 222 128` · #4ADE80 |
| `--warning` | `138 90 0` · #8A5A00 | `251 191 36` · #FBBF24 |
| `--danger` | `180 35 24` · #B42318 | `248 113 113` · #F87171 |

Tailwind additionally maps: `surface.DEFAULT → --bg-card`, `surface.highlight → --bg-secondary`, `surface.elevated → --bg-elevated`; `accent.text → var(--accent-text)`, `accent.on → var(--accent-on)`, `accent.subtle → var(--accent-subtle)` (hex-layer vars, §3.2 — the only hex-layer values with consumers); `error → --danger` (alias).

### 3.2 Scheme B — hex vars (defined in both themes; **mostly dead**)

| Token | Light | Dark | Consumer |
|---|---|---|---|
| `--bg` | #F3F0E7 | #171916 | **none** |
| `--surface` | #FFFFFF | #212420 | **none** |
| `--sunken` | #E8E5DC | #1B1E1A | **none** |
| `--text` | #171916 | #F3F0E7 | **none** |
| `--text-2` | #5E615A | #A5A9A1 | **none** |
| `--text-3` | #625D50 | #9EA29A | **none** |
| `--accent-hex` | #E44427 | #E44427 | written at runtime by `accent-themes.ts`; **read by nothing** |
| `--accent-on` | #000000 | #171916 | Tailwind `accent.on` |
| `--accent-subtle` | #FDF1EE | rgba(228,68,39,0.15) | Tailwind `accent.subtle` |
| `--accent-text` | #C7351B | #FF7D66 | Tailwind `accent.text` |
| `--border-hex` | #E2DFD6 | #2C302B | **none** |
| `--border-control` | #A09C94 | #474E45 | **none** |
| `--sage-hex` / `--sage-subtle` | #858076 / rgba(133,128,118,0.15) | #858076 / rgba(133,128,118,0.20) | **none** (Tailwind `sage` is hardcoded instead) |
| `--success-bg` / `--warning-bg` / `--danger-bg` | #E6F4EA / #FBF0D3 / #FDE8E6 | rgba(74,222,128,0.15) / #2B2210 / #3A1714 | **none** |
| `--scrim` | rgba(23,25,22,0.5) | rgba(0,0,0,0.75) | **none** (`.modal-overlay` hardcodes `bg-black/60`) |
| `--inverse` / `--inverse-text` | #171916 / #F3F0E7 | #F3F0E7 / #171916 | **none** |
| `--brand-graphite/chalk/vermilion/sage` | #171916 / #F3F0E7 / #E44427 / #858076 | same | **none** (Tailwind `brand.*` duplicates them as literals) |

22 of the 42 vars defined in `:root` have no consumer anywhere in the application (full method in the consistency audit).

### 3.3 Where the two schemes **disagree** (dark theme)

| Role | Scheme A (used) | Scheme B (unused) |
|---|---|---|
| App background | #121411 (`--bg-primary`) | #171916 (`--bg`) |
| Card surface | #242823 (`--bg-card`) | #212420 (`--surface`) |
| Secondary text | #AFB3AB (`--text-secondary`) | #A5A9A1 (`--text-2`) |
| Border | #343932 (`--border`) | #2C302B (`--border-hex`) |
| Accent | #EB4E30 (brightened) | #E44427 (`--accent-hex`, never brightens) |

In the light theme the two schemes agree on every shared role. The dark disagreements are invisible today only because Scheme B is unread; any future component that reads Scheme B in dark mode will render visibly different surfaces from the rest of the app.

### 3.4 Tailwind-config hardcoded palettes (a third definition site)

`tailwind.config.js` also defines literal palettes: `brand` (the 4 brand hexes), `graphite` (DEFAULT #171916, surface #212420, elevated #2A2E29, border #2C302B — note: identical to Scheme B's dark values, i.e. the config encodes the *unused* scheme), `chalk` (DEFAULT #F3F0E7, surface #FFFFFF, sunken #E8E5DC, border #E2DFD6), `vermilion` (DEFAULT #E44427, dim #C7351B, glow/subtle rgba), `sage` (DEFAULT #858076, dim #6E6A61, subtle rgba), and chart/data colors `water #38BDF8`, `protein #22C55E`, `creatine #F5B301`, `weight #A78BFA`, `info #3b82f6`. These literals do not respond to theme or accent-variant changes.

### 3.5 Accent variants (runtime)

`src/lib/accent-themes.ts` defines 7 variants — **vermilion (default)**, cobalt, forest, plum, teal, rose, **custom** (user hex; the derivation darkens/lightens programmatically to hold ≥3:1 against the background and picks a passing `on` color). Each variant supplies light + dark sets for accent/dim/text/on/subtle/glow, written over Scheme A vars (and `--accent-hex`) at runtime. Semantic colors (success/warning/danger) are **not** variant-dependent. A documented special case in `globals.css`: in dark mode, filled-vermilion controls (`.btn-primary`, `.segmented-item.active`, `.bg-accent.text-accent-on`) are overridden to `accent-dim` background + chalk text (4.66:1) because chalk on the brightened dark accent is only 3.25:1.

## 4. Typography

**Families** (`layout.tsx`, `next/font/google`): Inter → `--font-sans` (default body; `display: optional`); Barlow Condensed 600/700 → `--font-display` (display roles ≥28px + wordmark only; `preload: false`); Noto Sans Devanagari → `--font-devanagari` (per-glyph fallback for Hindi; `preload: false`). `font-feature-settings: 'cv02','cv03','cv04','cv11'` on `html`. Mono: ui-monospace stack (Tailwind `font-mono`) — used extensively for numeric/metric labels.

**Defined scale** (Tailwind `fontSize` extension): `2xs` 11/14 · `label` 12/16 · `body` 14/20 · `title` 17/24 · `pageTitle` 22/28 · `prominent` 28/32 · `display` 32/36 · `compactMetric` 20/24 · `chartLabel` 11/14 — alongside Tailwind's stock `xs` 12, `sm` 14, `base` 16, `lg` 18, `xl` 20, `2xl` 24, `3xl` 30, `4xl` 36.

**Global type classes** (`globals.css`): `.display-title` (Barlow Condensed, 32/36 → lg 40/44, semibold) · `.page-title` (22/28 semibold — matches `text-pageTitle`) · `.section-heading` (17/**22** semibold — note: config's `text-title` is 17/**24**; the two definitions of the same role differ in line-height) · `.section-title` (12→13px, semibold, tracking-wide, muted) · `.card-title` (16→18 bold) · `.metric-display` (30→36 bold, tabular-nums) · `.label-secondary` (12px secondary) · `.label-nav` (11px medium).

**Stated floor:** the config comment records that 10px text was abolished (former `3xs` removed; `2xs` redefined to 11px). Measured reality (consistency audit): `text-[0.625rem]` (10px) still occurs 86 times and `text-[0.5625rem]` (9px) 22 times via arbitrary values.

## 5. Spacing & layout

No custom spacing tokens exist; the system is Tailwind's stock 0.25rem scale. Structural rules live in `globals.css`: `.page` — max-width **480px**, `px-4 sm:px-6`, top padding 12px, bottom clearance `calc(76px + safe-area)`; `.page-bottom-safe` — `calc(6rem + safe-area)` for Today; `.card` padding `p-4 sm:p-5`; base inputs `px-3 py-2.5`. The app is a centered single column at every viewport width (desktop shows the 480px column on a plain background).

## 6. Geometry (component dimensions of record)

| Component | Radius | Height / size | Source |
|---|---|---|---|
| `.btn-primary` | rounded-xl (12px) | min-height **48px**, px-4 py-2.5, text-sm bold | globals.css |
| `.btn-secondary` / `.btn-outline` | rounded-xl | min-height **44px** | globals.css |
| `.btn-ghost` / `.btn-danger` | rounded-xl | min-height **40px** | globals.css |
| `.btn-circle` | rounded-xl | 40×40px | globals.css |
| `ui/Button` md (primary etc.) | rounded-xl | min-height **44px** (≠ `.btn-primary`'s 48) | ui/Button.tsx |
| `ui/Button` lg | rounded-2xl | min-height 52px | ui/Button.tsx |
| `ui/Button` outline variant | rounded-xl | accent border + accent text (**different meaning** from `.btn-outline`: neutral border) | ui/Button.tsx |
| Inputs (global base rule) | rounded-xl | px-3 py-2.5; font 16px (<sm) / 14px (≥sm) | globals.css |
| `.card` / `ui/Card` default | rounded-2xl (16px) | p-4 sm:p-5, border/60 (globals) vs border/80 (ui/Card) | both |
| `.modal-content` | rounded-t-2xl / sm:rounded-2xl | max-w 520px, max-h 90vh/85vh | globals.css |
| `.segmented-item` | rounded-lg | min-height 44px, text-xs bold | globals.css |
| `.native-tab-item` | rounded-xl | min-height 48px | globals.css |
| `.stepper-btn` | rounded-full | 48×48 → sm 56×56 | globals.css |

Radius scale in use (Tailwind defaults; no config extension): xl and lg dominate (see audit counts).

## 7. Motion

Keyframe animations are centralized in `tailwind.config.js`: `fade-in` 0.25s, `slide-up` 0.25s, `scale-in` 0.2s, `tab-enter` 0.22s — all `ease-out`. Component-level motion is dominated by `transition-colors` and `transition-all` with `duration-150` (the de-facto standard, baked into every globals component class); press feedback is `active:scale-[0.98]` (buttons/cards), `[0.97]` (segmented), `95` (tab items), `90` (stepper). Progress fills use `duration-500`. A global `prefers-reduced-motion` block collapses all animation/transition durations to ~0ms. No arbitrary `duration-[…]` values exist in components (audit count: 0).

## 8. Elevation, focus, states

- Shadows: one custom token, `shadow-xs` = `0 1px 2px rgba(0,0,0,0.04)`; dark cards get unlayered inset-highlight + drop shadows in `globals.css`; modal content uses `shadow-2xl`; `ui/Card` elevated variant uses `shadow-md`.
- Focus: unlayered `:focus-visible { outline: 2px solid rgb(var(--accent)); offset 2px }` globally (deliberately unlayered to defeat `outline-none` utilities), plus per-control rings on inputs (`focus:border-accent focus:ring-1`) and `ui/Button` (`ring-2` + offset).
- Disabled: `ui/Button` uses `opacity-50 + pointer-events-none`; globals button classes define no disabled treatment (native buttons rely on per-call-site classes).
- Selected: segmented active = card surface + shadow-xs (light) / accent-dim fill (dark override, §3.5); tab active = accent text + 3px accent indicator bar.
- Semantic states always pair color with icon/label per the token comments (success is a dedicated green — explicitly *not* sage since the D2 fix).

## 9. Iconography

Single library: **lucide-react** 0.451.0 (86 import statements across components/app/features). No second icon library exists. Inline `<svg>` appears 11 times in 7 files — the exercise-demo stick figures (`ExerciseDemo.tsx`), brand/social marks (`onboarding/SocialAuthButtons.tsx`, `AuthModal.tsx`), chart/progress primitives (`ProgressPage.tsx`, `ProgressChart.tsx`, `ui/CircularProgress.tsx`), and the Form Coach pose overlay (in `src/features`, drawn from landmarks). Icon sizing is per-call-site Tailwind (`w-4 h-4` etc.); no size tokens exist.
