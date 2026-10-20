# R2 Persona Review — Simran, 31 · Postpartum, easing back in

**Branch:** `feat/overnight-build` · **Method:** code trace of onboarding, plan generation, core/hinge content, swap/"Hurts" flow, and every user-facing string she would meet in a missed-session week.

## First impression

The app never learns the single most important fact about her. There is no postpartum question — not in goals, not in experience, not in personal details, not anywhere. A full-text search of `src/` for `postpartum | postnatal | pelvic | diastasis | kegel | c-section` returns **zero hits** (the only "pelvic" in the codebase is the cue "Controlled pelvic tuck" on Hanging Knee Raise, `workout-engine.ts:1932` — an exercise she should not be handed in week 1). She is processed as a generic beginner, and everything she receives follows from that erasure.

## What worked

- **The missed-session check-in is genuinely kind — and now actually wired.** `generateCheckIn` (`src/lib/coach-engine.ts:1037-1062`): *"Quick check-in: … didn't get logged this week. That happens — work, family, life. A missed session changes nothing about your progress; quitting the week over it would. …pick the most important one, slot it into a free day this week, and let the rest go."* It reaches her via `useCoachDigest` → Home check-in card (`HomePage.tsx:510-536`), is dismissible, respects the Settings coach toggle, and `detectMissedSessions` (`coach-engine.ts:926-948`) now only flags past days. For a new mother, this is the one surface that sounds like it was written by someone who understands her week. Streak freezes are likewise silent (`streak-freeze.ts`) — no streak-loss shaming anywhere; workout-reminder push copy is neutral (`notifications.ts:281-285`).
- **Beginner pull-up regression protects her if she picks "Beginner"** — pull-ups become Lat Pulldown / Single-Arm Dumbbell Row (`workout-engine.ts:1323-1332`), and first-exposure loads are scaled 0.6× (`scaleTemplateWeightForAthlete`).
- **A pain exit exists in-session:** ⋯ menu → "Swap this exercise" → "Hurts / joint discomfort" (`ActiveWorkoutScreen.tsx` ~:3247-3290), with honest copy: *"Pain that lingers past a week deserves a professional look."* (Its wiring defects are in the Arjun review, SIMRAN-3 below — they apply to her identically.)

## Friction & bugs

### SIMRAN-1 (feature gap, trust-adjacent) — Zero postpartum awareness at any layer
- **Onboarding:** goals are build_muscle / lose_fat / get_stronger / stamina / general_fitness (`FitnessGoalsScreen.tsx:19-45`); experience is beginner/intermediate/advanced (`ExperienceLevelScreen.tsx`); personal details ask name/gender/age/weight/height. No "recently had a baby", no delivery/recovery question, no "returning after a break" option — the experience screen's "Intermediate: 1–2+ years of consistent training" is the closest box for a woman who trained pre-pregnancy, and choosing it removes the beginner load scaling *and* the pull-up regression (see NEHA-1: as an intermediate she is prescribed Pull-ups 3×8–12 via the Lat Pulldown substitution).
- **Contraindication screening: none.** `AITrainingProfile` (`src/lib/types.ts:477-490`) has `injuriesOrLimitations: string[]`, but the only write in the entire codebase is `injuriesOrLimitations: []` in `Onboarding.tsx:335`. No generator reads it for exercise selection — it is only echoed to the AI coach prompt if non-empty (`ai-context.ts:39-40`), which it never is.
- **Week-1 content for a deconditioned returner:** barbell/dumbbell Romanian Deadlift (loaded hip hinge), Overhead Press (intra-abdominal pressure under load), and — on the stamina goal — Front Plank 3×45 s and Hanging Knee Raise 3×15 (`workout-engine.ts` stamina templates, ~:1900-1935). Planks and hanging knee raises are precisely the movements postpartum guidance defers until core/pelvic-floor function is re-established (coning/doming risk with diastasis). The app prescribes them with no screening, no modification, and no note.

### SIMRAN-2 (major) — No ramp: full volume from day 1; only loads are scaled, and only for "beginners"
There is no return-to-training ramp anywhere in the engine. `scaleTemplateWeightForAthlete` (`workout-engine.ts` ~:1725-1750) scales **targetWeight only** — sets and reps are untouched, so her first session is the full template volume (4 sets of compounds, ~17 sets/session) at lighter weight. Progression is purely reactive per-session RPE (`getNextSessionTarget`, `workout-engine.ts:120-176`: +load at avg RPE ≤ 7, +rep otherwise) with no week-by-week build, no reduced-frequency re-entry, and no concept of "weeks since delivery". A deconditioned user is distinguished from a conditioned one by exactly one multiplier on exactly one variable, and only if she self-labels "beginner".

### SIMRAN-3 (trust-breaker, shared with ARJUN-2) — The "Hurts" flag lands on the wrong exercise
In `handleApplySwap` (`ActiveWorkoutScreen.tsx:536-556`), the pain flag is set on the current exercise object (`:543`), then `handleSelectNewExerciseName(subName)` renames **that same object** — its updater spreads `...ex` and overwrites only `name`/sets (:`505-520`). The saved workout therefore records `reportsPain: true` against the **substitute's** name, and `store.ts:1023-1034` propagates it to the policy evaluation keyed by that (wrong) exercise name: SAFETY-01 locks progression on the innocent replacement, and the exercise that actually hurt her gets no safety record at all. The plan-level half works (the original name is correctly added to `dislikedExercises`, `:547-550`) — exact-name only, so a variant of the same movement returns (see ARJUN-3).

### SIMRAN-4 (feature gap) — No pelvic-floor / diastasis-safe movement tier exists to swap *to*
`EXERCISE_LIBRARY` (`src/lib/exercise-library.ts`, 105 entries) contains no Glute Bridge (only Barbell Hip Thrust, default 90 kg, :69), no Dead Bug, no Bird Dog, no pelvic-floor or breathing work — nothing from the standard postpartum rehab canon. Round 1 flagged "no rehab movement tier"; it is still absent. So even the swap flow cannot offer her a safe core alternative: for Front Plank, `getQuickSubstitutes` has no map entry and its generic fallback is filtered out by the swap modal, leaving an **empty substitute list** — her only guidance is "Use 'Add exercise' to pick any movement from the library", a library with nothing appropriate in it.

### SIMRAN-5 (minor) — The kind check-in still grades her against a week she never agreed to
The check-in copy is warm, but the machinery beneath it is not postpartum-aware: adherence is computed against the full planned schedule, the Home card header counts missed sessions (*"2 planned sessions didn't get logged this week"*, `HomePage.tsx:520-522`), and there is no "pause / life-stage" mode — no way to tell the app "I'm on 2 unpredictable days a week right now" except changing days (which, via `SuggestedWorkoutModal`, can silently regenerate an unadapted gym plan — NEHA-2). Tone is fixed; structure isn't.

## Keep-or-delete verdict

**Deletes — quietly, without anger.** Nothing insults her; the app simply has no idea who she is. Week 1 hands a recently-postpartum, deconditioned woman loaded hinges, overhead pressing and (on one goal path) planks and hanging knee raises, with full session volume and no questions asked. The one warm surface — the missed-session check-in — arrives *after* the plan has already failed her. A new mother has the least spare trust of any user; she will not spend it configuring around an app that never asked. **Verdict: delete within the first week.**

## Competitor gap

Mommastrong / Every Mother / Mutu System are built stage-by-stage (pelvic-floor reconnection → loaded movement), screen for diastasis, and treat "10 minutes counts" as the product. Even generalist apps (Nike Training Club's postpartum collection, FitOn) label and sequence this content. ASCEND's gap is not a missing workout pack — it's a missing data model: no life-stage field, no rehab tier, no ramp. Until those exist it cannot serve this user at any level of polish.

## Rating: 4/10

Unchanged from round 1. The check-in wiring and beginner regression are real kindnesses, but round 1's core findings for Simran — no postpartum awareness, no rehab movements, no ramp — were all left open, and they are the whole product for her.
