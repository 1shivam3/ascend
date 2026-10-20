# Persona Review R2 — Aarav, 22, total beginner

Simulated week traced end-to-end in code on branch `feat/overnight-build` (read-only).
Aarav: never lifted, intimidated, picks Beginner + General Fitness/Build Muscle, 3 days/week, full gym, ~62 kg.

## First impression

Onboarding is genuinely welcoming for a first-timer now. The flow is Splash → Welcome (guest path exists) →
Goals → Experience → **Schedule** → Details → Plan Offer. The Schedule screen
(`src/components/onboarding/ScheduleScreen.tsx`) asks the two questions round 1 demanded — days/week
(2–6, big `py-3.5` day buttons) and equipment (Full gym / Home dumbbells / Bodyweight only) plus daily
activity for calories — in plain language ("Two quick things so your plan actually fits your life").
The plan offer does **not** silently add plans: `src/components/Onboarding.tsx` stages the profile in
`pendingProfile` and only applies it on accept/decline (the screen was previously unreachable; the defer
is deliberate and commented). The offer previews each plan — name, ~minutes, exercise count, first 6
exercise names — before he says yes. That is exactly the trust posture a nervous beginner needs.

## What worked

- **Starting loads are sane on the onboarding path.** `scaleSplitTemplatesForAthlete` +
  `scaleTemplateWeightForAthlete` (`src/lib/workout-engine.ts`, ~L1712–1765) scale template loads by
  bodyweight vs an 85 kg reference, apply a 0.6 beginner first-exposure factor, round to 2.5 kg, and cap
  beginners at the template weight. For 62 kg Aarav: 70 kg template bench → ~30 kg, 110 kg deadlift →
  ~47.5 kg. No more 70 kg × 8 prescribed to a day-one 62 kg lifter.
- **Beginner pull-up regression is real.** `regressPullUpsForBeginner` (`workout-engine.ts` ~L1322)
  swaps Pull-ups → Lat Pulldown (full gym) / Single-Arm DB Row / Inverted Row, and
  `adaptSplitForEquipment` applies it for `experience === 'beginner'` on every exercise. Onboarding calls
  scale → adapt for **all** split paths (`Onboarding.tsx` handleFinishCalibration, ~L315–325), not just
  the 4-day path as before.
- **Beginner workout view is one set at a time.** `ActiveWorkoutScreen.tsx` (~L2174) branches on
  `userMode === 'beginner'`: giant weight/reps steppers (`text-4xl sm:text-5xl`, 48–56 px stepper
  buttons), a single Complete Set button, and after each exercise a 3-choice effort prompt
  (Easy @7 / Target @8 / Hard @9.5, ~L2237+) instead of per-set RPE bookkeeping. This is the right
  amount of app for week one.
- **Skipping days is handled kindly.** Missed-session check-in (`coach-engine.ts` `generateCheckIn`,
  ~L1037) is explicitly warm — "That happens — work, family, life… One moved session beats one skipped
  session" — and it is actually rendered on Home via `useCoachDigest`
  (`src/lib/use-coach-digest.ts`, `HomePage.tsx` ~L511). Streaks use the forgiving freeze system
  (`src/lib/streak-freeze.ts`).
- **Giving up mid-workout is honest, not shaming.** The finish modal (`ActiveWorkoutScreen.tsx`
  ~L3417) titles a <80%-complete session "SESSION SAVED." rather than "WORKOUT COMPLETE.", shows the
  honest completed/total set count, and only executed sets are logged (`getExecutedExercises`).
  Discard is a separate, clearly-worded confirm ("Unsaved sets… will be lost — finished sets you
  already saved stay in your history", ~L3384).

## Friction & bugs

- **AARAV-1 (major) — A plan path still bypasses calibration.** `SuggestedWorkoutModal.tsx`
  `handleApplySplitSchedule` (~L532) calls `generateSplitWeeklySchedule(...)` and installs the plans
  raw: no `scaleSplitTemplatesForAthlete`, no `adaptSplitForEquipment` anywhere in that file (verified
  by grep — zero references). If Aarav later re-generates his split from the "Suggested" flow he is back
  to unscaled 85 kg-reference loads (70 kg bench, 110 kg deadlift) and un-regressed 3×8 pull-ups.
  Onboarding, `WeeklyScheduleModal.applyPreset`, and `WorkoutPage`'s adaptive templates all do scale —
  this one path doesn't. Round-1 claim "calibration on all plan paths" is therefore **partially regressed**.
- **AARAV-2 (major) — Form cues and warm-ups are buried.** In `ActiveWorkoutScreen.tsx` both
  "Form execution cues" and "Warm-up sets" live inside the header overflow menu (~L1780, ~L1802),
  alongside Plate helper / Voice dictation / Change routine. Nothing on the first-workout surface tells
  a beginner they exist. The warm-up generator itself is good (percentage ramp in
  `generatedWarmupPreview`, ~L1369) but it is opt-in via a menu he has no reason to open on day one,
  and no warm-up sets are auto-prepended for a first exposure.
- **AARAV-3 (minor) — The teaching layer still speaks lifter.** Form cues come from
  `getExerciseFormCues` (`src/lib/exercise-library.ts` ~L322): most library entries have no `howTo`, so
  he gets keyword fallbacks like "Retract scapulae and pin shoulder blades back and down", "resist the
  eccentric", "Brace 360-degree abdominal pressure" — correct, but unexplained jargon for someone who
  has never lifted. The RPE picker (`ActiveWorkoutScreen.tsx` ~L3531) labels options with "RIR",
  "4+ RIR", "Fast bar speed" with no plain-English explainer anywhere (grep: no RPE tutorial/first-time
  hint exists in `src/`). DOTS is at least quarantined to PR/Progress surfaces and has a "What is the
  DOTS Score?" explainer (`ProgressPage.tsx` ~L1718); e1RM appears unexplained in prescription text
  (`workout-engine.ts` `whyThisWeight`: "…(e1RM) at target RPE…", ~L815). The post-exercise Easy/Target/
  Hard prompt is the saving grace — he can complete week one without understanding any of it.
- **AARAV-4 (minor, shared with Raj) — Day-count mismatch in plan generation.** Choosing 2 days still
  routes through `generateSplitWeeklySchedule('full_body')`, which always returns **3** plans
  (`src/lib/workout-schedule.ts` full_body branch); `buildDefaultWeeklySchedule(plans, 2)` schedules
  only 2 of them, so the offer says "I put together 3 workouts" to a user who asked for 2 days, and a
  third orphaned plan sits in his Plans list.

## Keep-or-delete verdict

**KEEP — with AARAV-1 fixed before it counts as beginner-safe.** Why: the core week-one loop
(calibrated loads, regressed pull-ups, one-set-at-a-time logging, kind missed-day tone, honest partial
finish) is genuinely built for him now; the remaining damage is one unscaled regeneration path and
discoverability of help that already exists in the code.

## Competitor gap

Strong/Hevy give a beginner a pre-built "start here" routine with per-exercise demo GIFs/video and a
first-workout walkthrough. ASCEND has no exercise imagery/video at all (`EXERCISE_LIBRARY.howTo` is
populated only for conditioning entries) and no first-session guided mode — form help is text behind
a menu (AARAV-2/3). Fitbod-style "ease me in" first-week volume ramping is also absent: after session
one, progression is full double-progression from `getExercisePrescription`.

## Rating: 6/10
