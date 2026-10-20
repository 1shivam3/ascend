# Persona Review R2 — Lakshmi, 60, senior, low vision (NEW)

Simulated week traced end-to-end in code on branch `feat/overnight-build` (read-only).
Lakshmi: 60, low vision, needs large text / large targets / pinch-zoom as a fallback, plain-language errors.
Assumed path: guest → Beginner → 2–3 days/week → beginner workout view (the kindest surface the app has).

## First impression

Two first impressions collide. The onboarding screens themselves are big and calm: `text-2xl/3xl`
headings, full-width `py-4` Continue buttons, `p-4/p-5` selectable cards
(`ScheduleScreen.tsx`, `ExperienceLevelScreen.tsx`) — she can get through setup. And the beginner
workout view is the best large-type surface in the app (see What worked). But the moment anything is
small — and much of the app is small — she has **no rescue**: the app actively disables pinch-zoom
(see LAKSHMI-1). For a low-vision user that single fact colours the entire week.

## What worked

- **Beginner-mode logging core is genuinely large.** `ActiveWorkoutScreen.tsx` beginner branch
  (~L2174): weight and reps inputs at `text-4xl sm:text-5xl font-black`, stepper buttons
  `w-12 h-12 sm:w-14 sm:h-14` (48–56 px, also `.stepper-btn` in `globals.css`), Complete Set at
  `py-3.5` ≈ 65% width, effort described in words (Easy / Target / Hard). If she stays in this one
  view, she can log a workout without zooming.
- **Global button floors exist.** `globals.css`: `.btn-primary` min-height 48px, `.btn-secondary`/
  `.btn-outline` 44px, `.native-tab-item` min-height 48px, modal close buttons commonly
  `min-h-[44px] min-w-[44px]`. Inputs are forced to 16px to prevent iOS auto-zoom (`globals.css` ~L136).
- **Onboarding errors are plain English.** `PersonalDetailsScreen.tsx`: "Please enter a valid age
  between 13 and 120", and the under-13 guard explains itself fully. Toast errors elsewhere are short
  sentences, not codes.
- **Dark theme (the forced default — `layout.tsx` renders `<html className="dark">`) is the more
  legible one:** chalk #F3F0E7 on graphite ≈ 16.3:1, dark muted #8B8F87 on #121411 ≈ 5.6:1 (passes AA
  for normal text). Headline numbers use `.metric-display` at 3xl/4xl.

## Friction & bugs

- **LAKSHMI-1 (BLOCKER) — Pinch-zoom is deliberately disabled app-wide.** `src/app/layout.tsx`
  viewport: `maximumScale: 1, userScalable: false`, plus an inline script that `preventDefault()`s
  `gesturestart/gesturechange/gestureend` ("Prevent gesture/pinch zoom on iOS WebKit", ~L99).
  A low-vision user's primary compensating tool is removed by design. Combined with LAKSHMI-2 there is
  no accessible way to enlarge anything she cannot read.
- **LAKSHMI-2 (feature gap that completes the blocker) — No text-scaling support anywhere.** Grep over
  `src/` for font-size preferences / large-text / accessibility settings: nothing. No setting in
  `SettingsView.tsx` Customization (weekly target, gamification, coach, habit matrix only), no
  `rem`-scaling hook, `globals.css` sets `text-size-adjust: 100%` and nothing user-controllable.
  System font scaling is also undermined by the fixed px-based Tailwind sizes throughout.
- **LAKSHMI-3 (major) — Sub-40px tap targets on the logging path.** Measured from classNames in
  `ActiveWorkoutScreen.tsx`: beginner set-pill navigator `w-7 h-7` = **28px** (~L2191) — she must tap
  these to move between sets; add-set `w-8 h-8` = 32px; weight quick-chips `min-h-[32px]`
  (~L2412); beginner RPE button `px-3 py-1.5` ≈ 30px tall (~L2468). In advanced mode it's worse:
  RPE badge `min-w-[34px] py-1.5`, Skip `px-1.5 py-1`, complete toggle `w-9 h-9` = 36px (~L2678).
  WCAG target minimum is 24px (AA, 2.2) / 44px (Apple HIG / WCAG AAA guidance) — the set pills pass
  the legal floor and fail every practical one for a 60-year-old with low vision and normal tremor.
- **LAKSHMI-4 (major) — Critical numbers shrink outside beginner mode.** Advanced/table view
  (`ActiveWorkoutScreen.tsx` ~L2577): weight input `text-sm sm:text-base` inside a **78px-wide** box,
  reps inside 60px, unit labels `text-3xs/2xs`, per-dumbbell and plate summaries at `text-[9px]`
  (~L2603, ~L2612) — the plate summary is safety-relevant (what to load on the bar) at 9px.
  "Today's Target" is `text-base`, "Last Time" `text-xs` (~L2141–2165). If her `userMode` is ever
  toggled to advanced (Settings exposes the toggle to everyone), her logging screen becomes unreadable.
- **LAKSHMI-5 (major) — Light-theme muted text fails contrast.** Sage/muted `--text-muted: #858076`
  on chalk `#F3F0E7` = **3.45:1** (computed), below WCAG AA 4.5:1 for normal text — and muted is the
  colour of nearly all secondary-but-necessary text (targets, last-time, schedule captions, habit
  labels), rendered at `text-xs`, `text-2xs` (10.4px, `tailwind.config.js`), and `text-3xs`. Vermilion
  accent on chalk is also only 3.57:1 where it's used for small bold labels. Dark theme passes
  (5.6:1); if she switches to light for glare reasons, the app gets *less* readable.
- **LAKSHMI-6 (minor) — `text-3xs` is a dead class.** It is used 100+ times across components
  (28× in `ActiveWorkoutScreen.tsx` alone) but `tailwind.config.js` `fontSize` defines only `2xs`,
  `label`, `body`, `title`, `display` — no `3xs`, and no CSS definition exists in `globals.css`.
  The class generates nothing; those labels render at inherited size, inconsistently by context.
  Not itself a vision bug (inherited is usually larger than the intended ~9px), but it means the
  type system the team thinks it shipped isn't the one on screen.

## Keep-or-delete verdict

**DELETE (do not recommend to her) — until LAKSHMI-1 is reversed.** Why: an app that blocks pinch-zoom
and offers no text scaling has made a deliberate trade that excludes exactly this user, no matter how
good the beginner steppers are. Re-enable zoom + ship a Large Text setting and she plausibly jumps to
Raj's tier overnight, because the core logging loop is already the right shape — but as shipped, one
unreadable advanced-mode screen, one 28px set pill, or one 9px plate note ends her week.

## Competitor gap

Apple Health/Fitness and Strong both inherit OS Dynamic Type / system zoom instead of fighting it;
Hevy's workout view keeps weight/reps at display size in *all* modes, not just beginner mode.
ASCEND is the only one of the set that spends code (viewport lock + gesture prevention) to take
accessibility *away*.

## Rating: 3/10
