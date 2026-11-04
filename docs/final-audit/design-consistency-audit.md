# ASCEND — Final Certification: Design Consistency Audit

Round 1a — **evidence document.** Every number below comes from a scan actually run on 2026-11-04 against master `62e25543`. Scope unless stated otherwise: `src/components`, `src/app`, `src/features` (145 `.ts`/`.tsx` files; `globals.css` itself analyzed separately as the token source). Findings only — no fixes are proposed or applied in this round. Severities use the program scale (P2 = significant consistency/presentation defect; P3 = minor inconsistency).

## Method

- Token-scheme usage: regex counts of Tailwind classes bound to each scheme + literal `var(--…)` reads across all of `src`.
- Dead-token test: for each var defined in the `:root` block of `globals.css`, a var counts as *consumed* only if `tailwind.config.js` references it (and thereby exposes it to utilities) or app code reads it via `var(--…)`. Runtime *writes* (accent theming) do not count as consumption.
- Hardcoded values: literal hex (`#RRGGBB`/`#RGB`), `rgb()/rgba()` with literal channels, Tailwind default-palette utilities, and arbitrary-value utilities (`-[…]`) counted by pattern, per file.
- Component variance: import counts for `src/components/ui/*`, usage counts of the global component classes in `globals.css`, and raw element counts.

## What is consistent (verified strengths)

- **One scheme does the real work.** Scheme A (RGB-triplet vars → Tailwind utilities) accounts for **5,767 class usages across 103 files**. The app is not, in practice, split between two live design languages — it is split between one live language and one dead one (F-01).
- **Arbitrary geometry is nearly absent:** `rounded-[…]` **0**, arbitrary spacing (`p-[…]`, `gap-[…]`, …) **1** (in `src/app/page.tsx`), arbitrary `duration-[…]` **0**, arbitrary `shadow-[…]` **3**. Layout discipline is genuinely high.
- **Motion is centralized in practice:** keyframes live only in `tailwind.config.js` (fade-in/slide-up/scale-in/tab-enter, 0.2–0.25s ease-out); component transitions are `transition-colors` (332) / `transition-all` (246) with `duration-150` as the de-facto standard baked into the global component classes; a global reduced-motion block exists.
- **Iconography is single-library:** lucide-react only (86 import statements); no second icon package exists. The 11 inline `<svg>` occurrences (7 files) are the exercise stick-figure demos, social-brand marks, chart primitives, and the pose overlay — not a competing icon set.
- **Shared primitives with real adoption:** `.card` class **292** usages; Toast (`ui/Toast`) referenced by **42 files**; global focus-visible outline is one unlayered rule for the whole app.
- **No font-family overrides:** `style={{ fontFamily }}` occurs **0** times; families come only from `layout.tsx` + config.

## Findings

### F-01 (P2) — A complete second token scheme is defined, themed, and never read; its dark values disagree with the live scheme

`globals.css` defines 42 vars in `:root` (and redefines them for dark). **22 of the 42 have no consumer anywhere**: `--bg`, `--surface`, `--sunken`, `--text`, `--text-2`, `--text-3`, `--accent-hex` (written by the accent runtime, read by nothing), `--border-hex`, `--border-control`, `--sage-hex`, `--sage-subtle`, `--success-bg`, `--warning-bg`, `--danger-bg`, `--scrim`, `--inverse`, `--inverse-text`, and the four `--brand-*` vars. Literal reads of the hex scheme across all of `src`: **0** (`grep "var(--surface)|var(--bg)|var(--text-2)|var(--text-3)|var(--accent-hex)|var(--sunken)"` outside `globals.css` → 0 lines). The duplication is not harmless: in dark mode the dead scheme specifies a **different app background (#171916 vs live #121411), different card surface (#212420 vs #242823), different secondary text (#A5A9A1 vs #AFB3AB), different border (#2C302B vs #343932), and an accent that never brightens (#E44427 vs live #EB4E30)**. `tailwind.config.js` makes it a three-way split by hardcoding the *dead* scheme's dark values into its literal `graphite` palette (surface #212420, border #2C302B). Any future component that reads the wrong layer renders a visibly different app in dark mode.

### F-02 (P2) — Form Coach components are styled with utility classes that do not exist

`src/features/form-coach/components/FormCoachModal.tsx` and `FormSessionSummaryModal.tsx` use **`-accent-primary` utilities 26 times** (`text-accent-primary` 11, `border-accent-primary` 5, `bg-accent-primary` 4 + 5 with opacity modifiers, `from-accent-primary` 1) and **`bg-surface-base` 15 times** — 41 occurrences across 32 lines. Neither `accent.primary` nor `surface.base` exists in `tailwind.config.js`, and no CSS defines them, so Tailwind generates **no style at all** for those classes: the Form Coach primary button (`bg-accent-primary`), its selected-input border, its accent labels, and several surface backgrounds silently fall back to whatever other classes happen to be present. This is the newest feature in the app, and it is the one place where the design system simply does not apply. (The same components otherwise use the live scheme correctly — `bg-surface-elevated`, `text-text-muted`, `border-border-subtle` all resolve.)

### F-03 (P2) — Default Tailwind palette classes bypass the semantic tokens at scale

**725 occurrences in 63 files.** By family: amber **240**, emerald **203**, white 68, sky 47, black 40, red 37, rose 36, purple 22, blue 9, zinc 9, slate 5, indigo 3, stone 3, orange 2, cyan 1. The app defines semantic `success`/`warning`/`danger` tokens precisely so states can adapt to theme and stay distinguishable from the accent; amber/emerald utilities hard-code one theme's answer (e.g. a fixed emerald shade in light mode where the token specifies #157347, rose where the token specifies #B42318). The Form Coach summary modal is one visible example (`bg-emerald-500/10`, `text-rose-400`, `text-amber-400`, `text-sky-400` for its severity states). These classes also ignore the runtime accent system by design — acceptable for true status colors, but they are currently the *majority* expression of status in the UI rather than the exception.

### F-04 (P3) — Text below the system's own 11px floor, via arbitrary values

The design system abolished 10px text (config comment: `2xs` redefined to 11px, former `3xs` removed). Arbitrary values route around the floor: **`text-[0.625rem]` (10px) ×86, `text-[0.5625rem]` (9px) ×22**, plus `text-[0.6875rem]` (11px) ×56 duplicating `text-2xs` instead of using it. Total arbitrary font sizes: **167 in 30 files**; worst: `src/components/PolicyDecisionCard.tsx` (38), `CreatineModal.tsx` (13), `PRsPage.tsx` (11), `HydrationModal.tsx` (10). Separately, `uppercase` is applied at **268** sites with no central rule for when meta-labels are uppercased.

### F-05 (P3) — Two button systems with different geometry and different meanings

- Global classes (in `globals.css`): `.btn-primary` **81** usages (min-height **48px**), `.btn-secondary` 52 (44px), `.btn-ghost` 7 (40px), `.btn-danger` 5 (40px), `.btn-circle` 3, `.btn-outline` **0 usages — defined, never used**.
- `ui/Button` (variants primary/secondary/ghost/danger/outline; sm/md 44px, lg 52px): imported by **4 files** only. Its `md` primary is **44px — 4px shorter than `.btn-primary`** for the same role, and its `outline` variant means *accent border + accent text*, the opposite of `.btn-outline`'s neutral border.
- Everything else is hand-rolled: **767 raw `<button>` elements** across the scanned files. The shared touch floor is nonetheless consistent in practice — `min-h-[44px]` occurs 151 times.

### F-06 (P3) — Three coexisting modal constructions

`.modal-overlay`/`.modal-content` global chrome: **52 usages**. `ui/Sheet` — the documented unified wrapper ("New surfaces should use Sheet… existing modals keep their proven chrome until migrated", `ui/Sheet.tsx` header): imported by **2 files**. Hand-rolled `fixed inset-0` overlays bypassing both: **15 in 12 files** (worst: `ActiveWorkoutScreen.tsx` ×4). 29 `*Modal.tsx` components therefore present at least three generations of dialog chrome; header/close-button treatment varies by generation. Note the scrim is also inconsistent with the token layer: `.modal-overlay` hardcodes `bg-black/60` while the `--scrim` token (0.5 light / 0.75 dark) is never read (part of F-01).

### F-07 (P3) — Card: one dominant class, one parallel component, slightly different borders

`.card` (globals): **292 usages**, `border-border/60`, `rounded-2xl`, `p-4 sm:p-5`. `ui/Card`: imported by **4 files**, same radius/padding but `border-border/80` (default) and `shadow-xs`. The visual delta is small but systematic for any screen that mixes both.

### F-08 (P3) — Hardcoded hex/rgba literals concentrated in data-display components

**197 hex literals in 19 files** (components/app/features, excluding `globals.css`): worst `WorkoutDetailsView.tsx` (58), `ActiveWorkoutScreen.tsx` (32), `src/app/api/feedback/route.ts` (18 — email HTML), `ProgressPage.tsx` (17), `WorkoutHeatmap.tsx` (11), `MeetAttemptPlannerModal.tsx` (10). Most frequent values are token duplicates — `#F3F0E7` ×25, `#171916` ×14, `#212420` ×13, `#2C302B` ×18, `#A5A096` ×27 (sage-badge text), `#858076` ×8 — plus chart series colors (`#38BDF8` ×12, `#22C55E` ×11, `#F5B301` ×6) that also exist in the Tailwind config. Literal `rgb()/rgba()` (non-var): **18 in 4 files**, worst `WeeklyRecapModal.tsx` (13 — the share-image renderer, where canvas drawing legitimately needs raw colors, but the values duplicate brand tokens). These literals do not follow theme or accent-variant changes.

### F-09 (P3) — The semantic type scale is defined and almost entirely unused

`tailwind.config.js` defines `label`, `body`, `title`, `pageTitle`, `display`, `prominent`, `compactMetric`, `chartLabel`. Measured usage across components: **`text-label` ×2; the other seven ×0.** Real usage is stock sizes: `text-xs` 921, `text-2xs` 917, `text-sm` 290, `text-base` 95 — i.e., the UI's type hierarchy is effectively *11px/12px meta + 14px body*, whatever the scale says. The global classes partially bridge this (`.page-title` = `text-pageTitle` values), but the same role is defined twice with one divergence: `.section-heading` is 17/**22** while `text-title` is 17/**24**.

### F-10 (P3) — Radius usage is broad despite a two-value component spec

Component classes specify rounded-xl (buttons/inputs) and rounded-2xl (cards/modals). Measured across components: `rounded-xl` 500, `rounded-lg` **417**, bare `rounded` 139, `rounded-2xl` 128, `rounded-full` 198, `rounded-md` 38, `rounded-3xl` 9, `rounded-sm` 3. `rounded-lg` (8px) — a value no component spec names — is the #2 radius in the app, used for inner tiles/chips by convention rather than by token. There are no radius tokens in config to appeal to.

### F-11 (P3) — The metric-label layer is an unwritten convention (mono + uppercase + 2xs)

`font-mono` occurs **725 times** — the de-facto face for numbers and metric labels — while the spec defines a metric role only for the big number (`.metric-display`, tabular-nums sans). Nothing is *broken* — the pattern is remarkably uniform (mono, uppercase, 2xs, muted) — but it exists nowhere as a token or class, so each new surface re-derives it by hand (and the Form Coach, F-02, derived it into classes that don't exist).

## Ranked inconsistency list

| # | Finding | Severity | One-line evidence |
|---|---|---|---|
| F-01 | Dead second token scheme (22/42 vars unread); dark values disagree on 5 roles; config hardcodes the dead scheme's dark palette | **P2** | 0 `var(--surface/--bg/--text-2…)` reads in all of `src`; dark `--bg` #171916 vs live `--bg-primary` #121411 |
| F-02 | Form Coach uses non-existent utility classes; its primary actions/surfaces are unstyled by the system | **P2** | `*-accent-primary` ×26 + `bg-surface-base` ×15 in the two Form Coach components; neither name exists in config or CSS |
| F-03 | Default-palette utilities bypass semantic status tokens | **P2** | 725 occurrences / 63 files (amber 240, emerald 203) vs token-based `success/warning/danger` |
| F-04 | 9–10px text persists under an 11px-floor system | P3 | `text-[0.625rem]` ×86 + `text-[0.5625rem]` ×22 (167 arbitrary sizes / 30 files) |
| F-05 | Two button systems: 48px vs 44px primary; opposite `outline` meanings; `.btn-outline` unused | P3 | `.btn-primary` ×81 vs `ui/Button` in 4 files; 767 raw `<button>` |
| F-06 | Three modal constructions (globals / ui/Sheet / hand-rolled) | P3 | `.modal-overlay` ×52; `ui/Sheet` in 2 files; `fixed inset-0` ×15 in 12 files |
| F-07 | `.card` vs `ui/Card` border-opacity split | P3 | `.card` ×292 (border/60) vs `ui/Card` in 4 files (border/80) |
| F-08 | Hardcoded hex literals duplicate tokens in data-display components | P3 | 197 hex / 19 files (WorkoutDetailsView 58, ActiveWorkoutScreen 32) |
| F-09 | Semantic type scale unused; one role defined twice with different line-height | P3 | `text-label` ×2, other semantic sizes ×0; `.section-heading` 17/22 vs `text-title` 17/24 |
| F-10 | `rounded-lg` is the #2 radius by convention, named by no spec | P3 | rounded-xl 500, rounded-lg 417, rounded-2xl 128 |
| F-11 | Metric-label style (mono/uppercase/2xs) is uniform but untokenized | P3 | `font-mono` ×725; no metric-label class/token exists |

*End of Round 1a design audit. Fixes are out of scope for this round and are scheduled by the certification program's fix phase.*
