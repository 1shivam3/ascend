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
- **Status:** confirmed.
- **Evidence:** `qa/e2e/smoke.spec.ts` fails at master (90 s timeout
  waiting for `#details-name`). Probes against the local production
  build (360x740): clicking "Skip for now" leaves the goals step up;
  clicking Continue with no card tapped also leaves it up, even though
  "General Fitness" renders as pre-selected (red border + check);
  tapping a goal card and then Continue advances to Step 2 of 2
  ("Tell us about yourself", `#details-name` present).
- **Root cause:** not yet isolated — either the skip handler is not
  wired, or the visual pre-selection is not a real selection and both
  actions gate on selection state. To be fixed with Phase 1 (input /
  flow integrity) or sooner if the owner orders it.
- **Severity:** High — a new user who taps Skip on the goals step is
  stuck in onboarding.

### B1 — Text types in reverse (Scan Meal review inputs)
- **Status:** confirmed (symptom); root cause not yet isolated.
- **Evidence:** recordings show the reversed text `haS` in two separate
  inputs (Fine-tune box ~2:26, Add Food Item name ~2:44 of WA0003);
  the brief reports "Salt" → "tlaS" with Gboard suggestions following
  the reversed string.
- **Checked so far:** the Add Item inputs are plain controlled inputs
  (`ScanMealModal.tsx:1213`, `:1422`, `onChange` → synchronous
  `setNewItemName(e.target.value)`); the Fine-tune input is a separate
  state (`refinementInput`, `ScanMealModal.tsx:136`). No value
  transform, debounce, `useDeferredValue`, or `startTransition` in the
  modal; the modal is rendered unconditionally (`MealsPage.tsx:3542`),
  so the parent does not remount it; no global `input` listeners in
  `src`. Two Add-Item form instances (empty-state fallback and review
  step) share the one `newItemName` state by design — that explains
  text appearing in "both" forms, not the reversal.
- **Remaining candidates (Phase 1):** remount inside the modal tree,
  IME composition interaction with controlled inputs on Gboard.
  Real-device keyboard checks go on the manual checklist.

### B2 — Keyboard covers the focused input (Scan Meal modal)
- **Status:** confirmed.
- **Evidence:** WA0003 ~2:30–2:32, 2:40–2:43, 2:46 — with the keyboard
  open, the Fine-tune and Add Food Item inputs sit behind it; the
  modal does not resize or scroll the field into view. The Daily Macro
  Targets modal handles the same keyboard correctly (WA0004) and is
  the pattern to reuse in Phase 1.

### B3 — Add / correct items after an AI scan
- **Status:** partly — the journey is currently blocked by B1 + B2;
  the full walk (edit name, change portion, remove, add with
  autocomplete, Refine, save) is a Phase 1 task after those fixes.
  Observed in WA0003: the user abandoned the flow and the scanned meal
  was never added (today stayed at 2 meals / 671 kcal).

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

### N2 — Fat target and macro sanity
- **Status:** confirmed. The displayed split reached P22 / C68 / F10
  with fat at 27 g for a 72 kg user (0.375 g/kg) because auto-balance
  fills the calorie gap with carbs and no fat floor exists anywhere in
  the save/clamp path. Guardrails are a Phase 2 task.

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

### N4 — Number formatting mixed
- **Status:** confirmed. WA0003/WA0004 frames show "of 2592 daily
  target" (no thousands separator) alongside "2,592" elsewhere, and
  "TARGET 2355" next to "671 / 2,355 cal" on the same screen.

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
