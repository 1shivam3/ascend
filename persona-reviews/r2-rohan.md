# Persona Review R2: Rohan, 30 — Advanced Powerlifter, ex-Strong

**Branch:** `feat/overnight-build` | **Method:** read-only code trace, simulated week (import → log → progress → meet prep → export). Round-1 claims re-verified against current code. Simulated: S/B/D 180/130/220 kg, ~100 kg BW, 4 years of Strong history.

---

## First impression

Better than round 1 within five minutes. Onboarding now asks days/week and equipment (`src/components/Onboarding.tsx:54-55,600-609` → `ScheduleScreen` actually calls `setDaysPerWeek`/`setEquipmentChoice`), and the plan offer previews exercises + minutes instead of blind names. He still declines the offered plan — templates are bodyweight-scaled intermediates (`scaleTemplateWeightForAthlete`, `src/lib/workout-engine.ts:1716-1745`; only `beginner` gets the 0.6× factor, advanced ≡ intermediate) — but declining is now an informed tap, not a trap. Then he does what every ex-Strong user does first: imports his history. That's where the week is won or lost.

## What worked

- **Round-1 CSV unit bug: FIXED, verified.** `parseWorkoutCSV` (`src/lib/workout-import.ts:36-47,113-122`) resolves unit per-row: dedicated `Weight Unit` column > header hint (`Weight (lbs)`) > caller fallback. `DataVaultModal.tsx:180` passes `fallbackUnit: profile?.unit`. PR calibration converts lbs→kg before computing e1RM (`workout-import.ts:159`). Covered by `tests/persona-csv-import.test.ts` (225 lb bench → unit `lbs`, PR 102.1 kg). His 405 lb deadlift no longer becomes 405 kg.
- **Round-1 RPE drop: FIXED, verified.** `rpeIdx` parsed (`workout-import.ts:40`), valid 0–10 RPE attached per set (`:126-129`, rounded to 0.1). Imported history now feeds auto-regulation instead of starving it.
- **RPE does change next targets — in the shipped path.** `getNextSessionTarget` (`src/lib/workout-engine.ts:120-176`) is genuinely wired: called from `ActiveWorkoutScreen.tsx:923`, `PostWorkoutTakeModal.tsx:73`, `ai-coach.ts:555`. Rules: avg RPE ≥ 9 → hold; ≤ 7 → +2.5 kg / +5 lbs; otherwise +1 rep. All three call sites share the one function, so surfaces can't contradict each other.
- **PR tracking is honest.** Active-workout PR detection (`ActiveWorkoutScreen.tsx:1565-1645`) converts per-set unit to kg, uses effective load for bodyweight lifts, dampened Epley (`strength-standards.ts:calculateOneRepMax`), marks first exposure as "Baseline established" without counting it as a PR, and detects rep PRs at a load. Manual PR entry caps at `MAX_PR_WEIGHT_KG = 500` with a clear error (`PRsPage.tsx:794,847`).
- **DOTS math is correct.** `src/lib/dots.ts:calculateDOTS` uses the standard male/female polynomial coefficients, clamps BW to 35–220 kg, returns 0 (with an honest reason string) for gender `other`. `PRsPage.tsx:681-682` and `ProgressPage.tsx:714` feed it canonical-kg `getBigThreeStats` totals — that path is unit-clean.
- **Meet planner exists and is sensibly shaped.** `MeetAttemptPlannerModal.tsx:47-65`: opener 90%, second 95%, third 100%/102.5% selectable, projected total → DOTS, defaults pulled from his PRs.
- **Warm-up ramp + plate calculator** remain best-in-class vs Strong (carried over from round 1, code unchanged in substance).

## Friction & bugs

### ROHAN-1 (major) — Meet planner is unit-corrupt for lbs users; misleading even for kg users who edit
`MeetAttemptPlannerModal.tsx:19-36` seeds `squatMax/benchMax/deadliftMax` directly from `pr.oneRepMax`, which is **canonical kg everywhere** (`PRsPage.tsx:812,863` stores `Math.round(oneRepMaxKg*10)/10`; `workout-import.ts:174` same). The modal then labels those numbers with `userUnit` (`:16,134,245`) with **no conversion**, computes attempts in the labelled unit, and feeds `projectedTotal` into `calculateDOTS(bodyweightKg, totalKg)` (`:54-56`) which expects kg. For an lbs user: a 180 kg squat e1RM displays as "180 lbs", the opener renders as 162 "lbs" (true 90% ≈ 357 lbs), and DOTS is only accidentally right if he touches nothing — any edit mixes lbs inputs into a kg formula. Rohan is kg so he dodges it, but he shares a gym with lbs users; also `roundTo2point5` (`:44`) applies 2.5 steps even in lbs (non-standard; 5 lb is the norm, cf. `suggestLoad` step logic in `strength-standards.ts`).

### ROHAN-2 (major) — Re-importing the same CSV duplicates everything; no dedup anywhere
`workout-import.ts:142` mints a fresh workout id per parse (`imported_${Date.now()}_${random}`), so the idempotency guard in `store.ts:addWorkout` (`:858`, "if workout already exists, return") can never fire for imports. `store.ts:addPR` (`:835-838`) has **no dedup at all** — it blindly appends. `DataVaultModal.tsx:182-188` loops `addWorkout`/`addPR` unconditionally. Rohan re-imports after fixing a Strong export (a normal thing to do in week 1) and doubles 400 workouts + every imported PR. History, tonnage, readiness and stall detection all silently double-count.

### ROHAN-3 (major) — The smart auto-regulation engine is dead code; the shipped one can't back off
`adjustNextTargets` (`src/lib/coach-engine.ts:349-430`) — the %-based engine with pain lockout, −5% for RPE ≥ 9 + missed reps, −2.5% for a clean grinder, +5%/+2.5% pushes, plate-jump honesty — has **zero callers in `src/`** (verified by grep; only `tests/coach-engine.test.ts` exercises it). What ships is `getNextSessionTarget`'s three moves: hold / +step / +1 rep. It never reduces load after a missed-rep grinder, and its step is load-blind: +2.5 kg on a 220 kg deadlift (fine) and +2.5 kg on a 20 kg accessory (a 12.5% jump) use the same rule. The round-1 review praised the %-engine as live; in the current tree that praise was for tested-but-unwired code. Same "working engines, unwired UI" pattern as round 1, one layer deeper.

### ROHAN-4 (minor) — CSV import merges same-day sessions and discards session identity
`workout-import.ts:59,142` groups strictly by normalized date → exercise. Two sessions on one date (AM squats, PM bench — normal in meet prep) merge into one `WorkoutEntry`; Strong's Workout Name/Duration columns are never read. Set order across exercises is lost. History stays numerically right, structurally wrong.

### ROHAN-5 (minor) — DOTS Big-3 picker can count the wrong implements
`dots.ts:getBigThreeStats` matches by substring: any name containing `bench` except incline/close counts — including **Dumbbell Bench Press** (whose PR `oneRepMax` is a per-hand e1RM) and Smith Machine Bench Press. Any `squat` except hack/front counts — including **Goblet Squat**. A lifter with no barbell bench PR gets a "Big 3 total" built partly from a per-hand dumbbell number. Exclusions for romanian/stiff-leg deadlift are correct; the bench/squat side is not equivalently careful.

### ROHAN-6 (minor) — No %1RM / training-max programming model (unchanged from round 1)
`PlannedExercise` (`src/lib/types.ts:381-390`) is still `{targetSets, targetReps, targetWeight, targetUnit, targetRpe, notes}` — absolute numbers only. No way to express "85% × 5" or a 5/3/1 wave; the plan editor (`WorkoutPage.tsx` PlanModal) doesn't even expose `targetRpe` as an editable field (sets/reps/weight/unit/notes only), so an imported or generated RPE target can't be adjusted in the UI.

### Feature gaps (not bugs)
- **No CSV export.** Grep-verified: no CSV exporter exists in `src/`. Export is JSON backup only (see Deepa review for how the two JSON exporters diverge). Strong is bidirectional; ASCEND is a one-way door for a 4-year logger.
- No periodization blocks/deload-week structure in plans; progression is session-to-session only.
- Rest-timer defaults still cap at 180 s for heavy compounds (round-1 note; not re-traced in depth this round — **UNVERIFIED** whether changed).

## Keep-or-delete verdict

**Keep installed, still not his system of record — but closer. ~6.5→7 trajectory if ROHAN-2/3 land.**
Why: the two round-1 trust-breakers (unit corruption, RPE loss) are genuinely fixed and test-locked, PR/DOTS plumbing is honest, and the coach's stall/readiness layer remains the differentiator Strong lacks. What stops the switch: his data can be doubled by an ordinary re-import, the auto-regulation he was sold is the simple engine while the good one sits unwired, and he still can't get his data back out as CSV. A powerlifter forgives missing features; he doesn't forgive duplicated history.

## Competitor gap

Strong: bidirectional CSV, per-set RPE as a first-class field it preserves end-to-end, faster logging, no duplicate-import footgun. JuggernautAI / SBS-style sheets: %TM programming and %-based auto-regulation that actually ships. ASCEND's edge remains coaching diagnosis + meet planner + DOTS in one place — nobody else bundles those free.

## Rating: **6.5/10** (unchanged score, different reasons: round-1 bugs fixed, new ceiling found)
