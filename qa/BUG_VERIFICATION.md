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
- **Phase 3 resolution (2026-11-19, commit 43669b9 + gates fix
  7662e0c):** `src/lib/scan-verification.ts` — the model now supplies
  only name + grams. An exact DB match REPLACES the macros with the
  database values (`verified: true, macroSource: 'database'`); a
  word-overlap match takes the matched entry's values but stays
  unverified with `matchedEntry` recorded; no match keeps the model
  numbers as a flagged estimate (`macroSource: 'model'`). Applied in
  the scan-meal route, in `recalculateMealResult` (every edit/refine
  re-resolves), and at modal ingest. The review shows the source per
  item ("Verified · Food database" / "Not verified" / "Your values"
  / "Estimate · confirmed by you"); **saving is disabled while any
  item is unverified and unconfirmed** (button + handler guard).
  User-edited values (`macroSource: 'user'`) are kept verbatim.
  Confidence was already computed from signals (P0-4,
  `scan-confidence.ts`) — unchanged. `qa/FOOD_TEST_SET.json` pins 79
  foods at 5% tolerance; `tests/food-test-set.test.ts` fails on
  drift. **Caught by the new e2e:** the modal's portion-preference
  helper early-returned when no preferences existed, bypassing
  verification for most users — fixed in 7662e0c; the M1 spec
  (`qa/e2e/m1-scan-verification.spec.ts`) now passes: pineapple
  renders ~100 kcal with the database source line, the unknown item
  gates the save until "Confirm estimate" is tapped.

### M2 — Health claims in AI output
- **Status:** confirmed. The scan note for pineapple reads it "may
  support muscle recovery and reduce inflammation" (WA0003 ~2:26).
  Whether any post-filter exists is a Phase 3 code check.
- **Phase 3 resolution (2026-11-19, commit 6e026aa):** no filter
  existed. `src/lib/health-claims.ts` — a prompt rule
  (HEALTH_CLAIM_PROMPT_RULE, added to the scan prompt and coach-chat
  rule 4b) plus a sentence-level post-filter (`scrubHealthClaims`):
  therapeutic/disease/benefit claims are removed sentence by
  sentence; composition facts and goal language survive (pinned by
  `tests/health-claims.test.ts`, incl. the video's exact sentence).
  Wired into: the scan-meal route (coachingNote + item notes), the
  coach route's output validation (Coach's Take, WEEKLY_REVIEW,
  insights — scrubbed inside `sanitizeString`, distinct from the
  dangerous-advice guardrails), the coach-chat route, the chat
  renderer (stored history covered), and the scan modal's note
  display. Static app copy swept for claim phrases — none found.
  The weekly review's own text is template-built (no model prose);
  its AI-route variant passes through the same validation.

### M3 — Alias and naming (pigeon pea vs chana)
- **Status:** not yet verified. An alias table exists
  (`src/lib/food-aliases.ts`); the toor/arhar/pigeon pea vs chana
  cases are Phase 3 tests.
- **Phase 3 resolution (2026-11-19):** verified — the system was
  already built and wired by the UI/UX audit (P0-4): the alias table
  maps pigeon pea/arhar/red gram → toor dal (never chana), chana =
  chickpea with 'chana dal' deliberately a separate DB entry,
  roti/chapati/phulka family handled; `findBestMatch` consults the
  table, the scan sanitizer canonicalizes display names
  ("Cooked Pigeon Peas (Chana)" → "Toor Dal (Pigeon Pea)"), and
  scan-confidence uses alias identity keys. What was missing was
  regression evidence at the scan layer — added in
  `tests/food-test-set.test.ts` (M3 block): alias resolution,
  canonical display, and a scanned "Pigeon Pea" priced as toor dal,
  explicitly NOT chana's values. No code change was needed.

### M4 — Scan result clarity
- **Status:** partly. "Estimated" badge and "Analyzed by AI" label
  are present in the result (frames). The "Meals (2)" tab counts
  today's meals while Meal History groups by day — the ambiguity is
  as described; Phase 3.
- **Phase 3 resolution (2026-11-19, commit c0b733e):** verified in
  code — the Estimated badge, the "Analyzed by AI" source line
  (§29 flow source), and the summary card pinned outside the scroll
  region (total visible while scrolling) were all already in place
  from P0-4. M1 added the missing piece: the macro SOURCE per item.
  The one real fix: the Fuel tab rendered "Meals (2)" — it now reads
  "Meals · 2 today" (`meals.tabMealsCount`, en + hi) so the count
  can't be mistaken for part of the tab's name.

### T1 — PR flags on tied sets
- **Status:** confirmed against the brief's rule. Both 60 kg × 10
  sets of the same workout carry a PR badge (frame-verified, History
  expanded view, WA0003 ~0:22). Current behavior comes from the
  session-marks derivation (state-machines Phase 3.1,
  `computeSessionPRMarks`), which flags every set matching the
  session-best outcome; the brief's rule (ties are not PRs, only the
  best qualifying set, first-ever = "Baseline") is stricter and is
  not what the code implements. Phase 4.
- **Phase 4 resolution (commit `4e5d4eb`):** the gate/replay layer
  already enforced the brief's record rules (strictly-exceeds,
  first = baseline, recompute on delete/edit/Undo incl. chained,
  manual records persist — pr-source-phase3 + qa-phase1-r1 suites).
  The defect was the BADGE layer: `isPRSet` matched every set equal
  to the mark. New `flaggedPRSets(marks, workout)` flags exactly
  ONE set per mark — the first match in session order — and both
  surfaces (History badge, Coach's Take PR count) now read it.
  Evidence: tests/bugp4-pr-ties.test.ts (tie in one session, tie
  across sessions, beat, rep-PR ties, duplicate blocks, store-level
  delete/undo/delete).

### T2 — Coach prescribes loads for lifts with no data
- **Status:** confirmed. Muscle Block · Lower A lists Squat 4×8 @
  80 kg, Romanian Deadlift 3×8 @ 67.5 kg, Leg Press 3×10 @ 135 kg,
  Calf Raise 3×12 @ 42.5 kg (WA0003 ~0:10) while Progress shows
  Squat "No data yet" (WA0003 ~0:42). Where the loads come from is
  traced in Phase 4.
- **Phase 4 resolution (commit `46511a0`):** loads come from the
  block engine, never the chat model (propose_program carries only
  intake parameters). Templates are bodyweight-scaled, beginner-
  factored and plate-rounded, and the review already allowed
  editing — what was missing was any visible BASIS: accessories
  carried a confident number with no explanation. Now every load
  carries `loadBasisByExercise` ('data' | 'estimate'); estimated
  starts say so in the why-line for every role ("Estimated start —
  … your first logged session replaces it") and are badged
  "Estimated start" in the block review. A beginner's estimated
  barbell-compound start is hard-capped at bodyweight
  (`capBeginnerEstimate`, plate-rounded down) — with today's
  scaler constants the cap binds rarely; it is the guarantee
  behind the scaling, not a replacement for it. Calibration path:
  the first logged session's demonstrated load re-anchors later
  proposals (demonstrated-floor machinery), and the why-line now
  says exactly that. Evidence: tests/bugp4-load-basis.test.ts
  (cold-start all-estimate + why text, PR-backed lift = data,
  cap unit tests + cross-goal property test); block-engine suites
  green.

### T3 — Coach chat stale / inconsistent content
- **Status:** confirmed. The stored thread says "week 1 of 5" and
  cites "Bench Press 80kg (2026-11-02)" / "Deadlift 140kg
  (2026-11-06)" with ISO dates, while the Coach card reads "Week 2
  of 6" (WA0003 ~0:14–0:18).
- **Phase 4 resolution (commit `39d07cc`):** (1) the thread renders
  a day separator (Today / Yesterday / full display date) whenever
  the local day changes — legacy messages without a timestamp get
  none (their day is never fabricated); (2) settled action cards
  (applied/undone) from a previous day collapse to one line —
  "Action from {date} — settled" — with the full card one tap away;
  stored history is never rewritten; (3) a two-tap "New chat"
  button wires the store's existing clearCoachChat (first tap arms
  — clearing has no Undo); (4) "Based on your data" evidence lines
  pass through displayDatesInText like message bodies (Phase 2);
  (5) the model context ALWAYS anchors "TODAY'S DATE" (previously
  the date only reached the model when a session resolved for
  today) alongside the existing block/week section. Evidence:
  tests/bugp4-chat-freshness.test.ts + qa/e2e/t3-chat-freshness
  .spec.ts (seeded 10-day-old thread: separators, collapsed card,
  expand, two-tap clear — all in the real UI).

### T4 — Delete workout: Undo
- **Status:** **not reproducible as stated.** The Undo toast does
  appear — "Workout Removed / Deleted workout session from
  2026-11-02. / Undo" (WA0003 ~0:26) — and Undo restores the workout
  with its PR badges and Plan vs Actual review intact (~0:28–0:31).
  The empty History later in the recording follows a second,
  deliberate delete by the owner. What remains unverified: chained
  Undo, and Undo for plan/meal/food/run/PR deletes — Phase 4 tests.
- **Phase 4 resolution (commit `1f4bf87`):** audit of every delete
  type — workout, meal, food-in-meal and plan deletes all offered
  Undo already (toast-undo.test.tsx, qa-phase1-r1 chained tests).
  PR deletion was the one gap: a plain info toast, no way back.
  New store action `insertPRAt` restores the record at its
  original index and clears its tombstone (applyRestoreToState),
  and PRsPage snapshots record + index before deleting and offers
  the standard 6-second action toast. Evidence:
  tests/bugp4-delete-undo.test.ts (restore in place + tombstone
  cleared, double-undo no-op, chained delete→undo ×2, interleaved
  deletes).

### U1 — Consistency "— vs —"
- **Status:** confirmed. "This week vs last week: 0 vs 0 sessions —
  vs —" (WA0003 ~1:00).
- **Phase 5 resolution (commit `2ea7c66`):** root cause —
  `displayWeight(0)` renders "—" by design (it means "no value"),
  and the compare line fed it real zeros. With no sessions in
  either week the line now reads "No sessions logged in the last
  two weeks yet — once you train, this line compares your weeks.";
  with one side empty, that side's volume renders as a real
  "0 kg" via formatVolume.

### U2 — Body weight staleness
- **Status:** confirmed. "72 kg, +0.0 kg (+0%)" with the chart range
  ending 6 Nov while today is 19 Nov and no staleness cue
  (WA0003 ~0:46–0:52).
- **Phase 5 resolution (commit `2bdcc25`):** the chart already
  spans the selected range (1M/3M/6M/1Y filter in
  bodyweightAnalytics) — what was missing was the age of the
  headline number. The Body card now shows "Last logged today /
  yesterday / N days ago" under the weight (real logs only; a
  profile default keeps its est. marker), and at 14+ days a prompt
  row offers the weight modal directly. The owner's video case
  (6 Nov log, 19 Nov) is 13 days — labelled, one day under the
  prompt threshold. Helper `daysSinceDate` (formatters) is
  unit-tested incl. the 13/14 boundary: tests/bugp5-staleness
  .test.ts.

### U3 — Earlier leftovers bundle
- **Status:** not yet verified. Phase 5 audit.
- **Phase 5 audit (commit `567e26d` + verification runs):**
  - *Train tab icon* — redrawn: lucide's diagonal Dumbbell
    collapsed into a blob at the 20 px tab size; replaced with a
    front-on barbell (TrainIcon, same prop contract).
  - *Toasts vs Complete Set* — verified already engineered: the
    toast stack is bottom-anchored at 6rem + safe-area (Toast.tsx,
    QA-hardening Phase 4) and the beginner action bar is in-flow;
    the floating rest pill sits below the toast zone. No overlap
    path found; no change.
  - *Train header accessible names* — covered by
    qa/e2e/r15-train-header.spec.ts (re-run in this phase's
    Playwright set).
  - *Truncation / mid-word breaks at 320/360/412 + Large/XL* —
    covered by qa/e2e/r14-truncation.spec.ts + p3-textsize
    (re-run in this phase's set).
  - *Disabled-button consistency* — house rule enforced by
    tests/audit-phase4-disabled.test.ts (re-run green).
  - *Raw enums* — grep sweep over components: goal/experience
    enums appear only in logic (comparisons, icon maps); every
    user-facing render goes through i18n labels. No raw-enum
    render found.
  - *Quick log* — meal quick log (natural language) and Home's
    "Quick log a past session" both present and exercised by the
    b3/n1-era flows; no defect found.

### U4 — Google sign-in shows the raw supabase.co domain
- **Status:** plan only, as ordered. A plan already exists
  (`~/workspace/goals/ascend-webapp-to-android-app/files/supabase-auth-domain-plan-2026-11-06.md`:
  full hide = Supabase Pro $25/mo + Custom Domain $10/mo). To be
  refreshed in Phase 5. No production auth change.
- **Phase 5:** plan stands as delivered 2026-11-06 (full hide =
  Supabase Pro $25/mo + Custom Domain add-on $10/mo; the free
  partial options and their limits are in the plan). The go/no-go
  remains the owner's — no production auth change made, per the
  brief.

### Phase 6 checks
- **Status:** RUN 2026-11-20. Battery: 39 targeted vitest files,
  432 tests, all passed; r8 workout-views Playwright passed on
  small-320x568 and pixel-412x915 (4 passed, 1 project-conditional
  skip) in addition to the standing android-360x740 set.
  - *Workout views / prefill:* the cascade (previous set → last
    session → plan target → unset, never 0-as-a-target) is covered
    by tests/audit-phase1-zero-weight.test.ts (P0-1) and the r8
    drives (tap-to-type rows, ≥44 px toggles, Complete bar in
    viewport without scrolling at 360x740 AND 320x568, XL text).
    **One defect found + fixed (commits `57164be`, `f7ca366`):**
    swapping a bodyweight exercise for a weighted one mid-session
    (rename path + crowded-gym swap path) stamped a FABRICATED
    50 kg / 115 lb prefill on every uncompleted set. The sets now
    stay unset; completing at no weight goes through the existing
    "Log without weight?" guard. Pin: tests/bugp6-prefill.test.ts.
  - *Rest timer from every start path:* rest-timer-phase3 +
    rest-timer-sound suites green (single reducer since
    state-machines Phase 3.2; start paths converge on it).
  - *Form Coach:* qa-phase3-form-coach + the tests/form-coach
    suites green — validity states, the lockout-unverified rule,
    count reconciliation and pluralization all covered there.
  - *Accent contrast:* qa-phase3-accent-contrast (all 6 presets
    AA in both themes + fixed-seed random customs after
    derivation), custom-accent-light, accent-themes and
    audit-phase4-accent-safety suites green.
  - *Hindi completeness:* tests/i18n.test.ts green (key parity +
    pinned wiring list).
  - *Offline log → sync → failure → recovery:*
    offline-sync-resilience + qa-phase1-r6-sync-failure green.
  - *Two-context concurrent edits:* gauntlet-sync-newest-wins
    green — push/pull newest-wins gates incl. ties to remote,
    missing-stamp rules and tombstone protection: two contexts
    editing the same row converge on the newer stamp, never on
    arrival order.

## Manual device checklist (started — grows per phase)
- Gboard + Samsung Keyboard typing in every Phase 1 input (B1).
- Keyboard behaviour in every modal on a real device (B2).
- (Carried) Form Coach on real footage; rest-timer audibility;
  Health Connect partial grants; notification outcomes.

## Phase 7 resolutions (2026-11-20)

Persona pass complete — full report in qa/PERSONA_REPORT.md (supersedes the
QA-hardening Phase 4 edition). 11 Playwright persona tests, all passing as
tests; step ledgers: Rohan 4 yes/1 difficulty, Priya 6/0 (+1 not-testable),
Arjun 4/2, Meera 5/0, Aman 3/0 (+1 difficulty), Sana 9/0 (+1 not-tested),
Dev 9/0, Vikram 7/0 (+1 not-testable), Screen-reader 9/0.

- F4-1 (cold offline tab crash, High) — FIXED, re-proven: Sana cold Train
  opens pass in light and dark.
- F4-2 (offline relaunch, High) — FIXED, re-proven: Sana relaunch step.
- F4-3 (generator ignored declared injuries, High) — FIXED, re-proven:
  Vikram legs generation respects Knee + Low back in both themes; the
  generator routes through prepareGeneratedPlans with limitations.
- F4-4 (Hurts swap dead end, Medium) — FIXED, re-proven: Vikram swap step.
- F4-5 / F4-6 / F4-7 (all Low) — still open, unchanged (Arjun/Aman/Rohan
  difficulty steps).
- NEW P7-1 (Medium): Today's rest-day "Train anyway" sheet offers a
  plan-less user no way to start training (only "Set today as Rest Day" /
  Manage Plans); workaround is the Train tab. Documented, not fixed —
  Phase 7 is a measurement phase.
- Harness repairs (test infrastructure only, no app code): setTheme now
  writes themeMode (post-§35 persistence); persona drives enter Train via
  the tab on rest days (see P7-1).
- Weighted overall 7.7/10 (brief rubric), no caps triggered. Verdict: Ship.
  Remaining NOT TESTED: real cloud sync / two-device round trip, real auth,
  voice capture, Form Coach on real footage, real TalkBack, production SW.
