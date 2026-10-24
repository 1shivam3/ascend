# ASCEND UI/UX Redesign — Implementation Summary

Branch `feat/ux-redesign`, cut from master `2c6512d7` (post-#40/#41/#43).
Master was never touched, nothing was merged, deployed, or published, and
no PR was opened by the implementation worker (the PR is parent-run).
This document is the implementation phase's final record: what changed per
stage, decisions made along the way, deviations from the decision docs
with reasons, defects deliberately NOT fixed, and verification results.

Scope reminder: presentation + information architecture only. No data
logic, calculation, auth logic, schema, sync behavior, or capability was
changed. Where a decision doc was ambiguous, the most conservative reading
that preserves behavior was followed.

## Stage 1 — Design system foundations (remote `45d730c`)

- Tokens in `tailwind.config.js` + `src/app/globals.css`: accent
  `text`/`on`/`subtle` aliases; success separated from muted sage (D2:
  light `#157347` on `#E6F4EA`, dark `#4ADE80` on
  `rgba(74,222,128,0.15)`, always with check icon + label). No
  `text-success`/`bg-success`/`border-success` usages existed in tsx and
  Badge `success` already used emerald, so D2 is token-level hygiene for
  future use; warning/danger/info tailwind values were left untouched.
- Label floor raised: `3xs` (10 px) removed; `2xs` redefined to 11/14 px;
  all 341 `text-3xs` usages across `src/` mechanically replaced with
  `text-2xs`. New type tokens: `pageTitle` 22/28, `prominent` 28/32,
  `compactMetric` 20/24, `chartLabel` 11/14; `display` 32/36 mobile,
  40/44 at `lg` (via `.display-title`, components layer — explicit
  `text-3xl`/`text-4xl` utilities on the same element still win).
- Barlow Condensed wired for display only (`fontFamily.display`:
  Barlow Condensed → Noto Sans Devanagari → Inter; `layout.tsx` already
  applied the variables). `fontFamily.mono` is now the system stack
  (removed unloaded JetBrains Mono / Fira Code references).
- Accent-surface text migrated to the `accent-on` token: `.btn-primary`,
  `ui/Button` primary, and every `bg-accent … text-white` site now use
  `text-accent-on` (0 remaining). Limitation: translucent variants such
  as `bg-accent/85` change the effective accent slightly, so the
  full-opacity audit does not strictly cover them.
- Contrast audit (real finding): vermilion sits in a WCAG dead zone
  (luminance ~0.183–0.216) where neither white nor `#171916` reaches
  4.5:1 for label text. White on light vermilion `#E44427` = 4.07:1;
  `#171916` on light vermilion = 4.34:1; pure black = 5.15:1. Per the
  spec's priority (change the `on` value, never the accent), preset
  vermilion light `on` is now `#000000` (was `#FFFFFF`), vermilion dark
  `on` is `#171916`, cobalt dark `on` is `#171916`. **Visible change:
  primary-button text in light mode is black, not white.**
- New library `src/lib/accent-themes.ts` (pure functions): preset table
  (Vermilion, Cobalt, Forest, Plum, Teal, Rose, light + dark
  `accent`/`dim`/`text`/`on`/`subtle`/`glow`); WCAG luminance + ratio
  math; HSL stepping; `normalizeHex`; `deriveCustomAccent`;
  `resolveAccentVariant`; `accentVariantToCssVars`; `applyAccentVars`.
  The custom `on` ladder has three rungs (white, `#171916`, pure black)
  because the spec's two-choice ladder is provably incomplete for
  vermilion itself — documented extension, not a silent change.
- New library `src/lib/today-layout.ts` (pure): `TODAY_SECTION_IDS` in
  default order (workout card pinned first by construction, never in
  `order`); `DENSITY_DEFAULT_VISIBLE` (Simple shows the first five,
  Detailed shows all); `DEFAULT_TODAY_LAYOUT`; `sanitizeTodayLayout`
  (never throws on junk); `resolveTodayLayout` (explicit true/false,
  else density default).
- Store (`src/lib/store.ts`): `UiPreferences` gained the six keys, all
  local-only: `accentTheme`, `customAccentHex`, `density`,
  `todayLayout`, `workoutModeOverride`, `pinnedProgressChart`.
  `DEFAULT_UI_PREFERENCES`: `accentTheme 'vermilion'`,
  `customAccentHex null`, `density 'simple'` (fresh stores = new
  accounts = Simple), `todayLayout` from `DEFAULT_TODAY_LAYOUT`,
  `workoutModeOverride null`, `pinnedProgressChart null`.
  `PERSIST_VERSION` 1 → 2. `migratePersistedState`: a pre-redesign blob
  whose STORED density is absent/invalid gets `'detailed'` (the check
  reads the stored value, not the merged value, which would mask the
  absence); a stored valid density is always honored. Custom `merge`
  sanitizes `uiPreferences` on read (`sanitizeUiPreferences`). New keys
  persist via the existing `partializeAppState` (localStorage).
- Sync audit (field by field, in code): the sync push path in
  `src/lib/supabase/sync.ts` upserts ONLY `profiles` (name/gender/
  weight/height/unit/goals/diet only), `personal_records`, `workouts`,
  `meals`, `body_metrics`, `planned_workouts`. NO `uiPreferences` or
  theme field travels in any sync payload (grep over
  `src/lib/supabase/` and `src/app/api/` found nothing). The spec's
  "EXCLUDE the new keys from the sync serializer" is trivially satisfied
  (nothing to exclude); all six keys are local-only by construction, and
  UI copy must not promise cross-device sync for them.
- New presentational components: `PageHeader`, `Section`, `Stat`,
  `EmptyState`, `SegmentedControl`, `FilterBar`, `Sheet` (unified
  modal/drawer wrapper: `.modal-content` behavior, 520 px cap, bottom
  sheet mobile / centered desktop, Escape + focus trap via
  `useModalA11y`, backdrop-tap dismiss, Android-back dismiss at
  priority 100, INSTANT close, no exit animation; must render inside
  NavigationProvider). i18n: `common.estimatedShort` added ("est." /
  "अनु."); `common.close`/`common.back` already existed.
- Stage 1 gates: vitest 1,733 passed / 20 failed (1,753 total), 122/123
  files passed (58 new tests pass); tsc clean; build passes (shared
  First Load JS 88.2 kB, unchanged); lint exit 0. Lint warning count
  found: 15 total (the baseline audit's "5" counted only the
  `t`-dependency subset); no new warnings introduced by Stage 1.
- Stage 1 test fixes (static-check pins, not weakenings):
  `tests/i18n.test.ts` unwired-file list (presentational components
  added to `EXPECTED_UNWIRED`, the list's own mechanism);
  `tests/qa4-b10-ux-hardening.test.ts` two `text-3xs` pins → `text-2xs`
  (11 px ≥ 10 px; 40 px touch-target assertions untouched).

## Stage 2 — Navigation + flows (remote `7d45870`)

- i18n: `nav.you` ("You" / "आप").
- `globals.css`: `.native-tab-bar` 4 → 5 columns; its built-in fixed
  positioning removed (the chrome wrapper in `page.tsx` now provides
  it, so the Resume bar can stack above the nav). Used only in
  `page.tsx` (verified by grep).
- `page.tsx`: 5 tabs (home/workout/progress/meals/you), "you" targets
  `profile`. `isYouTab` = profile/settings; `showResumeBar` when a draft
  exists and the user is NOT on the workout tab; chrome hidden ONLY
  when a draft exists AND the user is on the workout tab (fullscreen
  perform surface, as before) — from any other tab with a draft, chrome
  stays visible with the Resume affordance, fixing the prior trap where
  a user on Home with a draft had no nav. Mobile bottom chrome: fixed
  wrapper (`lg:hidden`) with Resume bar (`bg-bg-primary/95`, full-width
  `btn-primary`, `home.resumeWorkout` → workout tab) above the 5-item
  nav (labels always visible, 12 px). Spacer (`h-16`, when Resume bar
  shows) so the 64 px bar does not cover content; `.page` bottom padding
  already accounts for the nav.
- Desktop rail (≥1024 px only, `hidden lg:flex`): fixed left rail,
  232 px, `ASCEND` wordmark in `font-display` at 28 px, the same five
  destinations (min-height 44 px, active = `bg-accent-subtle
  text-accent`), Resume button at the bottom (`mt-auto`) when
  `showResumeBar`. Content wrapper `lg:ml-[232px]`; views' `max-w-md
  mx-auto` containers center within the remaining width. CSS/layout
  only — no route or code-split changes; modals keep the 520 px cap.
- You segmented bar: when `isYouTab`, a sticky bar above the active view
  holds a `SegmentedControl` (Profile `profile.title` / Settings
  `settings.title`, `onChange` navigates to that TabId). ProfileView and
  SettingsView were NOT modified in Stage 2 (their regrouping is
  Stage 6). `?tab=profile` / `?tab=settings` deep links keep working;
  `lastActiveTab` persists `profile`/`settings` as before; the You nav
  button lands on `profile`. HomePage header gear → `settings` and
  avatar → `profile` already existed, so with the You bar those
  shortcuts land on the right segment with no HomePage change.
- Stage 2 gates: vitest 1,733/20 (gate only); tsc clean; build passes
  (shared 88.2 kB).

## Stage 3 — Home (remote `7076f7a`)

- New component `src/components/CustomizeSheet.tsx` (Sheet-based,
  presentational): section list in current order (workout card first,
  locked), resolved visibility map, `onToggle`/`onMove`/`onRestore`
  callbacks; locked rows show a checkbox (disabled) + "Always shown"
  note; up/down buttons (disabled at ends / for locked); footer Restore
  button. The SAME sheet is reused from Settings in Stage 6.
- `WeeklyHabitMatrix` gained a `todayOnly` prop (7-day memo filters to
  `dateStr === todayStr`, header strip and rows filter together;
  defensive fallback to the full week if today is outside it;
  `rangeLabel` uses `days[days.length - 1]`, not `days[6]`).
- HomePage restructure: root `space-y-6` → `flex flex-col gap-6`
  (identical 24 px gaps); section wrappers drive visual order with CSS
  `order` (header DOM-first, workout card order 1 pinned, sections
  `10 + index*10` from the sanitized user order, Customize button
  order 1000). Hidden sections use `hidden` (no gap consumed); every
  wrapper's hidden condition combines layout `shown` with its content
  condition (an empty wrapper would otherwise still consume a gap).
  Handlers write via `setUiPreferences` on the sanitized raw layout;
  restore resets to `DEFAULT_TODAY_LAYOUT` + toast. Sheet section titles
  match visible titles exactly.
- ONE Coach section: `CoachNotesSection` (today's note, verbatim) +
  `AthleteModelCard` (Detailed: direct; Simple: behind a
  `CollapsibleDetails` labeled `customize.athleteFacts`) + quote footer
  (Detailed only). `CoachWeeklyReviewCard` alone is its own
  `weekly-review-detail` section. Note: the "weekly-review summary"
  inside Coach is realized as the notes content — no separate summary
  component exists.
- Readiness and level were SPLIT from their shared 2-col grid into
  standalone full-width cards (each with its own visibility checkbox
  and order slot); the grid's `col-span-2` ternaries were removed as
  dead code. This changes the side-by-side pair into stacked cards —
  an intentional consequence of the inventory, not an oversight.
- Sync caption under the header (near the bell cluster) via
  `useSupabaseSync()`: `syncing` → "Syncing…", `synced` → "Synced",
  `error` → "Sync failed", `offline`/`unconfigured`/`idle` → "Local
  only" (guest/no-account reads as local-only, which is true). Text
  only, never color alone. It describes cloud sync of workouts/meals/
  etc. only — never cross-device sync for the local-only keys.
- Welcome-back line under the greeting when the last workout was ≥2
  days before `todayStr` (not today, not yesterday); no workouts ever
  → new-user state, not this line. Copy: "Welcome back — last session
  [date], plan [name]. Start light?" (`WorkoutEntry.name` when present;
  date via `toLocaleDateString`, `hi-IN`/`en-US`, month short + day).
- Nutrition strip, Detailed: `fuelStats` extended with `carbs`/`fat`
  from the same `calculateMealMacros` result; Detailed only renders a
  compact sub-line ("Carbs Xg · Fat Yg", tap → Fuel). The 2-card strip
  itself is identical in both modes.
- Habit matrix density: Simple passes `compact + todayOnly`; Detailed
  passes the full week (existing `compact` prop kept in both — compact
  only hides week nav + smaller cells).
- Steps "stable slot": existing behavior kept (renders only when synced
  data exists); its position is then stable at its layout-order slot
  once it appears. No layout-shift reservation beyond that.
- New i18n keys (both locales): `home.coachSection`,
  `home.quickActions`, `home.monthlyChallenge`, `home.welcomeBack`,
  `home.welcomeBackPlan`, `home.syncSyncing`, `home.syncSynced`,
  `home.syncFailed`, `home.syncLocalOnly`, `home.carbsFat`,
  `customize.today`, `customize.restoreLayout`, `customize.alwaysShown`,
  `customize.moveUp`, `customize.moveDown`, `customize.layoutRestored`,
  `customize.athleteFacts`.
- Stage 3 gates: vitest 1,733/20 (122/123 files, gate only); tsc clean;
  build passes (shared 88.2 kB); targeted lint 0 errors + 1 pre-existing
  warning (HomePage `today` useMemo missing `todayStr` dep, untouched
  code, only line-shifted).

## Stage 4 — Workout (remote `68fac43`)

- New pure helper `src/lib/workout-mode.ts`: `resolveWorkoutMode
  (density, override)` — override wins; otherwise Detailed →
  `'advanced'`, anything else → `'beginner'`; invalid input falls back
  to the density default. Tests 3/3.
- Workout view follows density: `WorkoutPage`, `ActiveWorkoutScreen`,
  and the Settings experience row read the derived `workoutMode`,
  not the legacy store `userMode`. The legacy key is untouched in the
  store (onboarding still writes it; `profile.userMode` used by workout
  generation is a different field and untouched), but it no longer
  drives any display split. Every display split in code was already
  binary (`=== 'advanced'` vs everything else), so `'intermediate'`
  never rendered distinctly from `'beginner'`; an intermediate user on
  Detailed now sees Advanced, per the spec's density rule.
- Discoverability fix: the tools-drawer toggle ("Display Mode" +
  "Switch to Simple/Advanced") is now an Auto/Simple/Advanced
  `SegmentedControl` writing `workoutModeOverride` (`'auto'` → `null`);
  the caption shows the effective mode description plus " · Auto" when
  following density. The Settings experience row offers the same three
  options (was beginner/intermediate/advanced setting `userMode`); its
  title key `settings.experience` was kept for Stage 6 regrouping. An
  explicit override survives density switches; Auto returns to
  following density.
- In-workout history expanders (Detailed only): `ActiveWorkoutScreen`
  gained a `previousSessions` memo (mirrors
  `getLastExercisePerformance` matching: trim + lowercase, exact or
  contains either way; newest-first, sets filtered to `reps > 0`, top
  3) rendered as a `CollapsibleDetails` labeled
  `workout.previousSessions` below the Context & Target card and above
  the Beginner/Advanced sections; Simple keeps only the last-time line.
  Set format: `{weight}{unit} × {reps}` or `BW × {reps}`; date via
  `split('T')[0]`.
- "Build" vs "Train": plan creation now says "Build workout plan"
  (plan modal title, and the tools-drawer item); the modal subtitle
  already said "Build a reusable workout template". "New Plan" buttons
  and "Create My Own" empty-state CTA were deliberately left alone
  (creation CTAs, unambiguous in context).
- Verified already satisfied, no change: plan-card Start ALREADY lands
  directly on the perform surface (`handleStartPlan` →
  `ActiveWorkoutScreen`, no editor interstitial; detail-view Start does
  the same); draft restore ALREADY toasts on resume. The decision docs'
  "plan → logger → perform" path description refers to the pre-fill
  state mechanism, not a visible compose screen.
- Deferred to the parent-run visual phase (NOT silently dropped):
  rest-timer docked placement (moving the floating button without
  browser verification risks covering controls) and the finish-flow
  summary-first change (a flow change; the task scopes active workout
  to styling only).
- Perform styling, no logic touched: all 10 arbitrary `text-[10px]`
  sites in `ActiveWorkoutScreen` + 1 in `WorkoutPage` bumped to the
  11 px floor (`text-2xs`); logging, calculations, RPE/RIR, rest-timer
  logic, draft recovery untouched. The dead `toggleUserMode`
  destructure in `ActiveWorkoutScreen` was left in place as out of
  scope. SetRow/SetTable were NOT extracted — existing rows kept (see
  Deviations).
- New i18n keys (both locales): `workout.previousSessions`,
  `workout.viewMode`, `workout.viewAuto`, `workout.viewSimple`,
  `workout.viewAdvanced`.
- Stage 4 gates: vitest 1,736/20 (124 files, 123 passed, gate only);
  tsc clean; targeted lint 0 errors + 4 pre-existing `t`-dependency
  warnings (untouched code). Test fix (static-check pin, not a
  weakening): `tests/ux-discoverability.test.ts` pinned
  `{userMode === 'advanced' && (activePolicyDecision` → updated to
  `{workoutMode === 'advanced' && (activePolicyDecision` (same gate,
  new derivation).

## Stage 5 — Progress + Nutrition (remote `e3f4ff2`)

- New pure helper `src/lib/spotlight.ts`: `SpotlightChartId = 'e1rm' |
  'volume' | 'weight' | 'consistency' | 'big3'`; `goalDefaultChart(goal)`
  — `get_stronger` → `e1rm`, `build_muscle` → `volume`, `lose_fat` →
  `weight`, `stamina`/`general_fitness`/anything else → `consistency`;
  `resolveSpotlightChart(goal, pinned)` — a pinned id in the list wins,
  otherwise the goal default (null/invalid pin → goal default).
- Powerlifting decision (conservative): there is NO powerlifting value
  in the app's `AthleteGoal` enum (`'build_muscle' | 'get_stronger' |
  'lose_fat' | 'stamina' | 'general_fitness'`), so the spec's
  powerlifting → big-three selector ships as a PIN option only, never
  as a goal default. No goal was invented to fill the slot.
- ProgressPage part 1: module helpers (`ChartRange`,
  `readPersistedRange` — localStorage key `ascend-progress-ranges`,
  SSR-guarded, invalid → fallback; `dataWindow`; `minMaxLabel`);
  range initializers changed to lazy persisted reads (`strength` /
  `body`, default `'3M'`); persist effect writes `{strength, body}` on
  change (local-only, never synced); header reconciliation: the
  strength-overview header branch changed from `t('progress.title')`
  to `t('progress.strength')`, so the header always shows the active
  segment name. Analytics card frame: e1RM path gained
  `strokeDasharray="6 3"` (estimated = dashed); readout number wrapped
  with a `common.estimatedShort` badge; legend + min-max row added.
  Body card frame: legend + min-max row added; weight line stays solid
  (measured encoding). `userUnit` is `profile?.unit || 'lbs'`.
- ProgressPage part 2 — spotlight zone replacing Card 1 (hero chart
  card): nested ternary (`volume` → `MuscleVolumeSection` or, when
  `uiPreferences.showMuscleVolume === false`, an `EmptyState` card with
  action `setUiPreferences({showMuscleVolume: true})`; `consistency` →
  `WorkoutHeatmap onNavigate={onNavigate}`; `weight` → clickable weight
  card → Body tab, or `EmptyState` (log-measurement action) when no
  data; `big3` → card with `SegmentedControl` lift picker + dashed e1RM
  SVG + legend/window, or `EmptyState` (start-workout action);
  default `e1rm` → the existing hero card reframed (question title,
  lift name + est. badge sub-row, "Current 1RM" caption, dashed path,
  legend + window rows, click → analytics preserved), or `EmptyState`
  (start-workout action) when truly empty) + a pin-control card below
  (label `progress.pinChart`, native select `id="spotlight-pin"`,
  value `pinnedProgressChart ?? 'auto'`, auto + five chart options,
  onChange writes `null` for auto else the id). The pin select is
  OUTSIDE any clickable card (no nested-interactive problem); the big3
  card has no card-level onClick (its selector buttons forbid it).
  Empty-state conditions: e1rm shows `EmptyState` only when
  `dataPoints` is empty AND `latest1RM` is null (a PR-only user keeps
  the existing card with the PR number + SVG empty text); weight shows
  `EmptyState` only when `dataPoints` is empty AND `latestWeight` is
  null (profile-weight fallback counts as data); big3 shows
  `EmptyState` when `dataPoints` is empty (no PR fallback for big3).
  Gradient ids in the fragment are fresh (`spotWeightGradient`,
  `spotBig3Gradient`); the hero gradient id `strengthGradient` is kept
  (the old hero card is replaced, not duplicated).
- Goal change clears the pin with a toast: `prevGoalRef` + effect clears
  `pinnedProgressChart` + `toast.info(t('progress.spotlightReset'))`
  ONLY when the goal actually changes (mount does not clear, since the
  ref starts at the current goal).
- Progress URL mapping verified in code (untouched):
  `ProgressPageProps.initialTab` accepts `'overview' | 'strength' |
  'prs' | 'bodyweight' | 'training' | 'body' | 'consistency'`;
  `resolvedInitialTab` maps bodyweight/body → body,
  training/consistency → consistency, else strength;
  `strengthSubView` starts at `'records'` when `initialTab === 'prs'`;
  the URL-sync effect maps body → `bodyweight`, consistency →
  `training`, records → `prs`, strength → deletes `sub`, and persists
  via `setLastActiveTab('progress', navSub)`. All five `?sub=` values
  land on distinctly labeled screens. The only display change for
  reconciliation is the overview header title (above).
- MealsPage chips (both expanded meal-list rows, today + history,
  exactly 2 qty-span sites): unmatched → amber chip
  `meals.notInDbShort`; approximate → amber `common.estimatedShort`
  badge with `aria-label` = full `meals.estimatedFrom` text (full
  provenance stays one tap away in the edit form, which names the
  entry); otherwise (including undefined flag, same rule as the form)
  → subtle emerald `meals.exactChip`. Scan/manual/barcode already land
  on the same meal list via the shared `ScanMealModal`/
  `BarcodeScannerModal` (rendered by both HomePage and MealsPage). Do
  NOT invent a voice meal path: grep found NO voice meal entry anywhere
  (voice is workout-only: `VoiceWorkoutLoggerModal`); the voice gap is
  recorded, not invented. Note: the existing `meals.notInDb` value is
  the LONG string "Not found in offline database — enter custom macros
  below" (too long for a list-row chip, hence the short key; the long
  string stays in the edit form).
- New i18n keys (both locales): `progress.spotQuestionE1rm`,
  `progress.spotQuestionWeight`, `progress.spotQuestionBig3`,
  `progress.chartE1rm`, `progress.chartVolume`, `progress.chartWeight`,
  `progress.chartConsistency`, `progress.chartBig3`,
  `progress.pinChart`, `progress.spotlightAuto`,
  `progress.spotlightReset`, `progress.legendEstimated`,
  `progress.legendMeasured`, `progress.spotVolumeOffTitle`,
  `progress.spotVolumeOffHint`, `progress.spotVolumeOffAction`,
  `progress.spotEmptyE1rmHint`, `progress.spotEmptyWeightHint`,
  `progress.spotEmptyBig3Hint`, `meals.notInDbShort`, `meals.exactChip`.
- Stage 5 gates: vitest 20 failed, 1 failed file (gate only), 124/125
  files passed; tsc clean; lint on changed files 0 errors + 2
  pre-existing MealsPage warnings (untouched code); `git diff --check`
  clean. Test fix (code fix, not a test weakening):
  `tests/qa4-b10-ux-hardening.test.ts` pins two plain-English glosses
  including 'Current 1RM (your estimated best single lift)'; the
  spotlight e1RM card had dropped the hero caption, so the caption span
  was RESTORED verbatim under the hero number (gloss + est. badge
  coexist).

## Stage 6 — Settings + Personalization (remote `e4575be`)

- New component `src/components/ThemePicker.tsx` (presentational):
  props carry preset definitions, selection, custom hex, and callbacks
  only — no contrast math, no store writes, no persistence logic.
  Renders: swatch grid (six presets, selected = accent ring + check,
  each swatch labeled with its name for screen readers, never color
  alone); custom hex input + preview panel (current appearance mode
  only: primary button, secondary button, selected chip, accent-text
  sample line, focus-ring demo button) + corrected-shade note + Reset
  button. Contrast data arrives as the audit-supplied `previewNote`
  string; the component renders it.
- SettingsView regroup (whole JSX blocks moved verbatim into the 4 IA
  sections, renumbered): S1 Account & Security; S2 Appearance &
  Personalization; S3 Training Preferences; S4 Data & Privacy. S1 =
  account card WITHOUT the sign-out row + NEW methods card (below).
  S2 = Display sub-block (appearance mode Chalk/Graphite/System +
  text size, both verbatim) + Personalization sub-block (ThemePicker +
  density SegmentedControl + Customize Today row → same
  CustomizeSheet). S3 order, chosen so every block's own divider is
  correct with ZERO block edits: Weekly target (no divider, first) →
  Weekly schedule → Units → Language → Diet → Experience →
  Notifications → Gamification → Coach → Habit matrix → Muscle volume
  → Health Connect (conditional). S4 = Data & Privacy verbatim.
  Section chips retargeted to the 4 IA labels and restacked below the
  You bar (`sticky top-14 z-20`, was `sticky top-0 z-30` — a Stage 2
  follow-up fix, since the sticky You bar + sticky chips overlapped);
  section `scroll-mt-20` raised to `scroll-mt-28` so jump links clear
  both bars. ProfileView untouched — it already matched the IA
  (identity hero, quick metrics, sharing, log out).
- "Exactly three controls" reading, recorded: the three PERSONALIZATION
  controls are accent/density/dashboard cards; display controls
  (appearance mode, text size) are separate pre-existing rows in the
  same section, not counted among the three — matching the spec's own
  treatment of mode as "separate, existing", extended to text size
  (also separate, existing, display-family). Training Preferences is
  the home for schedule/target/experience/units/language/diet/
  notifications + feature toggles + Health Connect (IA line 68 lists
  schedule/target/experience/units/language; diet and notifications
  placed here as the natural family; toggles kept out of
  personalization per the spec).
- Accent wiring (closes the Stage 1 runtime gap): `page.tsx` gained an
  effect after the theme-class effect: accent selection + light/dark
  mode → `resolveAccentVariant(...)` → `accentVariantToCssVars` →
  `applyAccentVars`, re-applied on selection/mode change, guarded by
  hydration flags. An accent pick NEVER calls `setTheme` and never
  touches `hasCustomTheme` (pinned by test). SettingsView holds
  `draftHex` state (initialized from committed custom hex when
  `accentTheme === 'custom'`), `normalizedDraft` via `normalizeHex`,
  `customError` (non-empty invalid draft → `settings.customAccentInvalid`),
  `customDerived` via `deriveCustomAccent(draft, mode)`,
  `customPreview`/`customPreviewNote` (localized via
  `settings.customAccentAdjusted` with `{shade, entered}`; the lib's
  English `correctedNote` is used only as a non-null signal). Handlers:
  preset select → `setUiPreferences({accentTheme: id})` (immediate
  restyle); custom Apply → `setUiPreferences({accentTheme: 'custom',
  customAccentHex: normalizedDraft})` (no toast; restyle is the
  feedback); Cancel → draft reverts to committed custom hex or empty;
  Reset → `setUiPreferences({accentTheme: 'vermilion',
  customAccentHex: null})` + `toast.info(settings.themeResetMsg)`
  (scoped: theme keys only, never density/layout/mode — pinned by
  test).
- CustomizeSheet in Settings: same sheet as Today (same section list
  with identical titles + same handlers on the sanitized raw layout +
  same restore toast). No second sheet exists.
- Auth canonicalization, presentation only: sign-out row + its confirm
  modal + `handleExecuteSignOut` + `showLogoutConfirm` state + `LogOut`
  import + `logout` selector + `signOut` destructure all REMOVED from
  SettingsView (Profile owns log out per IA; the action itself is
  untouched in ProfileView). Account & Security gained a methods block:
  title `settings.accountMethods`; current method via
  `AuthUser.provider` (`google` → Google, `apple` → Apple, `email` →
  Email & password, anonymous → Guest; guest/null user →
  `settings.guestMethodNote` + sign-in button opening the existing
  AuthModal); caption `settings.supportedMethods` lists all five engine
  methods. NO new auth UI was built: Apple/OTP/email forms have no
  in-app surface (engine-only; LoginScreen in onboarding offers
  email/password + Google; AuthModal offers Google only) — building
  in-Settings sign-in forms would be a new auth surface beyond
  "presentation-only", so it is flagged for user decision (see
  Approvals needed), not silently built or faked. Auth logic, methods,
  and security behavior unchanged.
- New i18n keys (both locales, 36): `settings.appearancePersonalization`,
  `settings.trainingPreferences`, `settings.accentTheme`,
  `settings.accentVermilion/Cobalt/Forest/Plum/Teal/Rose`,
  `settings.customAccent`, `settings.customAccentHint`,
  `settings.customAccentInvalid`, `settings.customAccentAdjusted`,
  `settings.applyTheme`, `settings.cancelTheme`, `settings.resetTheme`,
  `settings.themeResetMsg`, `settings.previewPrimary/Secondary/Selected/Text/Focus`,
  `settings.density`, `settings.densitySimple/Detailed`,
  `settings.densityHint`, `settings.accountMethods`,
  `settings.methodGoogle/Apple/EmailPassword/EmailLink/Guest`,
  `settings.signedInWith`, `settings.guestMethodNote`,
  `settings.supportedMethods`, `settings.customizeTodayHint`. Removed
  as dead (SettingsView-only): `settings.appPreferences`,
  `settings.customization`, and `settings.signOut`/`signOutTitle`/
  `signOutMsgUser`/`signOutMsgGuest` (4 keys, both locales; ProfileView
  uses `profile.logout*`, AuthModal uses `auth.signOut`).
- Stage 6 gates: vitest 20 failed, 1 failed file (gate only) after the
  test fixes below; tsc clean; build passes (shared First Load JS still
  88.2 kB); targeted lint 0 errors; `git diff --check` clean. Test
  fixes (static-check pins, strengthened not weakened):
  (1) `tests/i18n.test.ts` `wiredKeys` pinned `settings.customization`
  (a section label that no longer exists) — replaced with the two new
  section labels (both exist in both locales, both Devanagari in
  Hindi). (2) `tests/settings-profile.test.ts` "renders all preference
  controls and sections" pinned 'App Preferences' — replaced with the
  new labels plus the new controls ('Appearance & personalization',
  'Training preferences', 'Accent theme', 'Information density',
  'Customize Today'); the rendered-HTML failure dump in that run
  confirmed the whole regroup renders correctly (all 4 sections, 6
  swatches with correct colors, density control, methods block,
  training rows). New test file `tests/ux-redesign-stage6.test.ts`:
  8/8 pass.

## Stage 7 — Onboarding + remaining screens (remote `2b7c4e0`)

- NEW `src/components/onboarding/SummaryScreen.tsx` (presentational):
  shown after the plan offer (or directly after details when no plan
  was generated) and before the tabs. Rows restate STORED choices only
  — goal (canonical `ATHLETE_GOAL_CONFIGS` label via
  `resolvePrimaryGoal(profile?.goals)`), level
  (`settings.modeBeginner/Intermediate/Advanced` from
  `trainingProfile.experience`), training days
  (`trainingProfile.daysPerWeek ?? 4`, formatted via
  `onboarding.summaryDaysValue`), diet
  (`settings.dietVegetarian/Eggetarian/NonVegetarian/Vegan` from
  `profile.dietPreference ?? 'non_vegetarian'`, noting the type value
  is `eggitarian` with that spelling), injuries
  (`trainingProfile.injuriesOrLimitations ?? []`, or
  `onboarding.summaryNoInjuries` when empty). Continue button →
  existing `completeOnboarding()` (toast + navigate home); edit button
  → new `handleSummaryEdit` (same welcome toast + navigate `'settings'`
  with `clearHistory`, landing on You → Settings where Training
  Preferences holds the editors). NO back button by design: edits
  happen after tabs, per the decision. Profile is already applied
  before the summary in all paths, so the summary reads the store.
  `OnboardingScreenId` gained `'summary'` and the `?screen=` allowlist
  gained `'summary'`. All three completion paths now route through the
  summary: `handleAcceptPlans`, `handleDeclinePlans`, and the no-plan
  else branch (previously `completeOnboarding()` directly). Direct
  `?screen=summary` without a profile degrades to honest defaults
  (goal default, diet default, days 4, no injuries) rather than
  crashing. Goal labels come from `ATHLETE_GOAL_CONFIGS` (same labels
  the goals screen shows, so the summary matches what the user picked).
- Guest path promoted: WelcomeScreen's "Discreet Guest Access Option"
  (small underlined link) replaced with a labeled first-class button
  (same classes as the account button) labeled
  `onboarding.continueAsGuest` ("Continue as Guest") + caption
  `onboarding.guestNote` ("No account needed — your data stays on this
  device.").
- Plan-offer Skip visually equal to Accept — reading recorded: equal
  size + weight + button treatment. Accept stays `bg-text-primary
  text-bg-primary font-bold`; Decline changed from `bg-transparent
  border-2 border-text-primary/20 font-semibold` to `bg-bg-card border-2
  border-border font-bold`, so both are `w-full py-4 px-6 rounded-2xl
  font-bold text-base` full buttons; Skip is a solid secondary, not a
  ghost link. Pinned by test (both buttons' geometry/weight classes
  asserted; Skip asserted not underlined).
- Password rule visible before submit: persistent hint under the
  password field in CreateAccountScreen using the existing key
  `auth.passwordLength` ("Password must be at least 8 characters
  long."), not only the placeholder ("At least 8 characters") and the
  post-submit error. The key exists in both locales (Hindi verified).
- Typography tokens on step titles: Welcome hero → `display-title`
  (keeping `leading-tight`); goals/experience/schedule/details/
  plan-offer h1s (`text-2xl sm:text-3xl font-extrabold tracking-tight`)
  → `page-title`; PRsPage h1 dropped redundant utilities
  (`display-title font-display uppercase tracking-tight text-2xl
  sm:text-3xl text-text-primary` → `display-title uppercase`) so the
  token sizes apply (utilities in the utilities layer previously beat
  the components-layer class). Goal/level one-line explanations already
  existed (verified in FitnessGoalsScreen and ExperienceLevelScreen,
  not re-added); injury optional-by-default preserved (PR #43
  untouched).
- New i18n keys (both locales, 12): `onboarding.summaryTitle/Subtitle/
  Goal/Level/Days/DaysValue/Diet/Injuries/NoInjuries/Continue/Edit`,
  `onboarding.guestNote`.
- "Remaining screens styled to the system" scope decision: onboarding
  screens got the typography pass; other screens already received
  Stage 1 token migrations (label floor, accent-on) and share card/
  button classes; a full restyle of remaining screens without visual
  verification was judged riskier than valuable and is recorded as
  visual-phase follow-up, not silently claimed done.
- Stage 7 gates: vitest 20 failed, 1 failed file (gate only), 126/127
  files passed; tsc clean; Stage 7 tests 7/7; lint on changed files 0
  errors + pre-existing warnings only (verified by stashing: pre-change
  Onboarding.tsx already carried the `t`-dep warnings);
  `git diff --check` clean.

## Stage 8 — Animations (remote `ed454e5`)

- Removed ALL `animate-pulse` (17 sites) + `animate-ping` (3 halos) +
  dead `animate-bounce-subtle` (1 site, no keyframe ever defined it —
  removal is a no-op visually): pulsing badges, shimmer TabSkeleton
  root (now static blocks), splash indicator + ping dot, rank badge,
  offline/sync/policy/current dots, scan line, recording dots,
  rest-running button pulse, QR/macro loading pulses, analyzing ping
  ring, post-workout loading container pulse. Static meaning preserved
  everywhere (dot colours, labels, countdown text stay).
- `animate-spin` KEPT only on in-flight operation indicators (button
  spinners, loading screens, analyzing states): the operation's own
  feedback, never over content. The spec's ban is read as "no rotating
  loaders OVER content" + "no pulsing badges/shimmer" — spin during an
  operation is neither.
- Kept verbatim: exactly the 4 tailwind keyframes at spec durations
  (fadeIn 0.25 s, tabEnter 0.22 s, slideUp 0.25 s, scaleIn 0.2 s, all
  ease-out — verified in `tailwind.config.js` lines 112–135); 150 ms
  press feedback (`duration-150` everywhere in globals); Sheet instant
  close via shared `.modal-content` (`animate-slide-up` enter only,
  globals lines 335–340); global `prefers-reduced-motion` rule
  (globals lines 396–404: animation + transition duration 0.01 ms,
  iteration 1, scroll auto) — already comprehensive, nothing to extend.
- Splash fade 500 ms → 300 ms to sit inside the transition band (the
  only non-data transition outside 180–320 ms found).
- Recorded readings / deviations (flagged, not silently skipped):
  (a) Data-bar width transitions (macro rings, volume/level/challenge/
  hydration fills, `duration-500`/`duration-700`, 15+ sites) are KEPT
  as single-run value displays under the same "data, not decoration"
  rationale as the spec's own rest-timer exception — converting them to
  scaleX without visual verification risks regressions, and the task's
  tiebreaker is the most conservative reading that preserves behavior.
  Phase 11/12 should confirm or convert. (b) NO rest-timer bar element
  exists in this codebase (verified: no width/style tied to
  `restSecondsLeft`/`restTotalSeconds`; the rest UI is a numeric
  countdown + floating button + popover controls), so the spec's
  premise ("existing progress bar uses a 500 ms ease-out transition —
  implementation changes it to linear") does not apply and there is
  nothing to linearize; the numeric countdown is already authoritative,
  as the spec requires. The `.level-bar-fill` 500 ms ease-out (globals
  line 286) is the LEVEL bar, not the rest timer — left untouched.
  (c) No animated counting exists (only a camera-scan
  `requestAnimationFrame` loop in BarcodeScannerModal, which is
  detection, not a counting animation).
- Stage 8 gates: vitest 20 failed, 1 failed file (gate only), 127/128
  files passed; tsc clean; Stage 8 tests 5/5; lint on changed files 0
  errors + 5 pre-existing warnings (ActiveWorkoutScreen `t`-deps,
  BarcodeScannerModal `stopCamera`, ScanMealModal `t` — all untouched
  code); `git diff --check` clean. Test fixes (test-side assumptions,
  not weakenings): Sheet enters via `.modal-content` CSS, not the
  `animate-slide-up` utility in the component file; the CSS assertion
  looks for the `animate-slide-up` utility inside the `.modal-content`
  block, not the literal keyframe name `slideUp` (which lives only in
  tailwind config).

## Stage 9 — Accessibility + Responsive (remote `7f55c89`)

- Audits completed (findings): focus — inputs/textarea/select already
  have visible focus (`focus:border-accent focus:ring-1 focus:ring-accent`,
  globals ~139–145, plus 16 px font rule against iOS auto-zoom);
  buttons/links lacked a consistent focus style. Fonts / mixed-script
  Barlow — code-level check PASSES: `layout.tsx` loads Inter (latin),
  Barlow Condensed (`--font-display`), AND Noto Sans Devanagari
  (`--font-devanagari`, devanagari subset, `display: swap`,
  `preload: false`); all three variables are applied on `<body>`. The
  fallback chain is intact (Latin → Barlow Condensed; Devanagari glyphs
  fall through to Noto Sans Devanagari since Barlow lacks them). Visual
  coherence of condensed Latin + regular Devanagari side by side still
  needs eyes — owed to the parent-run visual phase, NOT decided in code
  (the decision reserves Inter-only fallback for the live check).
  Text scale — `src/lib/text-scale.ts`: normal = browser default 16 px,
  large = 112.5%, xlarge = 125% root; almost all type is rem-based so
  the whole UI scales. At 390 px viewport + xlarge: content width
  ≈ 390 − 2×25 px scaled padding = 340 px; fixed `w-56` (224 px → 280 px
  scaled) fits; bottom-nav labels have no truncation/overflow-hidden
  so they wrap rather than clip. Code-level pass; true 390 px + xlarge
  visual check still owed to the parent-run phase. Charts — all
  ProgressPage SVGs use `viewBox` + `w-full` (fluid, e.g.
  `viewBox="0 0 320 110"`), so no fixed-320 px overflow at 320 px
  viewports. `overflow-visible` on SVGs lets labels extend slightly by
  design, not breakage. Modal stack — `use-modal-a11y` is used by
  ActiveWorkoutScreen, AuthModal, BarcodeScannerModal, BlockDebriefModal,
  BodyMetricsModal, ChallengesSheet, CoachBlockModal,
  CoachWeeklyReviewModal, ConfirmationModal, ConstraintAdapterModal,
  and more; `tests/modal-a11y.test.ts` exists and passes; no modal
  rework in Stages 5–8 touched it, so semantics are preserved by
  non-disturbance.
- Touch targets DONE: mechanical rule in tsx — `min-h-[40px]` →
  `min-h-[44px]` and `min-w-[40px]` → `min-w-[44px]`, in 34 files (close
  buttons everywhere, submit buttons, rest controls, shared `ui/Button`
  `sm` size variant and `icon` variant); `w-10 h-10` → `w-11 h-11` for
  ActiveWorkoutScreen lines 1913 (delete), 1934 (pause), 1983, 2500
  (set pill), 2519 (add-set), 2987 (pill), 3999 (rest control); HomePage
  quick-action buttons (646/655/664); WorkoutPage back buttons
  (2061/2077/2087); WorkoutDetailsView back buttons (96/111/121/131);
  ForgotPasswordModal close (58); `ui/Button` icon variant. EXCEPT two
  ActiveWorkoutScreen row-container divs deliberately left at 40 px
  (lines 2886, 2932 — containers, not buttons; bumping them would
  change row density without fixing any button target). Remaining
  `w-10 h-10` sites that are NOT buttons stay untouched (icons/divs in
  ActiveWorkoutScreen, LogPastWorkoutModal, MealsPage,
  PolicyDecisionLedger, WorkoutPage). Correction to the earlier scope
  note: RPE pills and the skip-set chip DID go to 44 px via the
  mechanical rule (their QA4-015 pins were bumped accordingly); the
  sub-44 secondary controls that remain are section chips (SettingsView
  `py-1.5` ≈ 30 px), filter pills, and heatmap filter tabs — primary
  controls are at 44 px; chips/pills stay, flagged for Phase 11 to
  re-examine if tap-throughs show misses. (WCAG 2.2 AA minimum is
  24×24; 44 px is the spec's own enhanced target.)
- Focus rule ADDED to globals.css: `button:focus-visible`,
  `a:focus-visible`, `[role='button']:focus-visible`,
  `[role='switch']:focus-visible` → `outline: 2px solid var(--accent);
  outline-offset: 2px`. Inputs/selects/textarea are deliberately
  excluded (they already carry their own ring; the global rule would
  triple-indicate).
- Contrast audit EXTENDED to every use (Stage 1 covered preset token
  values + custom derivation; Stage 9 covers uses, in
  `tests/ux-redesign-stage9.test.ts`): (a) focus ring = accent vs page
  background ≥3:1 (UI-only use); (b) selected-state chip = accent-text
  label on accent-subtle background ≥4.5:1 — computed by blending the
  subtle wash over the page background (preset subtles are opaque
  tints, e.g. vermilion light `#FDF1EE`, used as-is; custom subtles are
  rgba washes, blended); (c) chart series — accent never the sole
  carrier (Stage 5 covered spotlight/analytics/body; Stage 9 checked
  MuscleVolumeSection (rows carry muscle names + set counts + prev-week
  numbers as text) and WorkoutHeatmap (see below)); (d) the 5 custom
  cases extended to the same uses. **ZERO failing rows ship.**
- Audit findings that required corrections (not threshold weakenings):
  (1) Chip blend shift: text stepped against the page background only
  could drop below 4.5:1 on its own wash (vermilion: 4.66 on chalk →
  4.49 on its wash; very-dark-navy custom 4.08; mid-grey custom 3.95).
  Fix in `deriveCustomAccent`: after the page-background step, step
  text further in the SAME direction until it also passes against the
  blended wash (stepping further only improves the page-background
  ratio). (2) Near-background custom hexes: `#F5EFE0` (focus ring
  1.01 in light mode) and `#FFEB00` (1.08) fail the UI pairing because
  the light variant IS the requested hex. Fix: new lib gate
  `isCustomAccentUsable(hex)` (light-background ratio ≥3:1; the dark
  variant is brightened until ≥3:1 by derivation, so only the light
  pairing needs the gate); SettingsView shows inline error
  `settings.customAccentTooClose` and a null preview, which blocks
  Apply (Apply is disabled when `!preview`). A failing hex never
  reaches the store, and the user's chosen accent is never silently
  changed — rejection was chosen over auto-darkening the accent
  because it preserves the derivation behavior for all accepted inputs
  (the more conservative reading). Preset rows all pass unchanged.
- Heatmap text equivalent: the 4 habit dots had no text equivalent
  (color + fixed order only, no legend). Fix: each calendar cell button
  now carries `aria-label` via new key `heat.cellSummary` ("{date}:
  {done} of 4 habits done" / "{date}: 4 में से {done} आदतें पूरी");
  tapping a cell already showed the text detail panel. The filter tabs
  (All/Gym/Water/Creatine/Protein, icon + text) let the user isolate
  one habit.
- Desktop rail split-regression check: `npm run build` passes; tabs
  still `dynamic()` code-split imports in `page.tsx` (ProgressPage,
  WorkoutPage, MealsPage, ProfileView, SettingsView, ImportProgramModal);
  modal cap still 520 px (`.modal-content max-w-[520px]`, Sheet cap).
- Stage 9 gates: vitest 1,784 passed / 20 failed (1,804 total), 128/129
  files passed, 20 = gate only; tsc clean; build passes; lint on
  changed files 0 errors; `git diff --check` clean; modal-a11y tests
  pass. Test fix (static-check pins, STRENGTHENED not weakened):
  `tests/qa4-b10-ux-hardening.test.ts` QA4-015 pinned exact 40 px
  strings for shared Button sm, VoiceWorkoutLoggerModal steppers,
  ActiveWorkoutScreen header buttons, and modal X closes — all bumped
  to 44 px (12 sites: names, pinned strings, comments). The describe
  title "≥40px" still holds (44 ≥ 40). The `.tap-40` utility itself
  (exactly 40 px) is untouched — it is a utility, not a button.

## Stage 10 — Verification + coherence (this stage)

- Primary-action audit, BOTH modes (zero expander opens for main
  actions): Today — workout-card Start/Resume is a direct full-width
  button (HomePage ~722), not inside any expander; the only
  `CollapsibleDetails` on Home are supplementary (card `home.details`,
  `home.why` ×2, Simple-only `customize.athleteFacts` — informational,
  not a primary action). Train — plan Start lands directly on the
  perform surface (Stage 4 verified); the view-mode control
  (Auto/Simple/Advanced) makes Advanced inputs reachable from Simple.
  Progress — spotlight chart + pin select directly visible (the pin is
  a select, not an expander). Fuel — meal list + add/scan buttons
  directly visible; scan/manual/barcode land on the same list. You —
  Settings personalization controls directly visible (no
  `CollapsibleDetails` in SettingsView); log out directly visible in
  Profile. Onboarding — Continue/Edit on the summary screen directly
  visible; no step hides its primary action behind an expander. Active
  workout — set logging available in both Beginner and Advanced
  branches; history expanders (Detailed only) are supplementary.
  Pinned by `tests/ux-redesign-stage10.test.ts` (Home expander-label
  inventory + SettingsView no-expander assertion).
- Auth-flow line-by-line diff (`3a29409..HEAD`): the only auth-adjacent
  files touched are `AuthModal.tsx`, `onboarding/LoginScreen.tsx`,
  and `RunSessionScreen.tsx` (matched on the filename, not auth). After
  filtering class-string changes (text sizes, widths, accent tokens),
  the diff contains ZERO non-styling lines. Auth logic, methods, and
  security behavior are unchanged. SettingsView's sign-out removal is
  ownership-only (ProfileView's action untouched); the methods block is
  read-only display + the existing AuthModal opener.
- Chart axis/unit/date re-verification against real data: hero, body,
  and big3 charts all convert via `userUnit` (`profile?.unit ||
  'lbs'`, lbs/kg with unit labels in deltas); x-axis dates via
  `formatProgressDate` (`dataWindow`); ranges shown + persisted per
  chart (below); legends distinguish measured (solid) vs estimated
  (dashed + "est." badge, never color alone); volume rows carry muscle
  names + set counts + prev-week numbers as text; heatmap month counts
  + cell summary labels are text. Nuance recorded, not a failure: the
  volume section title is descriptive ("Muscle volume" + "sets this
  week"), not a question — the spotlight e1RM/weight/big3 titles ARE
  questions; Phase 11/12 may confirm the volume title or rephrase it.
- Filter-persistence checks: strength/body ranges persisted per chart
  in `ascend-progress-ranges` (local only, SSR-guarded, invalid →
  fallback); spotlight pin persisted in the store (cleared on goal
  change with toast); **gap found and fixed**: the big-three lift
  selection reset to Squat on every visit. Fix: lazy init reads
  `ascend-progress-ranges.big3` (validated against the three lifts,
  fallback Squat, SSR-guarded) and the persist effect now writes
  `{strength, body, big3}`. Placement note: the effect sits BELOW the
  big3Lift declaration because a deps array evaluates during render
  and may not reference a later const (TDZ) — an earlier placement
  above the declaration was caught and moved before commit, not after
  a runtime failure. Pinned by Stage 10 tests.
- PR-derivation single-source check: PRs come from one store source
  (`prs` via `useStore`, persisted via `savePRs`/`getPRs` in
  `src/lib/storage.ts`); e1RM comes from one function
  (`calculateOneRepMax` in `src/lib/strength-standards.ts`, used by
  both the hero and big3 computations); history comes from one
  function (`getExerciseHistorySessions` in `src/lib/lifter-twin.ts`).
  No second e1RM formula exists in ProgressPage (no Brzycki constants
  inline). Pinned by Stage 10 tests.
- 18-task regression mapping (brief's named tasks): onboarding ✓
  (Stage 7); start/resume ✓ (Stages 2/4); set recording ✓ (logic
  untouched, Stage 4 styling only); plan/weekly review ✓ (Stages 3/4);
  settings/personalization ✓ (Stage 6); progress/chart exploration ✓
  (Stage 5); nutrition scan/manual ✓ (Stage 5; voice meal path does
  not exist — recorded, not invented); cross-tab navigation ✓
  (Stage 2, deep links preserved); modal/error/empty/offline states ✓
  (Sheet, EmptyState, sync caption, offline banner); keyboard+focus ✓
  (Stage 9); responsive widths ✓ (Stage 9 code checks; visual checks
  owed to parent-run phase); dark-mode consistency ✓ (presets × 2
  modes audit, Stages 1/9); performance/bundle ✓ (shared First Load JS
  88.2 kB unchanged across Stages 1–6 builds; Stage 10 build passes);
  data-integrity/persistence ✓ (store sanitize/migrate tests,
  localStorage ranges, local-only keys); multi-persona task
  re-verification — NOT done here (that is Phase 11's job, explicitly
  out of this phase); visual consistency ✓ (tokens applied globally,
  Stage 1; full visual pass owed to parent-run phase); accessibility ✓
  (Stage 9). Remaining named items (plan offer, guest path, summary
  screen) are covered under onboarding.
- Stage 10 gates: vitest 1,788 passed / 20 failed (1,808 total), 129/130
  files passed, the 20 failures ONLY in
  `tests/security-integration-gate.test.ts` (known Supabase/Docker
  gate); tsc clean exit 0; build passes (shared First Load JS 88.2 kB,
  unchanged from baseline); lint exit 0 with the same 15 pre-existing
  warnings (the stage spec's "5" was the baseline audit's undercount —
  Stage 1 established 15 total, all in untouched hook code, 0 errors);
  `git diff --check` clean. Stage 10 tests 4/4
  (`tests/ux-redesign-stage10.test.ts`).

## Deviations from the decision docs (complete list, with reasons)

1. Sheet exists and is the convergence point for NEW surfaces, but the
   ~36 existing modals were NOT migrated to it. Migrating them without
   visual verification could break the app; existing modals keep their
   proven chrome until migrated one by one with visual verification.
   The gate that holds either way is stack semantics preserved
   (`use-modal-a11y` untouched, tests pass).
2. SetRow/SetTable were NOT created as unused components (that would
   violate "nothing unnecessary"); the decision is to extract them in
   Stage 4 only if the perform-surface refactor allows a clean
   extraction — it did not, so existing rows were kept.
3. ThemePicker was deferred from Stage 1 to its wiring stage (Stage 6,
   as planned in the stage notes); CustomizeSheet was moved FORWARD to
   Stage 3, since Today customization is Stage 3's core.
4. Readiness/level split from a 2-col grid into stacked full-width
   cards (inventory consequence: each needs its own visibility
   checkbox and order slot).
5. "Weekly-review summary" inside Coach is realized as the notes content
   — no separate summary component exists.
6. Steps "stable slot" keeps the existing conditional render (appears
   only with synced data); no layout-shift reservation beyond its
   stable order position.
7. Powerlifting → big-three selector ships as a PIN option only (no
   powerlifting value exists in `AthleteGoal`; no goal invented).
8. No voice meal path exists (voice is workout-only); not invented.
9. "Exactly three controls" in Appearance & Personalization counts
   accent/density/dashboard cards only; appearance mode and text size
   are separate pre-existing display rows in the same section.
10. No new in-Settings sign-in forms (Apple/OTP/email have no in-app
    surface today; building them is a new auth surface — needs user
    decision, see Approvals needed).
11. Onboarding got a typography pass; other screens got Stage 1 token
    migrations; a full restyle of remaining screens without visual
    verification was judged riskier than valuable (visual-phase
    follow-up).
12. Rest-timer docked placement + finish-flow summary-first deferred to
    the visual phase (reasons in Stage 4).
13. Data-bar width transitions (`duration-500`/`duration-700`, 15+
    sites) KEPT as single-run value displays (spec's rest-timer
    rationale extended; Phase 11/12 to confirm or convert).
14. Rest-timer bar premise mismatch: no bar element exists; nothing
    linearized; the numeric countdown is already authoritative.
15. `animate-spin` kept on in-flight operation indicators only.
16. Splash fade 500 ms → 300 ms (inside the transition band).
17. Two non-interactive row-container divs kept at 40 px; sub-44
    secondary chips/pills remain (section chips, filter pills, heatmap
    tabs) — flagged for Phase 11.
18. Custom-accent `on` ladder extended to three rungs (white, `#171916`,
    pure black) — the spec's two-choice ladder is provably incomplete
    for vermilion itself.
19. Chip text steps against the blended wash, not just the page
    background (Stage 9 audit correction; vermilion 4.66 → 4.49).
20. Near-background custom hexes are REJECTED at input (error + Apply
    blocked) instead of auto-darkening the accent — preserves the
    derivation for accepted inputs (more conservative reading).
21. Preset subtles are opaque tints while custom subtles are rgba
    washes — an inconsistency in mechanism, both audit-passing; noted
    for a future unification pass, not silently harmonized.
22. Vermilion light `on` = black (audit correction; primary-button text
    in light mode changes white → black).
23. QA4-015 pins bumped 40 px → 44 px (strengthening, not weakening).
24. Big-three lift persistence added in Stage 10 (gap found by the
    filter-persistence check, not in the original stage plan).
25. Heatmap cell `aria-label` summaries added (dots lacked a text
    equivalent).
26. Desktop wide grids (`max-w-3xl` for Today/Progress/Fuel) were NOT
    built in Stages 3/5: desktop is the left rail + centered `max-w-md`
    column. This matches the decision's reversible fallback (centered
    column if split regressions appear), but it was never built rather
    than fallen back to — recorded as an open item for the visual
    phase, not claimed done.
27. Translucent `bg-accent/85` variants are a contrast-audit limitation
    (full-opacity audit does not strictly cover them).
28. The `.tap-40` utility remains exactly 40 px (a utility, not a
    button); the 44 px target applies to interactive controls.

## Defects NOT fixed (baseline §6 + others — shipped as known issues)

- D1 BodyMetrics date plumbing: the date input is still silently
  ignored (entries always stamped today). The redesign touched its
  chrome only (touch targets) and did NOT change copy implying
  backdating works. Needs separate approval + scope.
- D6 service-worker cache strategy: `sw.js` untouched (versioned cache
  name + update prompt still owed).
- D5 `public/ui-mockups.html`: left served (removal needs user approval).
- Supabase custom domain ($25/mo Pro): the only full fix for the OAuth
  URL hop; not a redesign item; stays the user's decision.
- 552/617 food names still need Hindi-speaker curation (machine
  translation forbidden — prior-program finding, not re-verified here).
- Sync covers only 6 tables (coach/challenges/habits/photos/
  preferences partly local-only); UI copy does not promise cloud backup
  for them, and the new personalization keys are local-only by
  construction.
- 11 confirmed defects from baseline §6 otherwise: recorded separately,
  untouched except D2 (success-token separation, part of the design
  system and approved).
- Stage 4 deferred items: rest-timer docked placement, finish-flow
  summary-first (visual phase).
- Stage 5 voice-meal gap: no voice meal path exists (record, don't
  invent).
- Stage 8 data-bar transition reading: kept as data (Phase 11/12 to
  confirm or convert).
- Full migration of the ~36 existing modals to Sheet (visual phase).
- SetRow/SetTable extraction decision (kept existing rows).
- Desktop wide grids (see deviation 26).
- Mixed-script Barlow visual coherence, 390 px + xlarge visual checks,
  phone-width checks, live sign-in observation, low-end-phone motion
  feel: all owed to the parent-run visual/browser phase, never faked.

## Verification results

- Per-stage gates are recorded under each stage above. Final full
  suite (Stage 10): vitest 1,788 passed / 20 failed (1,808 total),
  129/130 files passed, the 20 failures ONLY in
  `tests/security-integration-gate.test.ts` (known Supabase/Docker
  gate); tsc clean exit 0; build passes (shared First Load JS 88.2 kB,
  unchanged); lint exit 0 with the same 15 pre-existing warnings;
  `git diff --check` clean.
- Contrast audit rows: 6 presets × 2 modes × (accent-text ≥4.5:1 vs
  page background; accent-on ≥4.5:1 vs accent; accent ≥3:1 vs page
  background for UI use; focus ring ≥3:1; selected chip ≥4.5:1 on the
  blended wash) + 5 custom-accent cases × 2 modes × the same uses +
  input-gate rejection for near-background hexes. ZERO failing rows
  ship (Stage 1: 49/49; Stage 9: all preset + usable-custom rows pass,
  2 near-background customs rejected at input by test).
- Primary-action audit: per screen in BOTH modes, zero expander opens
  for main actions (see Stage 10 section above).
- Auth diff: line-by-line over `3a29409..HEAD`; zero non-styling lines
  in auth-adjacent files.
- Chart re-verification: axes (labeled, units), dates (real
  `formatProgressDate` windows), measured-vs-estimated encoding, and
  empty states verified against real data paths (see Stage 10).
- Filter persistence: strength/body ranges + big3 lift (after the
  Stage 10 fix) + spotlight pin all persist; all local-only.
- PR derivation: single-source (store + one e1RM function + one
  history function).
- Barlow mixed-script: code-level pass (fallback chain intact); visual
  coherence owed to the parent-run phase, Inter-only fallback reserved
  and reversible.
- Rail split-regression: build passes; `dynamic()` splits intact;
  520 px modal cap intact.
- 390 px + xlarge: code-level pass (fluid charts, rem scaling, no
  truncation on nav labels, fixed widths fit); visual check owed.
- Keyboard/modal-stack: `use-modal-a11y` semantics preserved by
  non-disturbance; `tests/modal-a11y.test.ts` passes; global
  `:focus-visible` rule added.

## Approvals needed before the PR (NOT decided — do not act without his tap)

1. D1 BodyMetrics date plumbing fix (or, if not approved, at minimum a
   copy change so the UI stops implying backdating works — itself
   behavior-adjacent, needs approval).
2. D6 service-worker cache strategy (versioned cache + update prompt).
3. D5 removing `public/ui-mockups.html` from serving.
4. Supabase custom domain ($25/mo Pro — only full OAuth-hop fix).
5. In-Settings Apple/OTP/email sign-in forms (new auth surface; none
   exists in-app today).
6. Any product-capability removal — none proposed in this program.
7. The MASTER.md superseded header note (D4) — done as a small
   reversible doc note in the decision phases, flagged for awareness
   since it changes the repo's stated source of truth.
8. Progress sub-tab display-label reconciliation (display labels only,
   URL `?sub=` params unchanged — implemented; listed because deep-link
   behavior touches user bookmarks; verification: all five `?sub=`
   values land on distinctly labeled screens).

## Reshapers for Phase 11 (second simulation) and Phase 12 (QA)

- Re-run the SAME tasks as round 1; the before/after comparison must
  account for: two defaults (Simple for new, Detailed for existing —
  document both modes, prominent density toggle); the black-on-vermilion
  primary-button change in light mode (audit correction, not a design
  whim); the You tab replacing the avatar/gear hunt; the spotlight +
  pin control; the Customize Today sheet; the summary screen.
- Phase 11 should confirm or convert: data-bar width transitions
  (Stage 8 reading); the volume title-as-question nuance; sub-44
  secondary chips/pills (tap-through misses?); desktop wide grids
  (deviation 26 — build or explicitly drop); full modal-to-Sheet
  migration sequencing.
- Phase 12 must cover the parent-run visual/browser checks this phase
  could not do (no tooling in repo, never faked): live tap-throughs,
  screenshots of the running app (never mockups), 390 px + xlarge
  layout, mixed-script Barlow coherence, low-end-phone motion feel,
  live sign-in observation (including the Google consent-screen app
  name check, still unproven).
- New Hindi strings needing native review (all keys added in this
  program): `common.estimatedShort`; `nav.you`; Stage 3 home/customize
  keys (17); Stage 4 workout keys (5); Stage 5 progress/meals keys
  (21); Stage 6 settings keys (36); Stage 7 onboarding keys (12);
  Stage 9 `heat.cellSummary`, `settings.customAccentTooClose`.
  (Count: ~94 new keys. Existing-key reuse was preferred where a key
  already existed, e.g. `auth.passwordLength`.)
- The #42 rebuild (when unparked) must ADOPT this design system rather
  than bring its own visuals: it covers master coach surfaces only
  here, and its coach chat UI, form-check section, sync surfaces, and
  unreviewed CSP change land after implementation. Carried into that
  rebuild: the D11 `analyzeUpload` timestamp-reset caveat, the
  temporary debug readout's removal before any merge, and the
  unreviewed CSP change.
- Sync caveat (binding): the six new personalization keys are
  local-only. If Phase 12 or a later program audits the sync serializer
  field by field and clears them, UI copy may then promise cross-device
  sync — not before.
