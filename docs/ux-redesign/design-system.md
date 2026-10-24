# ASCEND UX Redesign — Design System (Phase 4)

> **Status:** Decision document. Builds on the live system (`tailwind.config.js` + `src/app/globals.css` + `src/components/ui/`), not on the stale `design-system/ascend/MASTER.md` (marked superseded — see §1). No app code changes in this phase. All token values below are specifications for implementation; contrast ratios for new presets must be verified by the implementation contrast audit (only the default vermilion ratios are code-verified today: accent text 4.66:1 light).
> **Non-negotiables:** vermilion default preserved; semantic colors never derived from the accent; no capability removed; no new dependency unless justified (none is justified in this system — no chart library, no animation library, no component library).

## 1. Source of truth

- **Live system (build on this):** `tailwind.config.js` (palette, `accent.*` aliases, 4 keyframes, font stacks) + `src/app/globals.css` (`:root` light / `.dark` tokens, shared classes `.card`, `.btn-*`, `.modal-*`, `.stepper-btn`, `.segmented-control`) + `src/components/ui/` (12 primitives).
- **Stale (do not follow):** `design-system/ascend/MASTER.md` (2026-10-06; palette `#F97316`/green accent, Barlow fonts, references to nonexistent `design-system/pages/*.md`). It carries a superseded header note as of this program. If any future doc contradicts this design system, this document wins and the contradiction is flagged.
- **Prior art (not a system):** `GSD-STYLE.md`, `PERSONA_REPORT.md`, `docs/ASCEND_*_AUDIT*.md` are historical reports, not tokens. `public/ui-mockups.html` is a served showcase, not app UI (removal flagged for user approval; not done here).

## 2. Visual concepts considered (internal, then selection)

### Concept A — Editorial Athletic (SELECTED)
Typography-led: Inter body, condensed display headings, hairline rules, surfaces over boxes, vermilion used sparingly for action/selection/brand moments. Density via tables and rows, not cards. Calm, confident, premium. Strengths: fits all personas (beginner calm + expert density); uses an already-loaded font; scales to desktop via grid, not decoration. Weaknesses: condensed display needs Devanagari-fallback care; restraint risks feeling plain if spacing is timid (mitigated: display sizes + rules + one strong brand moment per screen).

### Concept B — Training Lab (rejected)
Dense data-forward: mono numbers, dark-forward surfaces, table-everything, minimal chrome. Strengths: beloved by P4/P5/P8; maximal information density. Weaknesses: hostile to P1/P2/P6/P11; mono-everything reads as a terminal, not a consumer product; dark-forward conflicts with the chalk-light default identity.

### Concept C — Warm Minimal (rejected)
Soft surfaces, large rounded shapes, friendly oversized type, low density everywhere. Strengths: welcoming for P1/P2; excellent empty states. Weaknesses: cannot carry training tables, charts, or Advanced mode without ballooning scroll; wastes the expert user's screen.

**Selection rationale:** Concept A is the only direction that serves both ends of the persona range without a second system: its calm shell satisfies P1/P2/P11 while its tables/rows carry P3/P4/P5/P8 density. Concept B's density is adopted inside A's detail views (workout tables, chart frames); Concept C's warmth is adopted in empty states and onboarding copy, not as a system.

## 3. Palette and semantic tokens

### 3.1 Brand palette (verified live values, preserved)

| Token | Light | Dark | Use |
|---|---|---|---|
| Vermilion (default accent) | `#E44427`, dim `#C7351B`, text `#C7351B` (4.66:1 verified), on-accent `#FFFFFF`, subtle `#FDF1EE`, glow `rgba(228,68,39,0.16)` | `#EB4E30`, dim `#C7351B`, text `#FF7D66`, subtle `rgba(228,68,39,0.15)`, glow `rgba(235,78,48,0.28)` | Primary actions, selection, brand moments ONLY. Never for unrelated metrics. |
| Graphite | Text `#171916`; card `#FFFFFF`; sunken `#E8E5DC`; tertiary `#DFDCD2`; borders `#E2DFD6` / `#EAE7DF` / hover `#A09C94` | bg `#121411`; card `#242823`; elevated `#2E322D`; sunken `#1B1E1A`; borders `#343932` / `#282C27` / hover `#525A4F` | Text, surfaces, borders. |
| Chalk | Background `#F3F0E7` | Background `#121411`-family; text `#F3F0E7` | Page background (light) / primary text (dark). |
| Sage | `#858076`, dim `#6E6A61`, subtle `rgba(133,128,118,0.15)` | Same hex; subtle `0.20` | Muted secondary content ONLY. Never success (see §3.2). |
| Text secondary / muted | `#5E615A` secondary, `#6E6A5E` muted (4.7:1) | `#AFB3AB`/`#A5A9A1` secondary, `#8B8F87` muted | Secondary and meta text. |
| Macro colors (unchanged) | Water `#38BDF8`, protein `#22C55E`, creatine `#F5B301`, weight `#A78BFA` | Same | Nutrition/body contexts only. Not status colors. |

### 3.2 Semantic tokens — the D2 fix (separating success from muted)

The current `--success` IS sage `#858076` (both themes) — visually identical to muted text. The new system separates them (token change only; no behavior change):

| Token | Light | Dark | Rule |
|---|---|---|---|
| Success | `#157347` on `#E6F4EA` | `#4ADE80` on `rgba(74,222,128,0.15)` | Never sage; never accent-derived. Always paired with a check icon + label, never color alone. Verify ≥4.5:1 for text use in the implementation audit. |
| Warning | `#8A5A00` on `#FBF0D3` (preserved) | `#FBBF24` on `#2B2210` (preserved) | Preserved values; paired with icon + label. |
| Danger | `#B42318` on `#FDE8E6` (preserved) | `#F87171` on `#3A1714` (preserved) | Preserved values; destructive actions keep confirmations. |
| Info | Preserved `info` token | Preserved | Neutral informational use only. |
| Focus | Accent-based ring (existing `:focus-visible` rule, preserved + extended) | Same | Visible on every interactive element; never removed for minimalism. |

### 3.3 Accent theme tokens (mechanism for personalization)

The existing `--accent` / `--accent-dim` / `--accent-glow` + Tailwind `accent.*` aliases are the mechanism. A theme sets: `--accent` (hex + RGB triplet), `--accent-dim`, `--accent-text` (for text on background, ≥4.5:1), `--accent-on` (text on accent, ≥4.5:1 for labels, ≥3:1 for large/UI-only use), `--accent-subtle`, `--accent-glow`. Light/dark variants per preset (dark variants brightened, following the vermilion precedent). Full preset table + custom-accent algorithm: see `personalization-spec.md`. **Rule:** accent tokens change accent uses only — never backgrounds, body text, borders, or semantic colors wholesale.

## 4. Typography

- **Body:** Inter (`--font-sans`), already loaded. Tabular numbers for all metric/number roles (`font-feature-settings: "tnum"`).
- **Display:** Barlow Condensed (`--font-display`), already loaded but currently unwired — wired ONLY for display headings at ≥28px and the app wordmark. Fallback stack: `'Barlow Condensed', 'Noto Sans Devanagari', Inter` — Devanagari glyphs fall back per-glyph to Noto; Latin renders condensed. Constraint from debate dissent (Expert B): if the implementation live check shows mixed-script inconsistency, the fallback is Inter-only with tight tracking — reversible without layout change.
- **Mono:** system mono stack (`ui-monospace, SFMono-Regular, Menlo, monospace`). JetBrains Mono / Fira Code are referenced but not loaded via `next/font` — do not add a download; use the system stack.
- **Scale (floor raised — 10px removed):**

| Role | Size / line-height | Weight | Notes |
|---|---|---|---|
| Display / welcome | 32px / 36px (mobile), 40px / 44px (desktop ≥1024) | 600, Barlow Condensed, tight tracking | Welcome, empty-state heroes, wordmark contexts only. |
| Page title | 22px / 28px | 600, Inter | One per screen. (New token; existing `title` 17px becomes section heading.) |
| Section heading | 17px / 22px | 600, Inter | Existing `title` size, kept. |
| Body | 14px / 20px | 400, Inter | Default text. (Existing `body`, kept.) |
| Supporting | 12px / 16px | 400, Inter | Secondary copy, meta text. (Existing `label`, kept.) |
| Form label | 12px / 16px | 500, Inter | Always visible above inputs; never placeholder-only. |
| Button label | 14px / 20px (primary), 14px (secondary) | 600, Inter | No all-caps buttons. |
| Compact metric | 20px / 24px | 600, Inter, tabular | Small stat values (strip, rows). |
| Prominent number | 28px / 32px | 600, Inter, tabular | Hero numbers (PRs, totals, scores). Not every number — only the screen's one key figure. |
| Chart label | 11px / 14px | 500, Inter | Axes, legends, ticks. Floor for chart text. |
| Error / helper | 12px / 16px | 400, Inter | Errors in danger token + icon; helpers in muted. |
| Label floor | 11px minimum everywhere | — | `3xs` (10px) is REMOVED from the scale; all 100+ usages bump to 11px (`2xs` redefined to 11px) or 12px. `2xs` 10.4px is retired with it. |

- **Rules:** No excessive all-caps (eyebrow labels only, 11px, tracked, sparing). No more than two families in any view (Inter + Barlow display). No huge headings pushing content below the fold (display reserved for welcome/empty heroes, not every page title).

## 5. Layout and spacing

- **Spacing tokens (Tailwind defaults + named scale):** page padding `px-5` mobile, `sm:px-6`; section gap 24 (`space-y-6`); card padding `p-4 sm:p-5` (preserved); form gap 16; button heights: primary 48, secondary 44, small 36 (with 44px touch target via padding where needed); modal padding 20; chart padding 16; dense workout table row min-height 56; stepper target 44.
- **Content widths:** mobile column `max-w-md` (448px, preserved) for single-column flows (workout, settings forms); wide content `max-w-3xl` (768px) for Today/Progress/Fuel grids on ≥768px; desktop rail 232px + content beside it (≥1024px). Active workout stays single-column centered (`max-w-2xl`) even on desktop — the one-hand hierarchy is not stretched.
- **Responsive grid:** <768: single column. 768–1023: two-column supporting grid (Today supporting sections, Progress cards). ≥1024: left rail + content; Today supporting sections in 2-col grid; workout card full-width on top; modals keep the 520px cap (no widening — the cap exists for focus, not just phones).
- **Surfaces, not boxes:** cards (`.card`, rounded-2xl, border) are for self-contained units (workout card, summary, forms). Rows, grouped lists, hairline dividers, and typographic sections carry the rest (habit rows, history rows, settings rows, chart frames). A screen that is all cards has failed this system.
- **Radii (centralized):** card/sheet 16, input 12, chips/pills full, buttons 12. (Existing values, now tokens — no visual change, no per-component freelancing.)
- **Shadows:** borders carry separation. Elevated shadow only for sheets/modals (existing `.card-elevated`). No new shadow system, no floating-card stacks.

## 6. Component system

Built on the 12 existing `ui/` primitives (Button, Card, Badge, RankBadge, CircularProgress, Stepper, CollapsibleDetails, Toast, TabGuardBanner, LanguagePicker, PermissionHelp, ThemeToggle). New components are added only where they reduce duplication; no second library, no dozens of trivial abstractions. TabSkeleton stays as the tab fallback (it lives outside `ui/` — do not duplicate it).

| Component | Purpose | Key variants / states |
|---|---|---|
| PageHeader | Screen title + optional actions + back behavior | Title, subtitle, actions slot; states: default only (not interactive itself). |
| Section | Titled content block with optional action + collapse | Header + action + body; collapsed/expanded (persisted where it matters: coach section). |
| Stat | Metric summary (value + label + optional delta) | Compact (20px) / prominent (28px); measured vs estimated badge; loading skeleton. |
| Sheet | Unified modal/drawer wrapper enforcing stack semantics | Bottom sheet mobile / centered desktop (existing `.modal-content` behavior); Escape/back-handler stack preserved; sizes: default 520px cap. All 36 modals migrate their chrome to Sheet over stages — flows unchanged. |
| EmptyState | Designed empty pattern (icon, title, explanation, next action) | One per empty context (new user, no plans, no meals, no PRs, no history, error, offline); never a bare "no data" string. |
| ThemePicker | Preset swatches + custom hex input + preview + reset | Selected indicator; corrected-shade note; per-preset contrast note. (Spec: personalization-spec.md.) |
| CustomizeSheet | Dashboard toggles + up/down order + scoped restores | Checkbox per section (names == section titles); workout card locked on; restore-layout button. |
| SetRow / SetTable | Workout entry row (Beginner) / table (Advanced) | Weight/rep steppers, complete state, set-type + RPE in Set options expander (Simple) / open (Detailed); previous-performance line; error state for invalid values. |
| FilterBar | Chart filter standard (lift + range + metric) | Persisted per chart; defaults shown in Simple; full controls in Detailed. |
| SegmentedControl | Promote existing `.segmented-control` (globals) to a component | Fuel segments, You Profile \| Settings, Progress sub-tabs where segmented (not tab-bar) fits. |
| Existing primitives (kept, converged on) | Button (primary/secondary/outline/ghost/danger/circle), Card, Badge, Stepper, CollapsibleDetails, Toast, CircularProgress, RankBadge, TabGuardBanner, LanguagePicker, PermissionHelp, ThemeToggle | Every page converges on these; hand-rolled buttons/rows are migrated, not duplicated. States per component: default, hover (where relevant), focus-visible, pressed/active, selected, disabled (true disabled, not opacity-only), loading, success, error where relevant. |

**Component rules:** business logic stays out of presentational components; data sources, handlers, and calculations are unchanged (redesign touches presentation + placement only); every interactive element has a visible focus state, an accessible name (icon buttons especially), and a ≥44px touch target (or 44px target area); disabled means non-activatable, not just faded.

## 7. Charts (frame standard — hand-rolled, no library)

Every chart (ProgressChart, WorkoutHeatmap, macro breakdowns) follows one frame: **title stating the question** ("Is my squat e1RM rising?"), **labeled axes with units** (kg / reps / dates, never bare numbers), **legend** (including measured vs estimated), **time range shown** (and persisted per chart), **empty state** (designed EmptyState, not an empty frame). Measured = solid line/filled mark; estimated = dashed outline + "est." badge. Never color alone for the distinction. No animated counting; brief intro transition only (see animation-spec.md). Axes/units/dates re-verified against real data in implementation — restyling without re-verification is a defect.

## 8. States inventory (every state uses this system)

Loading (skeletons, never spinners over content) · Empty (designed EmptyState + next action) · Error (text + icon + retry, never color alone) · Offline (banner + details modal, preserved) · Success (text + check icon + success token, never color alone) · Destructive confirmation (multi-step where it exists: discard, delete, purge, sign-out-with-clear) · Disabled (true disabled) · Sync states (synced/syncing/local-only as text + icon). Toast system preserved (existing provider).

## 9. What this system explicitly does NOT do

- No second design system beside Tailwind (MASTER.md superseded, not paralleled).
- No new dependencies (no chart/animation/component/form library).
- No decorative imagery system: the app has exactly one photo (`splash-athlete.jpg`, reused in splash + workout detail). Typography carries the brand; do not assume stock or generated imagery. Prior redesign illustrations were rejected by the user.
- No capability removal, calculation change, schema change, auth change, or sync change. Tokens and placement only.
