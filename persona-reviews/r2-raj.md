# Persona Review R2 — Raj, 52, longevity

Simulated week traced end-to-end in code on branch `feat/overnight-build` (read-only).
Raj: doctor said train 2×/week. Picks General Fitness ("Longevity, joint health & balanced training"),
Beginner, 2 days/week, full gym.

## First impression

He can express his actual prescription: the goal list literally offers General Fitness subtitled
"Longevity, joint health & balanced training" (`src/components/onboarding/FitnessGoalsScreen.tsx`,
backed by `ATHLETE_GOAL_CONFIGS.general_fitness` in `src/lib/types.ts` ~L87), and ScheduleScreen
(`src/components/onboarding/ScheduleScreen.tsx`) offers **2** as a first-class day choice with the
reassuring caption "Full-body sessions — perfect for a busy week." Nothing in onboarding upsells him
to 4–6 days. That first impression is respectful — the problems start underneath it.

## What worked

- **He is NOT graded against 4 days on the main surfaces.** Home's weekly count derives its target
  from the actual schedule: `weeklyStats` (`src/components/HomePage.tsx` ~L364) uses
  `scheduledDaysCount` from `weeklySchedule`, falling back to `trainingProfile.daysPerWeek` — for Raj
  that's 2. Train does the same and additionally honours the Settings weekly-target override
  (`WorkoutPage.tsx` ~L2001: `weeklyTargetOverride ?? weeklyScheduleStats.targetDays`, with 0 = Off
  showing just "N completed this week"). `getWeeklyHabitsConsistency` (`src/lib/habits.ts` ~L419)
  likewise takes `plannedDaysPerWeek` and caps the workout ratio at 1.0 — 2/2 reads as 100%, not 50%.
- **Readiness tone suits an older user.** `calculateReadiness` (`src/lib/coach-engine.ts` ~L488)
  writes plain English, never shame language (the file's stated tone rule, ~L16): load-spike warnings
  talk about joints/tendons needing a day off, low-history weeks get "ease back in… connective tissue
  needs a week to catch up." Factors are rendered on Home (`HomePage.tsx` ~L604) — score plus the
  factor sentences, now behind a "Details" collapsible (commit d1eb1d5), so they're present but one
  tap away rather than on the surface.
- **A joint-pain escape hatch exists mid-workout.** `ExerciseSubstitutionModal.tsx` offers the reason
  "Hurts / joint discomfort" and swaps the exercise; the finish/discard flows and missed-session
  check-in (`generateCheckIn`) never guilt him for a light week.

## Friction & bugs

- **RAJ-1 (minor, shared AARAV-4) — 2-day onboarding generates 3 plans.** `Onboarding.tsx` routes
  `daysPerWeek <= 3` to `generateSplitWeeklySchedule('full_body')`, which hard-returns 3 plans and a
  3-day schedule (`src/lib/workout-schedule.ts`); only the later
  `buildDefaultWeeklySchedule(generatedSplit, 2)` trims the *schedule* to Tue/Thu. Raj is offered
  "3 workouts", accepts 3 plans, and trains 2 of them — the third (Front Squat & Pull day) sits
  unused in Plans forever, quietly implying he's under-doing it.
- **RAJ-2 (major, inconsistency) — Settings weekly-target override is ignored on Home.**
  `uiPreferences.weeklyTargetDays` (Settings → Customization, `SettingsView.tsx` ~L440) is consumed
  by Train (`WorkoutPage.tsx` ~L545, ~L2001) but `HomePage.tsx` never reads it (grep: no occurrence):
  Home's `weeklyStats` (~L364) is schedule/profile-derived only, so a Raj who sets his target to Off
  ("no target, no pressure", per the Settings copy) still sees "X of 2 workouts completed this week"
  in Home's notification panel (~L904). The preference promises more than Home delivers.
- **Age is collected and then ignored by training (feature gap, verified).** `profile.age` is stored
  at onboarding and used in exactly one place: BMR in `calculateMaintenanceCalories`
  (`src/lib/macros.ts` ~L1199, `−5 × age`). Grep across `workout-engine.ts`, `coach-engine.ts`,
  `workout-schedule.ts`: **zero** age references. Readiness thresholds (acute:chronic ratios, RPE-drift
  penalties, 5/7-day streak penalties in `calculateReadiness`), rest defaults
  (`ATHLETE_GOAL_CONFIGS` `defaultRestSeconds` — goal-based only), progression steps (+2.5 kg in
  `getNextSessionTarget`/`getExercisePrescription`), and first-exposure scaling (bodyweight +
  experience only, `workout-engine.ts` ~L1728) are identical for Raj at 52 and Aarav at 22. A 52-year-old
  novice's slower recovery is simply not modelled.
- **No joint/limitation intake (feature gap, verified).** Onboarding never asks about joints, injuries,
  or doctor restrictions: `trainingProfile.injuriesOrLimitations` is hardcoded `[]` in
  `Onboarding.tsx` (~L335) and no onboarding screen mentions injury/medical limits (grep over
  `src/components/onboarding/` — only the goal subtitle mentions joint health). So "joint-friendly
  defaults" don't exist: his general-fitness full-body days are the standard barbell templates —
  Squat, Bench, Deadlift at 3×5, Front Squat — scaled by bodyweight/experience only. The only
  joint accommodation is reactive: notice pain mid-set, open Swap, pick "Hurts / joint discomfort",
  and hope the (AI-backed) substitution returns something kinder.
- **Readiness number readability is fine; its explanation is small.** The score renders at
  `text-xl sm:text-2xl` bold on Home — legible. But the factor text lives in the collapsed
  `CollapsibleDetails`, and surrounding meta ("X freezes ready", habit-matrix labels) is `text-3xs`/
  `text-2xs` sage-on-card — small for 52-year-old eyes, though not the blocker it is for Lakshmi.

## Keep-or-delete verdict

**KEEP — conditionally.** Why: the one thing his doctor actually prescribed — 2×/week, judged as
2×/week — works on Home, Train, and the consistency math, and the coach's tone will not bully him.
But the app currently treats him as a 22-year-old who trains less often: until age and limitations
feed *something* (recovery, defaults, exercise selection), "longevity" is a label on the goal card,
not a behaviour of the system.

## Competitor gap

Apple Fitness+ / FitOn senior-and-joint-friendly tracks, and even Strong's template notes, start from
constraints (bad knees → no deep squat defaults, longer rests, machine-first substitutions). ASCEND
collects neither age-based adjustments nor a single limitation at intake, so it cannot do the one
thing a longevity user is actually buying: pre-emptively kinder programming instead of reactive swaps.

## Rating: 5/10
