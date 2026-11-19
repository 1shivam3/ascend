# BUG VERIFICATION — Bug-fix program (brief 2026-11-19)

Phase 0 baseline, branch `bug-program/phase-0` off master `adcb6c1`.

## Baseline (2026-11-19, this branch)

| Gate | Result |
|---|---|
| Typecheck (`tsc --noEmit`) | clean |
| Lint (`eslint .`) | 100 problems (2 errors = pre-existing vendored mediapipe files, 98 warnings) |
| Unit tests (`vitest run`, solo) | 4,157 passed / 20 failed of 4,177 — the 20 are exactly the Docker-only `security-integration-gate` file, same as master |
| Production build (`npm run build`) | exit 0 |
| Playwright smoke (`qa/e2e/smoke.spec.ts`, android-360x740) | **FAIL** — see O1 below |

## Harness state

- Playwright 1.65 already configured (`playwright.config.ts`): projects
  412x915, 360x740, 320x568, 375x667, touch emulation, local production
  build as webServer, cached chrome-headless-shell binary present.
- AI mocks present (`qa/fixtures/ai-mocks.ts`); seeded personas present
  (`qa/fixtures/personas.ts`): empty guest, intermediate lifter with
  history + meals, minor-15, injuries, Hindi, Extra Large text.
- **Added this phase:** `missing-age` persona — adult stats (72 kg,
  178 cm) with the `age` and `dateOfBirth` keys absent from the seed
  blob entirely (the owner's real state in the 2026-11-19 recordings).
- Gaps: mocked clock (`page.clock`) is available in Playwright 1.65 but
  not yet wired into fixtures; offline toggling is available via
  `context.setOffline` and is exercised from Phase 6, not yet in specs.
- Evidence sources: the owner's two gym recordings (Drive folder "Gym",
  VID-20261119-WA0003 3:07 and VID-20261119-WA0004 0:45), reviewed frame
  by frame; key frames re-extracted at full resolution before any claim
  below was marked confirmed.

## Findings

### O1 — Onboarding goals "Skip for now" does not advance (NEW, found in Phase 0)
- **Status:** FIXED in Phase 1 (commit `2268351`).
- **Root cause (isolated with an instrumented build):** the goals
  Skip handler DID run — the screen reached `details` and bounced
  straight back to `goals`. Onboarding's session-restore effect
  depended on `[toast]`, and `useToast()` returns a fresh object
  whenever the ToastProvider re-renders (its context value is an
  inline literal at `Toast.tsx:131`), so EVERY toast re-ran the
  restore effect. By then an `sb-…-auth-token` key exists, so the
  effect re-entered the restore branch and re-subscribed to the sync
  engine — whose `subscribe()` fires immediately with the current
  status (`sync.ts:1495`) — and, with no profile yet, called
  `setCurrentScreen('goals')`. Skip shows an info toast before
  advancing, so it always bounced; Continue's success path shows no
  toast, which is why only Skip (and any toast on later onboarding
  screens) was trapped. The "General Fitness looks pre-selected"
  reading was the skip's own `setSelectedGoals(['general_fitness'])`
  rendering after the bounce — there is no fake pre-selection.
- **Fix:** the restore effect now runs once on mount; it reads toast
  through a ref (`Onboarding.tsx`). ToastProvider's inline context
  value is a noted contributing factor, left as-is (no other effect
  in the app depends on `[toast]` — verified by grep).
- **Evidence:** `qa/e2e/smoke.spec.ts` (which drives guest onboarding
  THROUGH the Skip path) failed at master with a 90 s timeout and
  passes after the fix (16.5 s, android-360x740).

### B1 — Text types in reverse (Scan Meal review inputs)
- **Status:** FIXED in Phase 1 (commit `8da3431`) — app-side cause
  removed; real-keyboard confirmation is on the manual checklist
  (not testable here).
- **Evidence:** recordings show the reversed text `haS` in two separate
  inputs (Fine-tune box ~2:26, Add Food Item name ~2:44 of WA0003);
  the brief reports "Salt" → "tlaS" with Gboard suggestions following
  the reversed string (so the field VALUE was reversed, not just its
  rendering).
- **Isolation (Phase 1):** NOT reproducible with desktop Chromium key
  events through the real flow — the refine input took "Salt" with
  caret at 4 (probe, 2026-11-19). Ruled out by inspection: onChange
  transforms (none), async/deferred state (none), components defined
  inside render (inputs are plain JSX in one component), changing
  keys (none), parent remount (modal rendered unconditionally,
  `MealsPage.tsx:3542`), global input listeners (none), timers during
  review (the elapsed ticker runs only in the analyzing step,
  `ScanMealModal.tsx:288`), dir/bidi attributes (none). The coach
  chat input — same controlled pattern, in page flow — typed fine in
  the same session. Remaining mechanism: the Android IME composition
  path — Gboard composes through the WebView, and a composition
  interrupted by the app (value rewrites / focus-scroll churn in the
  modal, see B2) restarts at position 0, prepending each character.
- **Fix:** shared `src/components/ui/TextInput.tsx` — text lives in
  state local to the input while editing, external value changes are
  never adopted mid-composition, composition start/end are handled
  explicitly, and the component is module-level (stable identity, no
  per-keystroke remount). Migrated: scan refine, scan Add Item name
  (both forms), scan item-edit name, Meals quick-log, meal-builder
  name, per-food name, pinned-food name, coach chat input, exercise
  selector search, exercise library search. Audit of the remaining
  text inputs (auth, edit-profile, workout title/notes, rename
  dialogs): all use the same local-state pattern with no transforms
  or remount risks found; they were not migrated — the wrapper is
  the standard for any new or touched input.
- **Evidence:** `qa/e2e/b1-typing.spec.ts` — character-by-character
  typing lands in order with caret at end on the refine + Add Item
  inputs and the exercise search; a CDP IME composition sequence
  (`Input.imeSetComposition` + `insertText`, the closest headless
  analogue of Gboard) also lands in order ("Pepper"). Gboard +
  Samsung Keyboard passes on a real device remain on the manual
  checklist below.

### B2 — Keyboard covers the focused input (Scan Meal modal)
- **Status:** FIXED in Phase 1 (commit `b7d0eb4`).
- **Evidence:** WA0003 ~2:30–2:32, 2:40–2:43, 2:46 — with the keyboard
  open, the Fine-tune and Add Food Item inputs sit behind it.
- **Root cause:** the working Daily Macro Targets modal is a single
  scroll container (`.modal-content`, bottom sheet); the scan modal
  nests scrollers (overlay scroll + inner `max-h-[80vh]` panels,
  `ScanMealModal.tsx:780/1164/1340`). The browser scrolls the field
  into view at FOCUS time against the full-height layout; when the
  keyboard then shrinks the visible viewport (the app already sets
  `interactiveWidget: 'resizes-content'`), nothing scrolls it back.
  Reproduced headlessly: focus at 740 px puts the input at y=478;
  shrinking to 380 leaves it at y=474 — fully hidden. On the native
  side, the Capacitor MainActivity also had no
  `windowSoftInputMode`, so the WebView never resized at all.
- **Fix:** `useKeyboardScrollIntoView` (`src/lib/keyboard-scroll.ts`)
  on the scan modal — on focus it centres the field at two settle
  points (350 ms / 900 ms) and re-centres on visualViewport/window
  resize; scrollIntoView scrolls every scrollable ancestor, which is
  what nested scrollers need. (First version silently never attached:
  modal containers mount closed with a null ref — the hook now takes
  an `active` flag; caught by the e2e test, not by inspection.)
  AndroidManifest: `windowSoftInputMode="adjustResize"` added.
  @capacitor/keyboard is not installed; the manifest mode is the
  native switch that matters for the WebView.
- **Evidence:** `qa/e2e/b2-keyboard.spec.ts` — focus-then-shrink
  sequence; failed pre-fix on the visibility assertion, passes
  after (10.2 s). Real-device keyboard pass remains on the manual
  checklist.

### B3 — Add / correct items after an AI scan
- **Status:** VERIFIED WORKING in Phase 1 (commit `1843898`) — the
  journey was blocked by B1 + B2, not by its own logic. In WA0003
  the user abandoned the flow and the scanned meal was never added
  (today stayed at 2 meals / 671 kcal).
- **Evidence:** `qa/e2e/b3-scan-correction.spec.ts` drives the whole
  journey against the harness AI mocks: rename item 0 (Toor Dal →
  "Toor Dal Tadka") + portion 200 g, remove Roti, add Curd 100 g,
  Refine "Curd 150g" (the modal's local DB path — the "Offline
  Adjust" toast), save. The persisted store then holds exactly
  [Toor Dal Tadka, Curd] totalling 312 kcal — the same figure the
  "Meal Logged" toast reported. One correction to the brief's
  expectation: no name autocomplete appears in the Add Item form —
  it is a plain name + grams form (verified in the drive).

### N1 — Saved macro targets are not applied
- **Status:** confirmed. **Root cause found.**
- **Cause:** NOT the auto-recalculate setting (no such setting exists
  in `src` — grep for `autoRecalculate`/`recalculate` returns zero
  hits) and NOT a sync overwrite. `store.setMacroGoals` — the one
  write path — composes `enforceUnknownAgeMacroGoals`
  (`src/lib/store.ts`, `src/lib/minor-targets.ts:170`) on every save.
  The owner's profile has no date of birth (see N3), so every save is
  silently clamped to computed maintenance
  (`clampGoalsToMinorMaintenance` → `scaleMacroGoalsToCalories`;
  72 kg → 2,356 kcal) with the split rescaled. The editor's "Goals
  Saved" toast prints the values the user typed (pre-clamp), never
  what was stored. WA0004 frame at 0:13 shows both in one frame:
  toast "3000 kcal (130P / 512C / 48F)" over a page reading
  "of 2356 daily target", carbs /378 g, fat /36 g. A second save
  (toast 3000 / 539C / 36F) landed as 2,355 / 398 g / 27 g.
- **Correction to the brief:** on reopening the editor, the calorie
  field was **blank** (placeholder "e.g. 2500"), not showing 3,000 —
  frame-verified at WA0004 0:27. Protein showed 130, carbs/fat showed
  the clamped 378/36.
- The 2,356 vs 2,355 difference is two different rescale round-trips
  producing different rounding — the single-rounding-rule task stands.
- **Phase 2 resolution (2026-11-19, branch bug-program/phase-2):**
  `MacroGoals` now carries provenance — `source`
  ('manual'|'recommended'|'coach'), `updatedAt`, `inputsSnapshot`
  (types.ts) — stamped by the ONE write path. `setMacroGoals(goals,
  source)` rounds via the one rule (`roundMacroGoals`,
  lib/macro-goal-state.ts), applies the safety envelope, and RETURNS
  the stored goals (read-back). The editor saves with source
  'manual', quotes the READ-BACK in its toast, and when the envelope
  adjusted the numbers it says so ("Saved at maintenance instead: …")
  with the reason (unknown age / minor). A 'manual' target is never
  recalculated by `setProfile`; an `autoRecalculateGoals` preference
  (default on) gates recalculation for derived targets, with an
  ask-once prompt after the first manual save. The editor now opens
  from a fresh store read (the blank-field class). Two real bugs
  found by the new tests en route: (1) the safety clamp stripped
  provenance — `scaleMacroGoalsToCalories` rebuilds the object from
  numeric fields only; `clampGoalsToMinorMaintenance` now re-attaches
  the stamp; (2) legacy (pre-Phase-2, source-less) targets are NOT
  treated as manual — the pre-Phase-2 contract was "targets follow
  the profile", so the 18th-birthday / DOB-added unlock still applies
  to them, now logged + stamped 'recommended'. Evidence:
  `tests/bugp2-macro-goal-state.test.ts` (17 tests incl. the WA0004
  replay at store level) and `qa/e2e/n1-goal-save.spec.ts` (missing-age
  persona: save 3,000 → maintenance stored + notice shown → reopen
  shows the stored value). The phase3-minors "verbatim" test was
  updated to the new contract (numbers verbatim + provenance stamped).

### N2 — Fat target and macro sanity
- **Status:** confirmed. The displayed split reached P22 / C68 / F10
  with fat at 27 g for a 72 kg user (0.375 g/kg) because auto-balance
  fills the calorie gap with carbs and no fat floor exists anywhere in
  the save/clamp path. Guardrails are a Phase 2 task.
- **Phase 2 resolution:** `src/lib/macro-guardrails.ts` — fat ≥20% of
  kcal (IOM AMDR 20–35%), fat ≥0.6 g/kg, protein warning floor
  1.2 g/kg (Morton 2018 plateau ~1.6; ISSN 1.4–2.0 range) — sources in
  the module comment, constants flagged OWNER REVIEW. Warnings render
  live in the goals editor (never blocking); the editor's
  auto-balance already adjusts carbs only. 6 unit tests.

### N3 — Target changes between sessions; missing age
- **Status:** confirmed.
- **Evidence:** target 2,592 in WA0003 vs 2,356/2,355 in WA0004 with
  no user input change in between. Profile header shows AGE "—";
  Edit Profile's DOB selects and Age field are empty (frame-verified,
  WA0003 ~1:38–1:40) while name/gender/72 kg/178 cm are present.
- **Cause of the missing age:** `dateOfBirth` is local-only by design
  (`src/lib/types.ts` comment at the field: the profiles table has no
  dob column and sync field lists exclude it), so any local rebuild
  loses it. The owner ran Start Fresh on 2026-11-19 (Settings shows
  "Archived 2026-11-19: 0 sessions, 5 meals, 4 plans"). Losing the
  DOB is what arms the N1 clamp.
- **Phase 2 resolution:** every target now stores its
  `inputsSnapshot` (weight/height/age/gender/goal/activity at write
  time). The goals editor shows a provenance chip (Manual /
  Recommended / Set by coach), the updated date, and a "Why these
  targets?" panel listing the snapshot inputs, the missing-age
  maintenance note when age is unknown, and the last automatic change
  from the new diagnostics log (`goalDiagnostics`, capped at 50:
  every safety clamp and profile recalculation is recorded with
  before/after kcal + reason — drift is never silent again).
  Unknown-age still means no deficit (engine + editor + coach drafts
  all enforce maintenance); it is now LABELLED instead of silent.
  Deliberate-design note: DOB stays local-only (privacy); the fix is
  labelling + provenance, not syncing DOB.

### N4 — Number formatting mixed
- **Status:** confirmed. WA0003/WA0004 frames show "of 2592 daily
  target" (no thousands separator) alongside "2,592" elsewhere, and
  "TARGET 2355" next to "671 / 2,355 cal" on the same screen.
- **Phase 2 resolution:** the one module already existed
  (`src/lib/formatters.ts` — formatNumber / formatDate day-first /
  formatVolume / formatWater / formatDuration / formatCalories from
  the audit + QA-hardening programs; a grep for `toLocaleString(` /
  `toLocaleDateString(` across components returns ZERO hits — ad-hoc
  locale formatting was already eliminated). Phase 2 completes the
  brief's named set: `formatKcal` (canonical alias of formatCalories)
  and `formatGrams` added, plus `displayDatesInText()` — ISO dates
  inside free text are rewritten to the display format at render
  time (stored text untouched, invalid shapes pass through). Wired
  into the coach chat's assistant-message renderer (the T3 ISO-date
  leak). 6 unit tests in `tests/bugp2-formatters.test.ts`. Remaining
  honest gap: a few surfaces still hand-render units inline
  (`{n} kcal` in toasts/labels) — cosmetically consistent today via
  formatNumber at the call sites; a full sweep is cosmetic, not
  correctness.

### M1 — Scan macros come from the model, not the database
- **Status:** confirmed. **Root cause found.**
- **Numbers:** the app's own food table (`src/lib/macros.ts:158`)
  lists pineapple at 50 kcal, 13 g carbs, 0.5 g protein, 0.1 g fat
  per 100 g → 200 g = ~100 kcal / 26 g carbs. The scan result showed
  ~136 kcal / 36 g carbs / 1.2 g protein / 0.4 g fat under "High
  confidence".
- **Cause:** `src/lib/ai-scan-meal.ts:123-125` uses the database
  estimate only as a fallback when the model returns no valid calorie
  number; when the model returns numbers, they win. Confidence is
  displayed as "High" without a database match.

### M2 — Health claims in AI output
- **Status:** confirmed. The scan note for pineapple reads it "may
  support muscle recovery and reduce inflammation" (WA0003 ~2:26).
  Whether any post-filter exists is a Phase 3 code check.

### M3 — Alias and naming (pigeon pea vs chana)
- **Status:** not yet verified. An alias table exists
  (`src/lib/food-aliases.ts`); the toor/arhar/pigeon pea vs chana
  cases are Phase 3 tests.

### M4 — Scan result clarity
- **Status:** partly. "Estimated" badge and "Analyzed by AI" label
  are present in the result (frames). The "Meals (2)" tab counts
  today's meals while Meal History groups by day — the ambiguity is
  as described; Phase 3.

### T1 — PR flags on tied sets
- **Status:** confirmed against the brief's rule. Both 60 kg × 10
  sets of the same workout carry a PR badge (frame-verified, History
  expanded view, WA0003 ~0:22). Current behavior comes from the
  session-marks derivation (state-machines Phase 3.1,
  `computeSessionPRMarks`), which flags every set matching the
  session-best outcome; the brief's rule (ties are not PRs, only the
  best qualifying set, first-ever = "Baseline") is stricter and is
  not what the code implements. Phase 4.

### T2 — Coach prescribes loads for lifts with no data
- **Status:** confirmed. Muscle Block · Lower A lists Squat 4×8 @
  80 kg, Romanian Deadlift 3×8 @ 67.5 kg, Leg Press 3×10 @ 135 kg,
  Calf Raise 3×12 @ 42.5 kg (WA0003 ~0:10) while Progress shows
  Squat "No data yet" (WA0003 ~0:42). Where the loads come from is
  traced in Phase 4.

### T3 — Coach chat stale / inconsistent content
- **Status:** confirmed. The stored thread says "week 1 of 5" and
  cites "Bench Press 80kg (2026-11-02)" / "Deadlift 140kg
  (2026-11-06)" with ISO dates, while the Coach card reads "Week 2
  of 6" (WA0003 ~0:14–0:18).

### T4 — Delete workout: Undo
- **Status:** **not reproducible as stated.** The Undo toast does
  appear — "Workout Removed / Deleted workout session from
  2026-11-02. / Undo" (WA0003 ~0:26) — and Undo restores the workout
  with its PR badges and Plan vs Actual review intact (~0:28–0:31).
  The empty History later in the recording follows a second,
  deliberate delete by the owner. What remains unverified: chained
  Undo, and Undo for plan/meal/food/run/PR deletes — Phase 4 tests.

### U1 — Consistency "— vs —"
- **Status:** confirmed. "This week vs last week: 0 vs 0 sessions —
  vs —" (WA0003 ~1:00).

### U2 — Body weight staleness
- **Status:** confirmed. "72 kg, +0.0 kg (+0%)" with the chart range
  ending 6 Nov while today is 19 Nov and no staleness cue
  (WA0003 ~0:46–0:52).

### U3 — Earlier leftovers bundle
- **Status:** not yet verified. Phase 5 audit.

### U4 — Google sign-in shows the raw supabase.co domain
- **Status:** plan only, as ordered. A plan already exists
  (`~/workspace/goals/ascend-webapp-to-android-app/files/supabase-auth-domain-plan-2026-11-06.md`:
  full hide = Supabase Pro $25/mo + Custom Domain $10/mo). To be
  refreshed in Phase 5. No production auth change.

### Phase 6 checks
- **Status:** not yet run. (Rest timer from every start path was
  rebuilt as one reducer in state-machines Phase 3.2 with unit
  tests; accent contrast has `tests/audit-phase4-accent-safety.test.ts`;
  the two-context offline check and the remaining items run in
  Phase 6.)

## Manual device checklist (started — grows per phase)
- Gboard + Samsung Keyboard typing in every Phase 1 input (B1).
- Keyboard behaviour in every modal on a real device (B2).
- (Carried) Form Coach on real footage; rest-timer audibility;
  Health Connect partial grants; notification outcomes.
