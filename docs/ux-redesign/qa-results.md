# ASCEND UX Redesign — QA Results (Phase 12, part A)

> **Branch:** `feat/ux-redesign` @ `5ad6faf` (implementation Stage 10 tip `4c87b22` + Phase 11 round-2 doc).
> **Base:** `master` @ `2c6512d7` (untouched throughout; never pushed to, never merged into).
> **Method (this phase):** full check suite re-run on the tip in a fresh clone; static code
> inspection + targeted greps for the regression tasks and preservation claims; targeted
> re-run of the gate test file to confine the failures. **Live browser verification has since
> completed** (parent-run, §3) on the Vercel preview deployment of this branch
> (https://ascend-r88thrl2y-1shivam3s-projects.vercel.app, commit `5ad6faf`) — guest-only,
> no sign-in, no production site visited. The app code at `5ad6faf` is identical to this tip
> (this tip adds only documentation), so the browser results apply to the tip. The browser's
> test state (Cobalt, Simple, English, Beginner, 1 logged set, 1 logged meal) lived only in
> that browser's localStorage on the preview origin — no server-side data, no cleanup needed.
> No credentials, no Supabase/production state touched. This phase changed no app code; its
> commits are this document only (part A + this live-visual update).
> **Headline: zero deviation from Stage 10.** Every check reproduces Stage 10's numbers
> exactly, which is expected: the tip is Stage 10 code plus one documentation commit.

## 1. Check results (re-run on the tip, fresh clone)

| Check | Command | Result | vs Stage 10 |
|---|---|---|---|
| Unit/integration tests | `npx vitest run --configLoader runner` (129.9 s) | **1,788 passed / 20 failed (1,808 total), 129/130 files passed** | IDENTICAL |
| Gate confinement | `npx vitest run tests/security-integration-gate.test.ts --configLoader runner` | **20 failed, all in that one file** (live Supabase/Docker infra: "Real Local Database Tests", e.g. deletion-nonce lifecycle against real PostgreSQL) | Confirms the 20 are the known pre-existing gate only |
| Type check | `npx tsc --noEmit` | **Clean, exit 0** | IDENTICAL |
| Production build | `npm run build` | **Success, exit 0. Shared First Load JS 88.2 kB** (chunks 31.9 + 53.6 + 2.63 kB) | IDENTICAL (shared JS unchanged from baseline) |
| Lint | `npm run lint` | **Exit 0, 15 warnings, 0 errors** (all `react-hooks/exhaustive-deps`, incl. 5× missing `t`, 3× unnecessary `todayStr`, 1× missing `stopCamera`) | IDENTICAL (the baseline audit's "5" was an undercount; Stage 1 established 15, all in untouched hook code) |
| Whitespace/errors | `git diff --check 2c6512d7..HEAD` | **Clean, exit 0** | IDENTICAL |

The `--configLoader runner` flag was needed because the default vitest config loader hits
the sandbox EPERM issue; it is verification-only, never a repo change. No check was
weakened to pass: no test, threshold, or config was altered in this phase.

## 2. Eighteen-task regression (brief's named tasks)

Verdict key: **Pass** = code + test evidence on the tip. **Partial** = code/test evidence
holds but the task needs live eyes to close, or live evidence is mixed (verified working
with open live defects, see §3). Evidence marked "(this phase)" was
re-verified by grep/diff in Phase 12; evidence marked "(Stage 10/11)" is taken from
`implementation-summary.md` / `synthetic-personas-round-2.md`, which this phase spot-checked
but did not fully re-derive.

| # | Task | Verdict | Evidence |
|---|---|---|---|
| 1 | Onboarding | Partial | Stage 7 tests 7/7. LIVE: labeled "Continue as Guest" path and equally-sized plan Skip ("Yes, add my plan" vs "No thanks, I'll build my own") verified — but NO summary screen observed after plan acceptance, straight to Today (live defect L1). `SummaryScreen.tsx` exists in Stage 7, so this is a discrepancy to resolve, not a missing file. |
| 2 | Start/resume workout | Pass | Resume handler in `WorkoutPage.tsx:1098,2149` (this phase); Stage 2/4; persistent Resume affordance. LIVE: Train logging verified end-to-end (set → rest timer counting down → SESSION SAVED → Session Complete with 1RM PR detection → history + Today updates). Rest-timer defects L4 open; widths still pending (§3). |
| 3 | Set recording | Pass (logic) | Stage 4 touched only `ActiveWorkoutScreen`, `SettingsView`, `WorkoutPage`, i18n, new `workout-mode.ts`, + tests (this phase, commit `68fac43` file list) — no set-logging engine lib changed. LIVE: set logging verified end-to-end (set → rest timer → SESSION SAVED → Session Complete with 1RM PR detection). Rest-timer preset/duplication/Escape defects L4 open. |
| 4 | Plan / weekly review | Pass | Stages 3/4; Coach section + notes content; plan Start lands directly on the perform surface. |
| 5 | Settings / personalization | Pass (with open defect) | Stage 6 tests 8/8. LIVE: Customize sheet from BOTH Today and Settings verified (hide removes immediately, up/down reorder visibly works, Restore layout shows success toast and restores); accent presets recolor the app (Cobalt verified); custom accent #F5EFE0 correctly REJECTED with inline error and Apply disabled; density Simple → Detailed adds nutrition detail, "What your coach has learned" card, weekly-review item, full 7-column habit grid, monthly-challenge card. Open: Athlete Experience showed "Advanced· Auto" after the density switch although onboarding was Beginner and Advanced was never selected — causation UNPROVEN, live defect L3. |
| 6 | Progress / chart exploration | Pass | Stage 5 + Stage 10 chart re-verification (units via `userUnit`, real date windows, measured solid vs estimated dashed + "est." badge); spotlight pin persists, goal change clears pin + toast (`ProgressPage.tsx:804,863-868`, this phase). LIVE: spotlight pin switching verified (Strength trend / Volume by muscle / Auto all restore correctly); measured-solid vs estimated-dashed distinction verified in principle on charts. Volume-title phrasing nuance (descriptive, not a question) remains a confirm-or-convert item. |
| 7 | Nutrition scan / manual | Partial | Stage 5; scan/manual/barcode land on the same meal list with per-item exact/estimated chips. LIVE: Fuel food-item Exact chip verified — BUT the same Exact item's numbers still carry the "~" prefix, and meal totals are "~" with no Estimated label (live defect L8: Exact/estimated honesty contradiction). Voice meal path does not exist — recorded, not invented (Stage 10). |
| 8 | Cross-tab navigation | Pass | TabIds/routes unchanged (`navigation.tsx:8,61` — home/workout/progress/meals/prs/profile/settings, this phase); `/?tab=` deep links preserved (`:57`, URL tab wins, `:138`); last-tab restore unchanged. "You" is presentation-only (`page.tsx:61-63,340,348,415`, this phase). |
| 9 | Modal / error / empty / offline states | Partial | New `Sheet`, `EmptyState` components exist in `src/components/ui/` (this phase); sync caption + offline banner per Stage 10. Modal-stack behavior: `use-modal-a11y` untouched (this phase). LIVE: Customize dialog closes via Escape, backdrop, and X — but Escape does NOT close the rest overlay (live defect L4). Full Escape/layering verdict stays open. |
| 10 | Keyboard + focus | Partial | Global `:focus-visible` rule added (`globals.css:149+`, this phase); `use-modal-a11y` untouched (this phase). LIVE: skip-to-content focus pill visible on Tab — but focus rings beyond the skip-link pill were not clearly distinguishable (live defect L12). Full keyboard pass stays open. |
| 11 | Responsive widths | Partial — widths NOT verified | Stage 9 code checks (fluid `viewBox` charts, rem scaling, nav labels wrap). LIVE: the browser session offered no resize control, so 390 px / 1024 px / 1440 px are explicitly NOT verified and stay pending. At the rendered desktop width there IS a left rail and content is a narrow centered column (Train excepted: 2-column grid inside it). Desktop = rail + centered `max-w-md` column, NOT the decided `max-w-3xl` wide grids (see P1). |
| 12 | Dark-mode consistency | Pass (code) | Contrast audit loops `light`/`dark` modes (`stage9` tests, this phase); 6 presets × 2 modes, zero failing rows (Stage 1/9). Live dark-mode eyes are §3. |
| 13 | Performance / bundle | Pass | Build passes; shared First Load JS 88.2 kB, unchanged from baseline (this phase). No new dependencies (package.json diff empty, this phase). |
| 14 | Data integrity / persistence | Pass | Store sanitize + persist-version bump + `migrate()` (new accounts Simple, existing Detailed); six new keys validated on read, invalid → defaults (store.ts, this phase); ranges local-only, SSR-guarded. |
| 15 | Multi-persona task re-verification | Pass (simulation) | Phase 11 doc: same 12 personas × same 36 tasks → **2.76 → 3.71 (+0.95)**; Fixed 12, Partial 19, Unchanged 3, Still failing 2 (the two P0s). Scores are simulated, not measured — labeled as such in that doc. Re-running personas on unchanged code would reproduce them. |
| 16 | Visual consistency | Partial | Tokens applied globally (Stage 1); zero `text-3xs` remaining, zero `animate-pulse`/`animate-ping` remaining (this phase). LIVE: Today Simple fold renders with no major clipping; but live defects L5 (cramped/truncated Train plan cards), L7 (accent leaks), L9 (clipping + toast overlap) are open. |
| 17 | Accessibility | Partial | See §4. LIVE: Hindi Devanagari renders cleanly with no layout break; skip-link pill visible on Tab; focus rings beyond it not clearly distinguishable (L12). Whole-claim WCAG 2.2 AA is NOT made here. |
| 18 | Plan offer / guest path / summary screen | Pass | Covered under onboarding (Stage 7); summary screen + labeled guest + equal Skip verified in Stage 7 tests. |

**No task regressed against Stage 10. No task failed outright in code/test evidence.**
The two "Still failing" Phase 11 tasks are the P0s in §6 — pre-existing behavior defects
the redesign deliberately did not fix without approval, not regressions.

## 3. Visual acceptance — LIVE BROWSER VERIFICATION COMPLETE except widths

Parent-run live browser verification on the Vercel preview deployment of this branch
(https://ascend-r88thrl2y-1shivam3s-projects.vercel.app, commit `5ad6faf`), guest-only,
test data only, no sign-in, no production site visited. The app code at `5ad6faf` is
identical to this tip (this tip adds only documentation), so these results apply to the tip.
The browser's test state lived only in that browser's localStorage on the preview origin —
no server-side data, no cleanup needed. Nothing in this section is claimed beyond what the
browser session listed.

### Verified working (guest, test data only)

- Guest onboarding with labeled "Continue as Guest" path and equally-sized plan Skip
  ("Yes, add my plan" vs "No thanks, I'll build my own").
- Today Simple fold (header, workout card, nutrition strip, ONE Coach section, habit matrix,
  quick actions, hydration, Customize Today) with no major clipping.
- Customize Today sheet from BOTH Today and Settings (hide removes immediately, up/down
  reorder visibly works, Restore layout shows success toast and restores).
- You tab with Profile | Settings segmented control.
- Accent presets recolor the app (Cobalt verified).
- Custom accent #F5EFE0 correctly REJECTED with inline error and Apply disabled.
- Density Simple → Detailed adds nutrition detail, "What your coach has learned" card,
  weekly-review item, full 7-column habit grid, monthly-challenge card.
- Train logging end-to-end (set → rest timer counting down → SESSION SAVED → Session
  Complete with 1RM PR detection → history + Today updates).
- Progress spotlight pin switching (Strength trend / Volume by muscle / Auto all restore
  correctly).
- Measured-solid vs estimated-dashed distinction in principle on charts.
- Fuel food-item Exact chip.
- Hindi switching with clean Devanagari rendering and no layout break.
- Customize dialog Escape / backdrop / X close.
- Skip-to-content focus pill visible on Tab.

### Live defects — recorded as found; triage and fixes are a later phase, not this one

- **L1 — No summary screen observed after plan acceptance** — went straight to Today.
  Note: `SummaryScreen.tsx` EXISTS in Stage 7, so this is a discrepancy to resolve, not a
  missing file.
- **L2 — Simple-mode habit matrix shows only the Sun column** despite the MON—SUN label,
  rendering as one long empty bar per row (Detailed shows the full grid).
- **L3 — Athlete Experience showed "Advanced· Auto" after the density switch** although
  onboarding was Beginner and Advanced was never selected — causation UNPROVEN, recorded
  as such (trace whether density writes experience or only workout mode).
- **L4 — Rest timer inconsistencies:** floating pill read 1:30 but post-set overlay timer
  was 2:00 (inconsistent presets); pill duplicates the overlay and keeps counting after
  Next Set; overlay is a centered panel not covering full desktop width; Escape does NOT
  close the rest overlay.
- **L5 — Train plan cards cramped/truncated in their 2-column layout** ("Bench Pr…",
  "Est. 32–54 min" wrapping).
- **L6 — Coach note stayed "4 planned sessions didn't get logged"** after one session was
  logged.
- **L7 — Accent leaks:** Session Complete "Done & Return to Workouts" stayed Vermilion
  under Cobalt; Muscle Volume legend says "Orange" while the bar renders the active accent;
  "View Completed Workout" pale blue with white text (low contrast).
- **L8 — Exact chip contradiction:** the same Exact food item's numbers still carry the "~"
  prefix, and meal totals are "~" with no Estimated label.
- **L9 — Clipping and overlap:** Settings jump-button row horizontally clipped at desktop
  width; Log Meal favorites row clipped; toasts overlap headings (Meal Logged over
  "FUEL THE WORK.").
- **L10 — Mixed Hindi strings remain** (e.g. "Today कस्टमाइज़ करें", workout names stay
  English) — pre-existing i18n gaps, not redesign regressions.
- **L11 — WIDTHS NOT VERIFIED:** the browser session offered no resize control, so 390 px /
  1024 px / 1440 px are explicitly NOT verified and stay pending. At the rendered desktop
  width there IS a left rail and content is a narrow centered column (Train excepted:
  2-column grid inside it).
- **L12 — Focus rings beyond the skip-link pill were not clearly distinguishable.**

### Still open after this session (NOT claimed here)

Screenshots of the running app as review artifacts; low-end-phone motion feel; live sign-in
observation (Google consent-screen app name still unproven — guest-only work cannot close
it); copy reads ("est." comprehension, set-type/RPE first use, streak tone, DataVault
coverage wording after its fix, volume inclusion rules after its fix); native-speaker review
of the ~94 new Hindi keys; full keyboard pass; 390 px + xlarge layout; desktop wide-grids
verdict (build or explicitly accept rail + centered column). None of these are claimed by
this document.

## 4. Accessibility acceptance (code-level only)

- **Contrast audit — zero failing rows ship** (Stage 1/9): 6 presets × 2 modes ×
  (accent-text ≥4.5:1, accent-on ≥4.5:1, accent ≥3:1 UI use, focus ring ≥3:1, selected chip
  ≥4.5:1 on blended wash) + 5 custom cases × 2 modes. Real corrections, not threshold
  weakenings: chip text steps against the blended wash (vermilion 4.66 on chalk → 4.49 on
  its wash); near-background customs rejected at input (`isCustomAccentUsable` + inline
  error + blocked Apply); light-mode primary-button text is black on vermilion (white 4.07,
  graphite 4.34, black 5.15 — see `accent-themes.ts:244-245,278`, this phase).
- **Focus:** global `:focus-visible` rule (`globals.css:149+`, this phase); modal-stack
  semantics preserved (`use-modal-a11y` untouched, this phase).
- **Touch targets:** 44 px primaries (Stage 9); QA4-015 pins bumped 40→44 px (strengthening).
  **Known gap:** sub-44 px secondary chips/pills remain (section chips ~30 px, filter pills,
  heatmap tabs) — they pass the WCAG 2.2 AA 24×24 minimum but miss the spec's enhanced 44 px
  target; confirm by tap-through (§3) before resizing.
- **Text scale:** label floor 11 px — zero `text-3xs` remaining in `src/` (this phase).
- **Motion:** only 4 keyframes + press feedback + linear rest-timer; no animated counting,
  shimmer, reveals, or stagger; zero `animate-pulse`/`animate-ping` in `src/` (this phase);
  the global `prefers-reduced-motion` rule is the control and is preserved/extended.
- **Text alternatives:** heatmap counts + cell summaries are text; measured vs estimated is
  never color alone (solid vs dashed + "est." badge) — per Stage 10 chart re-verification.
- **LIVE (browser phase):** skip-to-content focus pill visible on Tab; Hindi Devanagari
  renders cleanly with no layout break; focus rings beyond the skip-link pill were not
  clearly distinguishable (L12). These narrow the gap but do not close the caveat below —
  widths, full keyboard pass, and screen-reader behavior remain untested.
- **⚠️ Explicit caveat: WCAG 2.2 AA as a whole is NOT claimed.** Code-level passes above do
  not substitute for the live checks in §3 (390 px + xlarge, keyboard pass, Barlow
  mixed-script, low-end motion feel, screen-reader behavior). The claim stays open until
  those land.

## 5. Preservation acceptance

Diff `2c6512d7..HEAD`: **116 files changed, +8,650 / −1,077** — exactly Stage 10's
115 files / +7,812 / −1,077 plus the 838-line Phase 11 doc. No other delta exists.

- **No data-logic, calculation, auth-logic, schema, or sync-behavior change.** Auth-adjacent
  diff = exactly 3 files (`AuthModal.tsx`, `onboarding/LoginScreen.tsx`,
  `RunSessionScreen.tsx`); spot-check shows class-only changes (e.g. `text-3xs` → `text-2xs`)
  per Stage 10's line-by-line diff (zero non-styling lines after filtering class strings).
  Settings sign-out removal is ownership-only (Profile's action untouched).
- **Sync serializer:** `src/lib/supabase/` is **untouched** in the diff (this phase), and
  sync code never references `uiPreferences` (no matches in `sync.ts`, `useSupabaseSync.ts`,
  or `reconcile.ts`, this phase). The profiles upsert carries profile fields only
  (`sync.ts:1014+`). The six new keys (`accentTheme`, `customAccentHex`, `density`,
  `todayLayout`, `workoutModeOverride`, `pinnedProgressChart`) are therefore local-only by
  construction — persisted via zustand-persist + validated on read — and UI copy must not
  promise cross-device sync for them. Honest nuance: `uiPreferences` already sat in the
  pre-existing Data Vault **backup** field list (`storage.ts` BACKUP_STATE_FIELDS), so the
  new keys ride inside local backups/exports as part of that blob; that is local backup,
  not cloud sync, and it predates the redesign.
- **Boundaries intact (this phase):** no `sw.js` change, no `public/ui-mockups.html` change,
  no form-check / pose-engine file created or modified (form-check does not exist on this
  branch), no new dependencies (package.json dependency diff empty), no capability added
  or removed, no second design system (built on `tailwind.config.js` + `globals.css`;
  `MASTER.md` superseded note is docs-only).
- **Set-recording logic:** see task 3 — Stage 4 file list contains no set-logging engine lib.

## 6. Remaining issues

### P0 — still-failing tasks; need the user's explicit approval; the redesign cannot close them

- **P0-1 — D1 BodyMetrics date lie (Phase 11 task 6.2).** Re-verified this phase:
  date input rendered (`BodyMetricsModal.tsx:515-516`, state `:174`) but
  `updateBodyMetrics(weightKg, heightCm, bodyFatPct, chestIn, waistIn, hipsIn)` is called
  with **no date argument** (`:294-302`), and the store function signature (`store.ts:2088`)
  takes no date — the entry is always stamped today. Fix = pass the date through (behavior
  fix, needs approval + scope) or remove the date control until fixed. Until then the
  control misleads the user on every backdated entry.
- **P0-2 — D6 stale shell (Phase 11 task 10.3).** `sw.js` is untouched in the diff;
  `ascend-v2.0.0-cache` + 3 s cache-fallback navigation race unchanged. Fix = versioned
  cache name + update prompt, or a Settings version indicator. Until then a returning tab
  can serve a stale shell after a deploy.

### P1 — priority order (from Phase 11, with Phase 12 verification notes)

1. Rest-timer docking not built (floating button kept — top mid-session risk, P3/P5).
2. Finish-flow summary-first not built (modal stack unchanged, P7).
3. Desktop wide grids not built — rail + centered `max-w-md` delivered instead of the
   decided `max-w-3xl` grids. Matches the decision's reversible fallback but was never built
   rather than fallen back to; §3 must explicitly accept it or schedule the build.
4. Modal-to-Sheet migration not done (~36 modals keep old chrome; stack semantics preserved
   — needs one-by-one sequencing with visual verification).
5. DataVault coverage copy unchanged (S4 verbatim — backup may silently exclude local-only
   data, P8/P10; note §5's backup nuance: `uiPreferences` IS in the backup blob, but other
   local-only data may not be — the copy must say exactly what is covered).
6. Schedule editing from Train not built (Settings-only, P9).
7. Plate calculator + meet planner still tools-menu-only (P3/P5).
8. Density toggle Settings-only — verified this phase: the density control lives in
   `SettingsView.tsx:667` only; an existing user reaching Simple needs a Settings trip.
9. Sub-44 px secondary chips/pills remain (see §4).
10. ~94 new Hindi keys need native-speaker review.
11. Last-tab restore unchanged (mitigated by Resume bar + fold, not fixed for fresh-day cold
    opens — needs his landing decision: Today-first vs last-tab restore).
12. Confirm-or-convert items: volume title phrasing (descriptive vs question), data-bar
    transitions kept as data, preset opaque subtles vs custom rgba washes (both
    audit-passing, not harmonized), translucent `bg-accent/85` contrast-audit limitation.

### Live defects (browser phase) — FIX ROUND 2026-10-25 (this worker)

§3 is the historical record of what the browser saw. The fix round below
changed app code + tests only (no PR, no merge, no deploy, master
untouched); live re-verification of these fixes is a later parent-run
phase and is NOT claimed here. Regression pins:
`tests/ux-redesign-live-fixes.test.ts` (27 tests) + 2 new pins in
`tests/coach-engine.test.ts` + the updated Stage 7 summary assertion.

- **L1 Summary screen — FIXED (flow, not a missing component).**
  Root cause: `src/app/page.tsx` gates onboarding on `if (!profile)`, so
  calling `setProfile` unmounts `Onboarding` immediately. `handleAcceptPlans`,
  `handleDeclinePlans`, and the no-plan branch of `handleFinishCalibration`
  all applied the profile and then set `summary` — the summary never
  painted. Fix (contained to `Onboarding.tsx`): Accept/Decline only apply
  plans/schedule and go to `summary`, leaving the profile staged in
  `pendingProfile`; the no-plan branch stages the same way; the summary
  reads goal/diet from `pendingProfile` first; `completeOnboarding` and
  `handleSummaryEdit` apply the staged profile, then navigate. The toast
  variant now reads landed plans from the store (pendingPlans is nulled
  at Accept/Decline). Caveat (pre-existing, unchanged): refresh mid-summary
  restarts onboarding, same as the plan_offer staging edge.
- **L2 Simple habit matrix — FIXED (label, not rendering).** Simple
  intentionally shows only today's column (`todayOnly`, documented in
  `WeeklyHabitMatrix`). The bug was `HomePage` rendering `MON — SUN`
  unconditionally next to it. Fix: Simple shows today's computed date
  label (weekday-short + day, hi-IN/en-US by language; no new i18n key
  invented) and single-day cells are capped to `w-10` so the column does
  not stretch like a progress bar. Detailed keeps the full grid + MON—SUN.
- **L3 Experience flip — FIXED (label, not data).** No experience store
  key exists: the Settings row labeled `settings.experience` displayed
  the density-following workout mode (`modeLabel(workoutMode)` +
  " · Auto"), so a Simple→Detailed switch that moved the view to
  Advanced read as the user's level flipping. Fix: row relabeled to the
  existing key `workout.viewMode` ("Workout view" / "वर्कआउट व्यू") and
  the toast rebuilt from existing keys only (`"<viewMode>: <mode>"` +
  `modeUpdatedTitle`). A density switch cannot change stored experience
  because there is no stored experience to change — pinned by test.
  `settings.modeSetMsg` is now unused and retained (harmless; dictionaries
  are not usage-tree-shaken).
- **L4 Rest timer — FIXED.** Single preset source: the pill idle display
  and the overlay idle fallback now both read `defaultRestDuration`
  (dynamic per lift/reps); the stale second source `restTotalSeconds`
  (goal rest total, 90s → 1:30) is removed entirely. One timer UI: the
  pill hides while the Set Complete overlay is open (the overlay has its
  own −30/pause/+30 controls, so nothing is lost). Escape now closes the
  overlay (it previously did nothing — the overlay is not a
  `useModalA11y` modal), and X, Escape, and Android-back all share one
  dismiss+pause handler (remaining time preserved, resumable from the
  pill; the timer never runs invisibly after close). Overlay root lost
  `max-w-md mx-auto`, so it covers the full viewport on desktop (inner
  content was already centered). Deliberately NOT changed: Next Set does
  not stop the timer — rest spanning into next-set setup is correct
  behavior; the defect was simultaneous display + preset mismatch.
- **L5 Train plan cards — FIXED.** Plan-list grid is now single-column
  (`grid-cols-1`; the 2-column grid inside the narrow centered column
  truncated names and wrapped durations). Exercise-name spans carry
  `title={ex.name}` so a truncated name still reveals its full text.
  The unrelated `grid-cols-2` at `WorkoutPage.tsx:407` is untouched.
  No data/logic change.
- **L6 Stale Coach note — NOT A BUG; contract PINNED, decision OWED.**
  Investigation found no refresh bug: `detectMissedSessions` matches by
  exact date ("a session counts as done if any workout is logged on its
  exact date"), `useCoachDigest` recomputes on schedule/workout/dismissal
  changes, and the browser scenario (4 scheduled days, one session logged
  on the unscheduled Sunday) correctly leaves the count at 4 under that
  contract. No calculation changed. Tests pin the contract (unscheduled
  log → count unchanged; scheduled log → that day clears). Consequence
  to carry to the user: after a Sunday session the note still reads "4
  planned sessions didn't get logged" — accurate under the contract.
  If he wants plan-based recovery (a make-up clearing a missed weekday),
  that is a PRODUCT decision, not a fix — listed in §7.
- **L7 Accent leaks — FIXED (classes) + documented remainder.**
  Converted to tokens (`bg-accent`, `hover:bg-accent-dim`,
  `text-accent`, `text-accent-on`, `shadow-accent/25`): all 9
  `ActiveWorkoutScreen` sites, all 7 `WorkoutDetailsView` sites, the
  `PostWorkoutTakeModal` Done button, plus 2 more found by a repo-wide
  audit (`PRsPage` label, `ProgressPage` completion bar) — class-based
  accent usages are now zero repo-wide. Muscle Volume legend uses swatch
  dots (accent + border) with the same English words (no i18n regression;
  no thisWeek/lastWeek keys exist). Kept deliberately: the Set Complete
  overlay's dark graphite/chalk/sage (a dark takeover, not an accent
  leak); palette comments; token definitions; preset definitions.
  Remainder (documented limitation, not a live-defect fix):
  `ProgressPage` SVG chart attributes (`stopColor`/`stroke`/`fill`)
  still hardcode Vermilion — Tailwind tokens cannot go in SVG
  attributes, and plumbing the runtime accent hex into ~15 chart sites
  is a chart-color feature. Charts stay Vermilion under all presets.
  "View Completed Workout" re-checked and passing (Cobalt `#2563EB` +
  white ≈ 5.17:1, ≥4.5:1) — no change; the report was most plausibly a
  loose description of Cobalt blue.
- **L8 Exact/~ honesty — FIXED at the source.** New
  `src/lib/meal-display.ts`: `isExactFoodItem` (neither unmatched nor
  approximate — exactly the green "Exact" chip's condition),
  `foodsAllExact`, `tildeForFoods`. Applied to: all three food-row
  variants, both meal headers (with an amber `common.estimatedShort`
  "est." / "अनु." chip when not all exact), the day total (plain 0 with
  no prefix/label when no meals exist), the builder total, and the
  toasts — `toast.mealAdded`, `toast.mealLoggedQuickOne/Many`,
  `scan.mealLogged` carry a `{tilde}` param in both `en.ts` and `hi.ts`
  (placeholder insertion only, same positions). Extension beyond the
  brief, same rule: the offline toast pair was updated too (offline items
  carry the same estimator flags). Left unchanged with reason: favorites
  chips + `mealLoggedFav` toast (`FavoriteFood` carries no exactness
  flags, so conservative "~" is honest, not a contradiction); the
  builder's `~CAL` quantity-scaling label (a different meaning).
- **L9 Clipping/overlap — FIXED.** Settings jump row wraps on desktop
  (`sm:flex-wrap sm:overflow-visible`) and carries a mobile-only fade
  mask so the scrollable end reads as scrollable, not broken; favorites
  row gains the same mask + `pr-2`; toasts moved from `fixed top-3` to
  `fixed bottom-24` (clears the ~64px mobile bottom nav, headings
  uncovered). Widths themselves remain unverified (L11).
- **L12 Focus — VERIFIED, no code change.** The global unlayered
  `:focus-visible` rule in `globals.css` (2px accent outline + 2px
  offset, designed to beat ~138 `outline-none` sites) is correct;
  `use-modal-a11y` returns focus on close; `outline-none` hits are
  inputs carrying their own `focus:border-accent` ring. Live
  indistinguishability is most plausibly screenshot fidelity. A full
  keyboard pass is still owed (needs live eyes) and is NOT claimed.
- **L10 — OUT OF SCOPE, unchanged.** Mixed Hindi strings are pre-existing
  i18n gaps; needs native review + translation work, never
  machine-translate.
- **L11 — OUT OF SCOPE, unchanged.** Widths 390/1024/1440 stay pending;
  never claimed.

### Micro-fix round 2 (2026-10-25) — items live re-verification proved STILL broken after fix round 1

**L4 rest timer — live path CORRECTED.** Root cause of the round-1 miss:
the first round fixed the Set Complete overlay path, but the guest flow's
live timer after overlay dismiss is the pill + popover in
ActiveWorkoutScreen (WorkoutPage's separate preset-button timer is NOT the
live path — confirmed by the live bar's "-30s / +30s / Pause / Skip"
matching the popover exactly). Round-2 fixes, all in ActiveWorkoutScreen:
(1) the pill hides while the popover is open (guard now
`!completedSetSummary && !isRestPopoverOpen`), so pill + bar can never
count side by side; (2) the popover now carries the countdown readout
itself (same `restSecondsLeft > 0 ? restSecondsLeft :
defaultRestDuration` expression as the pill), so hiding the pill loses no
information; (3) Escape on the popover closes it AND pauses cleanly (new
`dismissRestPopover`: clears the end-time ref, running false, remaining
time preserved, resumable via Pause/Resume — same semantics as overlay
dismiss); (4) opening the overlay closes the popover, so pill + popover +
overlay can never triple-stack; (5) a collapse-only X button on the
popover (mobile has no Escape; Skip kills the timer, so without X the
only mobile close would destroy the timer). Deviation recorded: the bar,
not a full-viewport overlay, is the real post-dismiss timer design —
round 1's "overlay lost max-w-md" fix stands for the overlay itself, but
the live coherent timer is the bar; no full-viewport overlay was forced.
**"Pill stuck at 2:00" reinterpreted, not reproduced as a countdown bug:**
the tick mechanism is timestamp-based (500ms, drift-free, re-ticks on
visibilitychange) and sound; after overlay dismiss the timer is PAUSED at
~full duration (dismiss happens ~1s after start), so "2:00" is a paused
timer displaying correctly while workout elapsed time (which always
runs) advances — the browser judged pausing by the wrong signal. What
was genuinely broken was (1) and (3) above, plus the popover having no
readout of its own. Preset unity at 2:00 preserved. Tests: 6 L4 pins in
`tests/ux-redesign-microfix.test.ts`. **Live visual confirmation still
owed (parent-run browser phase).**

**L12 focus — rule REPAIRED, visual confirmation still owed.** Root
cause found in code: the layered rule (`globals.css`, `@layer base`)
read `outline: 2px solid var(--accent)` — INVALID, because `--accent`
is an RGB triplet, not a color, so the declaration is dropped at parse
time. The unlayered `:focus-visible` rule below it is valid and should
have covered keyboard focus per cascade layers, so the live "no visible
ring" report is not fully explained by code alone (screenshot scale may
also have hidden a 2px outline) — but a focus rule that silently parses
to nothing must not ship. Fix: layered rule now
`rgb(var(--accent))`; verified the repaired rule survives into compiled
build CSS (`button:focus-visible{outline:2px solid
rgb(var(--accent));outline-offset:2px}`). Disclosed side effect: the
Stage 9 test pinned the OLD invalid string, and the live-fixes pill +
favorites tests pinned superseded behavior — all three pins were updated
to the new intended behavior (same coverage, not weakened). **Do NOT
claim a full keyboard pass — that still needs live eyes after this fix.**

**L9b favorites row — WRAPPED.** The L9 scroll + fade-mask still
truncated the edge chip in the initial view (scrollable ≠ visible). The
row is now `flex flex-wrap` (mask, horizontal-scroll, and
scrollbar-hiding classes removed); every chip is visible without
scrolling in the narrow dialog. Tests pin wrap + absence of
scroll/mask classes.

**L2 heading caveat — FIXED (copy).** Simple heading now
`home.habitsToday` ("Today's habits" / "आज की आदतें" — Hindi composed
from dictionary words आज + की + आदतें, as in habitsThisWeek); Detailed
keeps "Habits This Week". **New Hindi key flagged for native review**
with the ~94 others.

**L3 Auto clarification — FIXED (copy, behavior untouched).** When no
explicit override is set, the row now shows a hint built from existing
keys only: "Auto: Detailed → Advanced" (or Simple → Beginner), so a
density switch that moves the value is legible as designed
follow-density behavior. Follow-density behavior itself unchanged (null
override = follow density; no experience key exists). No new keys.

**Still open after round 2 (unchanged):** D1, D6, D5, custom domain,
in-Settings sign-in forms, widths 390/1024/1440, desktop wide grids, L6
make-up question (user decision), L10 Hindi strings, ProgressPage SVG
Vermilion attributes, editor "~CAL" labels, L8 mixed-saved-meal
rendering (could not be produced via manual entry — entering required
macros clears the estimate).

### Not fixed, shipped as known issues (unchanged from Stage 10/11)

D1, D6, D5 (removing `public/ui-mockups.html` from serving), Supabase custom domain
($25/mo Pro — only full OAuth-hop fix), 552/617 food names needing Hindi-speaker curation,
6-table sync reality (UI copy stays honest; new keys local-only).

## 7. Quality-gate readiness (Phase 14 input)

**Ready for the PR once the following close:** checks green with zero deviation from
Stage 10; preservation holds (no data/auth/schema/sync change, no new deps, boundaries
intact); simulation improved 2.76 → 3.71 with the two still-failing tasks honestly
attributed to pre-existing defects, not the redesign; all decision-doc deviations documented
in the implementation summary (Sheet migration, SetRow/SetTable, desktop grids, sub-44
chips, data-bar transitions, rest-timer placement, finish-flow order, subtle harmonization).
Visual acceptance is now substantially filled (§3) EXCEPT widths. What still blocks
finalization: (a) live re-verification of the fix-round changes below (parent-run
browser phase — code + tests only, no live claim); (b) widths verification
(390/1024/1440); (c) the still-open items in §3 (screenshots as artifacts, low-end
motion feel, live sign-in, copy reads, Hindi-keys review, full keyboard pass);
(d) the user decisions below.

**Fix round 2026-10-25 (this worker, branch only, master untouched):**
L1–L5, L7–L9 fixed with regression tests; L12 verified with no code change;
L6 investigated and pinned as intended exact-date behavior (not a bug);
L10/L11 explicitly out of scope and unchanged. Gates on the fix tip:
vitest 1817 passed / 20 failed (the 20 ONLY in
`tests/security-integration-gate.test.ts`, the known Docker-infra gate —
baseline was 1788/20; +29 tests: 27 new live-fix pins + 2 L6 contract
pins; one pre-existing test updated for the intentional L3 label change);
tsc clean; `npm run build` passes (shared First Load JS 88.2 kB,
unchanged from Stage 10); lint exit 0 with the same 15 pre-existing
warnings; `git diff --check` clean. No data/auth/schema/sync change, no
new dependencies, boundaries intact. Per-defect verdicts in §6.

**Micro-fix round 2 (2026-10-25, branch only, master untouched):**
L4 live path corrected (pill hides while popover open, popover carries
its own countdown, Escape closes + pauses, overlay-open closes popover,
collapse-only X for mobile), L12 invalid focus rule repaired and
build-verified, L9b favorites row wrapped, L2 Simple heading as today,
L3 Auto hint from existing keys. Gates on the micro-fix tip: vitest
1830 passed / 20 failed (baseline 1817/20; +13 new micro-fix pins; 3
pre-existing pins updated for intentionally changed behavior — Stage 9
focus string, live-fixes pill guard, live-fixes favorites row; zero NEW
failures; the 20 ONLY in `tests/security-integration-gate.test.ts`);
tsc clean; `npm run build` passes (shared First Load JS 88.2 kB,
unchanged; `/` 490 kB); lint exit 0 with the same 15 pre-existing
warnings (flagged lines in touched files verified pre-existing, outside
the new hunks); `git diff --check` clean. No data/auth/schema/sync
change, no new dependencies, boundaries intact. Per-defect verdicts in
§6. Live re-verification of round-2 fixes still owed (parent-run).

**Blocked on user decisions (NOT decidable by this program):** P0-1 D1, P0-2 D6,
D5 ui-mockups removal, Supabase custom domain ($25/mo Pro), in-Settings Apple/OTP/email
sign-in forms (new auth surface), landing decision (Today-first vs last-tab restore),
desktop wide grids (build or explicitly accept rail + centered column), any capability
removal (none proposed), L6 plan-based recovery (whether a make-up session logged on
an unscheduled day should clear a missed planned weekday — currently it correctly does
not, by the exact-date contract).

**Carried forward unchanged:** the #42 rebuild (when unparked) must adopt this design
system, carrying the D11 `analyzeUpload` timestamp-reset caveat, the temporary debug
readout's removal before any merge, and the unreviewed CSP change; the MASTER.md superseded
header note remains flagged for his awareness; progress sub-tab display-label reconciliation
is implemented display-only with `?sub=` params unchanged (deep links keep working).

**Phase 14 gate questions (product / brand / interaction / personalization / engineering /
honesty) remain deferred to the parent.** They can now be judged against live results (§3),
but the gate itself is not run in this phase — it should run after the fixes worker lands,
not before.
