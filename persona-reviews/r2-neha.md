# R2 Persona Review — Neha, 28 · Home-only, dumbbells + resistance bands

**Branch:** `feat/overnight-build` · **Method:** code trace + empirical run of the real generation pipeline (`getGoalAdaptiveSplitTemplates` / `generateSplitWeeklySchedule` → `scaleSplitTemplatesForAthlete` → `adaptSplitForEquipment`) for a 65 kg intermediate, `home_dumbbells`.

## First impression

Genuinely better than round 1. Onboarding now asks the equipment question — `ScheduleScreen.tsx:22-24` offers Full gym / Home — dumbbells / Bodyweight only, and the answer is actually consumed: `Onboarding.tsx:323` runs `adaptSplitForEquipment(generatedSplit, equipmentChoice, …)`. In round 1 this was hardcoded `full_gym` and 61–67% of her week was impossible. On the default 4-day path her week-1 plan is now mostly doable at home. The cracks appear the moment she deviates from that one path — a different split, a different goal, a plan regeneration, or a mid-workout swap.

## What worked

- **Equipment is asked and honored on the onboarding path.** `adaptSplitForEquipment` (`src/lib/workout-engine.ts:1334-1350`) maps every plan exercise through `adaptExerciseForEquipment` (`:1280-1320`): substitution table first, movement-pattern fallback (`EQUIPMENT_FALLBACKS`, `:1247-1267`) second, dumbbell loads rescaled to 0.35× per hand (`:1309-1312`). Verified empirically: Bench Press → Dumbbell Bench Press, Barbell Row → One-Arm Dumbbell Row, Squat → Goblet Squat, Deadlift → Dumbbell Romanian Deadlift.
- **Beginner pull-up regression is real** (`regressPullUpsForBeginner`, `:1323-1332`) and the adapt-then-regress ordering inside `adaptSplitForEquipment` rescues beginners even when the substitution table produces Pull-ups (see bug NEHA-1 — intermediates are not rescued).
- **Schedule presets stay honest:** `WeeklyScheduleModal.tsx:136-146` re-applies scaling + equipment adaptation + `dislikedExercises` when applying a preset. This is the one regeneration path that respects her.

## Friction & bugs

### NEHA-1 (major) — Adaptation *creates* pull-ups: Lat Pulldown → Pull-ups, twice a week, no bar at home
The substitution table's first entry for `lat pulldown` is `Pull-ups` (bodyweight), and bodyweight is in `ALLOWED_EQUIPMENT.home_dumbbells` (`workout-engine.ts:1239-1244`), so `adaptExerciseForEquipment` happily converts a cable exercise into 3×10 pull-ups. Verified output, 4-day build-muscle week: **Upper A contains Pull-ups 3×10 and Upper B contains Pull-ups 3×8** — she owns dumbbells, bands and a mat, no pull-up bar, and as an intermediate she gets no regression (`regressPullUpsForBeginner` only fires for `experience === 'beginner'`). The round-1 "unscalable bodyweight-max prescription" bug was fixed for beginners and reintroduced for everyone else through the substitution table.

### NEHA-2 (major) — One regeneration path bypasses adaptation entirely
`adaptSplitForEquipment` has exactly two callers in `src/`: `Onboarding.tsx:323` and `WeeklyScheduleModal.tsx:146`. `SuggestedWorkoutModal.tsx` `handleApplySplitSchedule` (~:537-552) calls `generateSplitWeeklySchedule` and writes the plans with `setPlannedWorkouts` — **no scaling, no equipment adaptation, no exclusions**. Verified: regenerating a bro split this way gives her 10 of 16 exercises she cannot do (Bench Press 70 kg, Deadlift 110 kg, Leg Press 160 kg, cable Face Pull / Pushdown / Chest Fly…). The "Plan Generator" silently undoes the onboarding promise.

### NEHA-3 (major) — `Close Grip Bench` survives adaptation unchanged (barbell, 45 kg)
In the 5-day bro split Arms Day, verified output: `Close Grip Bench | 3×8 @ 45 kg | eq=barbell` — in a `home_dumbbells` plan. Chain: `getExerciseEquipment` (`src/lib/strength-standards.ts:207-241`) has no rule for it and falls through to `return 'barbell'` (:240); `SUBSTITUTION_MAP` has no `close grip` key and no partial match; every `EQUIPMENT_FALLBACKS` pattern (`bench press`, `incline bench`, …) fails to match the string "close grip bench"; `adaptExerciseForEquipment` then hits `if (!replacement) return ex;` (:1303) and ships the barbell exercise untouched.

### NEHA-4 (major) — Stamina goal prescribes a gym's cardio floor
`ALLOWED_EQUIPMENT` grants `cardio` to `home_dumbbells` and `bodyweight_only` unconditionally (`workout-engine.ts:1241-1243`). Verified stamina week: Zone 2 Stationary Cycling ×2, Incline Treadmill Walk, Rowing Machine Intervals, Jump Rope Intervals — **5 of 20 exercises need machines she doesn't have**, plus Hanging Knee Raise (needs a bar/rig; classified bodyweight in `exercise-library.ts`) and another Lat Pulldown → Pull-ups conversion (3×12). "Cardio" is treated as equipment-free; it isn't.

### NEHA-5 (minor) — Duplicate exercises and fantasy dumbbell loads after adaptation
No de-duplication exists in `adaptSplitForEquipment`. Verified Lower B: **Dumbbell Romanian Deadlift appears twice in one session** (from Deadlift and from Hamstring Curl). Load math compounds it: Leg Press (160 kg template) → Bulgarian Split Squat at **32.5 kg per hand** (4-day) / **42.5 kg per hand** (bro split) via the flat 0.35× rule — beyond the 20–24 kg ceiling of a typical home dumbbell set. Onboarding never asks her heaviest dumbbell, so the engine cannot know. Calf Raise is classified bodyweight (`strength-standards.ts:228-230`) yet keeps a 27.5 kg target weight — a weighted exercise wearing a bodyweight label.

### NEHA-6 (major) — The in-workout swap modal is equipment-blind
The swap UI in `ActiveWorkoutScreen.tsx` (~:3247-3300) lists `getQuickSubstitutes(currentExercise.name)` filtered only for placeholder names — it never consults `trainingProfile.equipment` / `ALLOWED_EQUIPMENT`. Verified suggestion lists: Squat → **Leg Press (machine), Hack Squat (machine)**, Goblet Squat; Bench Press → Incline Barbell Bench, Chest Press Machine; Pull-ups → Lat Pulldown (cable) ×2. At home, mid-workout, two of three suggestions for her main lift are impossible. The plan generator knows her equipment; the swap flow forgets it.

### NEHA-7 (feature gap) — Resistance bands do not exist
There is no band equipment type anywhere: `AITrainingProfile['equipment']` (`src/lib/types.ts:482`) is `full_gym | home_dumbbells | bodyweight_only | barbell_only`; `EquipmentType` in `src/lib/exercise-library.ts:3` has no Band; the library's 105 exercises contain zero band movements; the ScheduleScreen copy itself says "Dumbbells and a mat" (`ScheduleScreen.tsx:23`). Half her kit is invisible to the app.

### NEHA-8 (major) — Equipment can never be changed after onboarding
No settings surface writes `trainingProfile.equipment`: the only writers of the profile are Onboarding (equipment), `WeeklyScheduleModal` (days), `GoalSelectorModal` (goal), `SuggestedWorkoutModal` (split/days), `ActiveWorkoutScreen` (disliked list). Nothing in `SettingsView.tsx`, `SettingsModal.tsx`, `ProfileView.tsx`, or `EditProfileModal.tsx` mentions equipment. If she joins a gym — or lends her dumbbells out — the only route is re-onboarding, which (see ARJUN-5) wipes her pain exclusions.

## Keep-or-delete verdict

**Conditional keep — deletes at the first regeneration.** The default week works now, and that earns the app a real trial. But the first time she taps the Plan Generator, picks a stamina goal, or tries to swap a squat and is offered a Leg Press, the app's one promise to her ("your plan fits your home") is broken in a way she can see. **Verdict: keeps for week 1, churns by week 3.**

## Competitor gap

Nike Training Club / FitOn ask equipment once and filter *every* surface — plans, swaps, search — by it; Fitbod persists an equipment profile you can edit when your setup changes and lets you cap available dumbbell weights. ASCEND filters exactly one surface (initial generation, plus schedule presets) and treats the answer as immutable. Band-based programs (Freeletics, FitOn band journeys) have no ASCEND counterpart at all.

## Rating: 5/10

Up from 3/10 in round 1 — the onboarding fix is real. Capped at 5 because the equipment promise holds on exactly one path and breaks on every other path a home user will actually touch.
