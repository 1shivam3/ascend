# R2 Persona Review — Arjun, 45 · Returning after a back injury

**Branch:** `feat/overnight-build` · **Method:** full safety-loop trace — declaration → plan generation → in-session pain report → policy lock → next week's plan — with an empirical run of the real pipeline (85 kg, `get_stronger`, intermediate and beginner).

## First impression

Round 1's verdict was "the safety system is fully built and completely unreachable." Round 2 wired exactly one door into it — the in-workout swap — and wired it to the wrong exercise. Every other part of the loop still fails: he cannot declare his injury before a plan loads his spine, the plan that greets him is heroic, the substitutes offered when something hurts are other spine-loading hinges (including Good Mornings), the "never prescribed again" promise is defeated by a dumbbell name-variant of the same lift, and the progression lock lands on the replacement exercise instead of the one that hurt. For a 45-year-old with a back history, this is the worst category of failure: the app *performs* safety while not providing it.

## The SAFETY trace, step by step

**1. Can he declare the injury before a plan is generated? No — still no write path.**
`AITrainingProfile.injuriesOrLimitations` exists (`src/lib/types.ts:487`) and is even surfaced to the AI coach prompt if populated (`src/lib/ai-context.ts:39-40`). Its only write site in the entire codebase is `Onboarding.tsx:335`: `injuriesOrLimitations: []`. No onboarding question, no profile field, no settings toggle — grep for injury/postpartum/pain across `src/components/onboarding/` returns nothing. Round 1's claim is **re-verified: the swap flow remains the only way pain information enters the system, and it requires him to first be hurt by a prescribed exercise.** The experience screen compounds it: his honest options are "Beginner — just getting started" or "Intermediate — 1–2+ years of consistent training" (`ExperienceLevelScreen.tsx`). There is no "returning after injury/break" identity, and the choice changes his loads by 40%.

**2. What does week 1 prescribe? (verified by running the pipeline)**
Intermediate, 85 kg, get_stronger, 4-day split — i.e., the man he was before the injury:
- Lower A: **Squat 4×5 @ 110 kg, Romanian Deadlift 3×6 @ 90 kg**, Leg Press 180 kg
- Lower B: **Deadlift 4×4 @ 130 kg**, Front Squat 75 kg

As "beginner" the 0.6× first-exposure factor (`scaleTemplateWeightForAthlete`, `workout-engine.ts` ~:1738) brings these to Squat 40 kg / RDL 32.5 kg / Deadlift 47.5 kg — sane loads, but the *movements* are unchanged: every template family (all 5 goals, all split schedules in `workout-schedule.ts`) prescribes barbell squat + RDL + deadlift with no injury-based filtering, because generation has no injury input to filter by. Calibration is by bodyweight ratio to an 85 kg reference lifter; age, layoff length, and injury history are not variables anywhere in the load model.

**3. He swaps RDL with "Hurts". What is he offered?**
The swap modal (`ActiveWorkoutScreen.tsx` ~:3247-3300) lists `getQuickSubstitutes` verbatim, unfiltered by pain, injury, or movement pattern. Verified lists (`SUBSTITUTION_MAP`, `workout-engine.ts`):
- Romanian Deadlift → **Dumbbell Romanian Deadlift** (the same hinge), Seated Leg Curl, **Good Mornings** (a barbell spinal hinge — arguably the worst suggestion in the library for a bad back)
- Deadlift → **Romanian Deadlift, Trap Bar Deadlift, Barbell Row** (three more axial-loaded barbell hinges)

The "Hurts" reason changes nothing about what is offered; it only changes what gets recorded. A safety flow whose remedy for "this hinge hurts my back" is "here are three more hinges" is not a safety flow.

**4. Does SAFETY-01 lock progression on the exercise that hurt? No — the flag migrates to the substitute.**
`training-decision-policy.ts:794-808` is correctly implemented: `reportsPain === true` returns rule `SAFETY-01`, `actionCategory: 'review_required'`, deltas 0, and `validatePolicyDecisionApplication` (:1106-1111) refuses to apply anything under an active lock. The policy engine is not the problem. The wiring is:

- `handleApplySwap` (`ActiveWorkoutScreen.tsx:536-556`) first flags the current exercise object: `{ ...ex, reportsPain: true, athleteFlags: { reportsPain: true } }` (:543).
- It then calls `handleSelectNewExerciseName(subName)` (:553), whose updater spreads the same object and overwrites only the name: `{ ...ex, name: trimmed, sets: updatedSets }` (:`505-520`). **`reportsPain` survives the rename — attached to the substitute.**
- On save, `store.ts:1023-1034` derives `exReportsPain` per exercise and evaluates the policy against `ex.name` — the substitute's name. SAFETY-01 therefore locks progression on the exercise he switched *to*. The Romanian Deadlift that hurt him produces no policy record: by save time it no longer exists in the session.
- The two progression surfaces he actually sees ignore pain entirely: `getNextSessionTarget` (`workout-engine.ts:120-176`, drives the Coach's Take and the in-session adaptation summary) takes no pain input — a session ending in a pain swap still yields "+2.5 kg next session" logic from the completed sets; `getProgressionRecommendation` (:855+) contains no reference to pain at all.

**5. Does next week's plan avoid the movement? Only the exact string — and a name-variant defeats it.**
The plan-level half of the swap works as designed: the original name is appended to `trainingProfile.dislikedExercises` (`ActiveWorkoutScreen.tsx:547-550`), and both regeneration paths pass it as `exclusions` (Onboarding :318-323, `WeeklyScheduleModal.tsx:146`). But exclusion matching is exact-name equality (`adaptExerciseForEquipment`, `workout-engine.ts:1286-1291`), and an excluded exercise is *replaced via the substitution table*. Verified empirically: with `exclusions = ['Romanian Deadlift']` and full-gym access, Lower A comes back with **Dumbbell Romanian Deadlift 3×8** — the excluded lift, holding dumbbells. Meanwhile Lower B still prescribes **Deadlift 3×8 @ 115 kg**, because excluding one hinge says nothing about the hinge pattern. The toast he was shown — *"it won't be prescribed again"* (`ActiveWorkoutScreen.tsx:551`) — is false in both directions. Two more holes in the same promise: regenerating via `SuggestedWorkoutModal.handleApplySplitSchedule` ignores exclusions entirely (NEHA-2), and re-onboarding overwrites the list with `dislikedExercises: []` (`Onboarding.tsx:334`, applied via the partial merge in `store.ts:1579-1582`) — the generation immediately after re-onboarding honors the old list one last time (read at :318 before the wipe), and every generation after that re-prescribes the lift that hurt him.

**6. Dead code note:** the AI-powered `ExerciseSubstitutionModal.tsx` (with its own "Hurts / joint discomfort" reason, :29) has **zero importers** — the only live swap path is the inline modal traced above.

## What worked

- The policy engine itself: SAFETY-01 preempts all progression branches, requires explicit flags (never infers pain from free text — `store.ts` :968-975 comment and logic), and its decisions cannot be applied while locked. This is well-built machinery attached to a broken sensor.
- The swap entry point now exists and is discoverable mid-workout (⋯ → "Swap this exercise"), the "Hurts" chip exists, the explanatory copy is honest (*"Pain that lingers past a week deserves a professional look"*), and the disliked-exercise persistence + generator honoring (exact-name scope aside) is real round-1 progress.
- Beginner first-exposure scaling keeps loads sane *if* he accepts the "Beginner" label.

## Friction & bugs (summary)

| ID | Severity | Bug |
|---|---|---|
| ARJUN-1 | **trust-breaker** | No injury declaration exists anywhere before plan generation; `injuriesOrLimitations` is only ever written as `[]` (`Onboarding.tsx:335`) |
| ARJUN-2 | **trust-breaker** | `reportsPain` flag migrates onto the substitute's name (rename spreads the flagged object), so SAFETY-01 locks the wrong exercise and the painful exercise gets no safety record (`ActiveWorkoutScreen.tsx:543+553`, `:505-520`; `store.ts:1023-1034`) |
| ARJUN-3 | **trust-breaker** | Exclusion is exact-name only and substitution reintroduces the same movement: excluded RDL → Dumbbell RDL prescribed; Deadlift unaffected (`workout-engine.ts:1286-1312`, verified by pipeline run) |
| ARJUN-4 | major | "Hurts" substitutes are pattern-blind: Deadlift → RDL/Trap Bar/Row; RDL → DB RDL/Good Mornings (`SUBSTITUTION_MAP` via swap modal, no filtering) |
| ARJUN-5 | major | Heroic returner loads: intermediate week 1 = Squat 110 kg / RDL 90 kg / Deadlift 130 kg; no age, layoff, or ramp concept in the load model (`workout-engine.ts` templates + `scaleTemplateWeightForAthlete`) |
| ARJUN-6 | major | Visible progression engines are pain-blind: `getNextSessionTarget` (:120-176) and `getProgressionRecommendation` (:855+) never read `reportsPain` |
| ARJUN-7 | major | Re-onboarding wipes `dislikedExercises` (`Onboarding.tsx:334`); SuggestedWorkoutModal regeneration ignores exclusions entirely |
| ARJUN-8 | minor | `ExerciseSubstitutionModal.tsx` is dead code (no importers) — a second, divergent substitution path rotting alongside the live one |

## Keep-or-delete verdict

**Deletes — and tells his physiotherapist why.** He came back careful: ready to log honestly, ready to flag pain. The app prescribed him a 130 kg deadlift with no questions, offered him Good Mornings when he reported pain, promised the lift "won't be prescribed again" and then prescribed its dumbbell twin the following week, and locked progression on the exercise he had switched *to* for safety. Each failure is small in code and enormous in meaning: for an injured returner, one broken safety promise ends the relationship permanently. **Verdict: delete, trust unrecoverable without a visible safety redesign.**

## Competitor gap

Fitbod asks about injuries/limitations at onboarding and maintains a persistent, editable exercise-exclusion list applied at the movement level; JuggernautAI runs a pre-session readiness/pain check-in per muscle group *before* loads are finalized; even Strong's simple "exclude exercise" never resurrects the movement under a variant name. ASCEND has the most sophisticated policy engine of the group (SAFETY-01 is genuinely well-designed) and the worst safety *surface*: no declaration, a misattributed flag, and name-level exclusions. The gap is wiring and data modeling, not algorithms.

## Rating: 3/10

Unchanged from round 1. The swap door was built — that was the headline fix — but it opens onto the wrong exercise, and the front door (declare an injury before you're prescribed a deadlift) still doesn't exist. For this persona the app remains a safety liability wearing a safety feature's clothes.
