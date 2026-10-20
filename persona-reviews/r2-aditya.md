# Persona Review R2: Aditya, 26 — Bodybuilder, 6-day PPL, high volume

**Branch:** `feat/overnight-build` | **Method:** read-only code trace, simulated week (onboard at 6 days → build/edit PPL → log high-volume week → review volume → measure). Round-1 claims re-verified against current code. Trains 6 days, 20+ sets/muscle/week, tape-measure driven.

---

## First impression

Round 1's headline insult is gone: onboarding now asks his days and equipment (`Onboarding.tsx:54-55`, `ScheduleScreen` wired at `:600-609`), so selecting 6 days routes to the PPL branch (`Onboarding.tsx:295`) instead of silently landing him on a 4-day Upper/Lower. The plan offer previews contents. He starts the week cautiously optimistic — then opens the PPL he was given and counts sets, which is what bodybuilders do.

## What worked

- **A real 6-day PPL is now reachable from onboarding** (round-1 dead `setDaysPerWeek` fixed), and also via `WeeklyScheduleModal` presets (`applyPreset` → `generateSplitWeeklySchedule('ppl', profileUnit)`, with bodyweight scaling + equipment adaptation applied on top — and the round-1 hardcoded-kg preset bug is fixed: it passes `profileUnit`).
- **PPL structure is sane.** `src/lib/workout-schedule.ts:166-225`: Push (Bench 4, OHP 3, Incline DB 3, Lateral Raise 3, Pushdown 3 = 16 sets), Pull (Deadlift 3, Row 4, Pulldown 3, Face Pull 3, Curl 3 = 16), Legs (Squat 4, RDL 3, Leg Press 3, Hamstring Curl 3, Calf Raise 3 = 16), repeated ×2 = **96 sets/week**. That's a legitimate intermediate PPL skeleton.
- **Round-1 custom-exercise fix: cleans→Legs VERIFIED.** `getExerciseMuscle` (`src/lib/exercise-library.ts:283-285`) now maps clean/snatch/jerk/thruster/kettlebell to Legs instead of falling through to Chest, and a partial-match against the library runs before keywords (`:266-270`).
- **Round-1 proxy-standard honesty flag: PARTIALLY verified** — see ADITYA-2. For a truly unknown custom lift, `getLiftLevel` (`strength-standards.ts`) sets `isStandardUnavailable`, attaches a plain-English note, and `getOverallLevel` excludes flagged lifts from the overall average. `tests/persona-standards-honesty.test.ts` locks the "Power Clean" case.
- **Hypertrophy progression model is real.** `build_muscle` templates (`workout-engine.ts:buildGoalAdaptiveSplitTemplates`, default branch) use documented double progression (8–12, hit top of range → add load), and logging itself is uncapped — a 28-set session logs fine.
- **Library depth is genuinely good** for isolation work (pec deck, both crossover directions, preacher/concentration/incline curls, overhead extensions, seated + lying leg curl, hack squat) and customs can be added by name in `ExerciseSelectorModal`.

## Friction & bugs

### ADITYA-1 (major) — There is still no volume-per-muscle visibility anywhere
Grep-verified across `src/`: no sets-per-muscle aggregation, no weekly volume by muscle, no MEV/MAV/MRV landmarks exist. `getExerciseSecondaryMuscles` (`exercise-library.ts:289`) — the helper that would let compounds credit secondary muscles at ~0.5 sets — has **zero callers in `src/`** (only a QA test file references it). Progress offers Strength (e1RM/PR/DOTS), Body, Consistency; Weekly Recap reports total tonnage + total sets only. His Sunday question — "did chest get 20 sets, are arms lagging?" — remains unanswerable in-app in week 2 of asking. The 6-bucket muscle model (`Chest|Back|Legs|Shoulders|Arms|Core`, `exercise-library.ts:1`) also can't split biceps vs triceps or quads vs hams vs calves even if the chart existed. What the PPL actually delivers per week, counted by hand from `workout-schedule.ts`: chest 14 direct, back 20, biceps **6 direct**, triceps **6 direct**, side delts 6, calves 6 — an arms-focused bodybuilder's priority muscles get the PPL's smallest allocation, and the app gives him no surface to notice or fix that imbalance.

### ADITYA-2 (major) — Honesty flag under-fires: known library lifts are ranked against absurd proxies, unflagged
`getLiftLevel` (`strength-standards.ts`, `getLiftLevel` body): `standardUnavailable = usesProxyStandard && !isKnownExercise`. A library lift **without its own standard table** is therefore never flagged, yet it is scored against an equipment-bucket proxy: dumbbell → Dumbbell Press, cable → Cable Row, machine → Leg Press, bodyweight → Push-ups. Worked example: **Pec Deck / Chest Fly Machine** is a library entry with equipment `Machine` → it is ranked against **Leg Press standards** (ratios 1.20–8.00 × BW). A 35 kg pec-deck e1RM at 80 kg BW scores near Level 1 and — because it's "known" — counts toward his overall level with no estimate warning. The flag fixed the custom-lift case from round 1 and left the library-lift case silently wrong. Related: `getNextLevelInfo` (`strength-standards.ts:554+`) falls back to `MALE_STANDARDS['Bench Press']` for any unknown lift with no proxy disclosure at all (only gender-`other` gets a note), so "next level needs X kg" on his custom lift is bench math wearing his lift's name.

### ADITYA-3 (major) — Residual custom-exercise misclassification poisons any future (and current substitution) logic
The cleans fix is real but the heuristic order and coverage still misfire (`exercise-library.ts:273-287`):
- Keyword checks run bench/pull/squat/**press** before the Olympic block, so **"Clean and Press" → Shoulders** (press wins), not Legs.
- **"Nordic Curl" → Arms** (`curl` keyword) — it's a hamstring exercise.
- **"Glute Bridge" → Chest** fallthrough: `getExerciseMuscle` has no `glute`/`hip thrust` keyword (the separate `getExerciseBodyPart` in `workout-schedule.ts` does — the two classifiers disagree).
- Any genuinely novel name still lands on the silent `return 'Chest'` (`:287`). Customs are created name-only in `ExerciseSelectorModal.tsx:handleAddCustom` — no muscle picker at creation, no way to correct the classification afterwards. For a bodybuilder whose custom cable variations are half his program, classification is decoration he can't trust or fix. (Impact today: substitution suggestions and any muscle-filtered views; impact tomorrow: it would corrupt the volume dashboard he actually wants.)

### ADITYA-4 (minor) — Plan editing can't express his programming; PPL ignores his level
- The plan editor (`WorkoutPage.tsx` PlanModal, fields at `:300-375`) edits name/sets/reps/weight/unit/notes — **no `targetRpe` field**, no rep-range (single target rep number despite double-progression notes saying "8–12"), no per-exercise rest, no tempo.
- The PPL generator (`workout-schedule.ts:160+`) takes only `userUnit` — no experience, bodyweight, or goal parameter. Loads are fixed constants (Bench 70 kg, Squat 92.5 kg) until the WeeklyScheduleModal/onboarding wrappers scale them; via other entry points the raw constants ship as-is. A 5-year lifter and a first-year lifter get the same PPL.
- "PPL + arms" (his actual split) exists in no generator; adding an arms day means hand-building a 7th plan and hand-editing the weekly schedule.

### Feature gaps (not bugs — never promised in code, but decisive for this persona)
- **Supersets / drop sets / rest-pause: unrepresentable.** `WorkoutSet` (`src/lib/types.ts:163-185`) has only `isWarmup?: boolean` as a set-type concept. No superset grouping, no drop linkage. Antagonist supersets are his default training style; logging them as unrelated straight sets loses rest/structure information. Classified GAP, not bug.
- **Measurements still stop at chest/waist/hips.** `BodyMetricEntry` (`types.ts:119-129`): `chestIn/waistIn/hipsIn` only; `BodyMetricsModal.tsx` renders exactly those three. No arms, thighs, calves, neck, shoulders — in round 2, the bodybuilder's primary tape numbers still cannot be logged.
- No exercise demo videos (known open item from round 1); form cues exist but stay behind overflow UI.

## Keep-or-delete verdict

**Delete as his training app; keep watching. The spreadsheet survives another round.**
Why: onboarding finally respects his 6 days and the PPL skeleton is respectable, so week 1 feels better. But his entire feedback loop — sets per muscle vs target, arm/thigh tape trends, photo comparison — still lives outside the app. Worse, the analytics he *is* shown can be quietly wrong for exactly the isolation lifts he cares about (ADITYA-2). A bodybuilder doesn't need the app to program for him; he needs it to *account* for him. It still can't.

## Competitor gap

RP Hypertrophy: per-muscle volume landmarks + pump/soreness feedback driving next week's sets — the exact loop missing here. Hevy: volume by muscle group, supersets, custom exercises **with user-assigned muscle**, routine duplication. Strong: drop/failure set types and arm/thigh/calf measurements. ASCEND's library and double-progression engine are competitive; its accounting layer is a generation behind.

## Rating: **5/10** (up from 4 — onboarding/PPL reachability is a real fix; the missing volume/measurement core caps it)
