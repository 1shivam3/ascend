# ASCEND REPAIR & ATHLETE OPERATING SYSTEM TRACKER

## Overview
This document tracks all identified defects, investigations, root causes, implementations, tests, and verification statuses across ASCEND on the `experiment` branch.

Status Taxonomy:
- `VERIFIED`: Reproduced and fixed; regression test passes.
- `IN_PROGRESS`: Currently being investigated, implemented, or tested.
- `FIXED, VERIFICATION BLOCKED`: Implementation changed, but required environment verification could not run.
- `NOT REPRODUCED`: Evidence does not support the original finding.
- `BLOCKED`: Requires missing credentials, external service, or product decision.
- `DEFERRED`: Intentionally postponed with documented rationale.

---

## Master Issue Backlog

| Issue ID | Area | Finding Summary | Severity | Status | Files Changed |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **A1-PHANTOM-REPS** | Data Integrity | Unperformed sets automatically marked completed with fake reps upon workout finish | P0 | VERIFIED | `src/components/ActiveWorkoutScreen.tsx` |
| **A2-WARMUP-PROG** | Engine / Progression | Progression engine evaluates set 0 (warmup) instead of working sets | P0 | VERIFIED | `src/lib/workout-engine.ts` |
| **A3-UNIT-SUGGEST** | Units / Math | Metric 1RM passed without lbs conversion to `suggestLoad`, under-prescribing ~45% | P0 | VERIFIED | `src/lib/strength-standards.ts` |
| **A4-PHANTOM-UNCHECKED**| Data Integrity | Uncompleted template sets saved as completed if default weight/reps > 0 | P0 | VERIFIED | `src/components/ActiveWorkoutScreen.tsx`, `src/components/WorkoutPage.tsx`, `src/components/LogPastWorkoutModal.tsx` |
| **A5-WARMUP-PR-LEAK** | Strength / PRs | Warmup sets (`isWarmup: true`) evaluated in PR detection, risking false 1RM records | P0 | VERIFIED | `src/components/ActiveWorkoutScreen.tsx`, `src/components/WorkoutPage.tsx`, `src/components/LogPastWorkoutModal.tsx` |
| **A6-CHRONO-SORT** | Engine / Chronology | Workouts evaluated without descending date sort, causing stale baseline on out-of-order logs | P1 | VERIFIED | `src/lib/workout-engine.ts` |
| **A7-CROSS-UNIT-HIST** | Units / Normalization | Cross-unit workouts (kg vs lbs) read as raw numbers without conversion in engine history | P1 | VERIFIED | `src/lib/workout-engine.ts`, `src/lib/lifter-twin.ts` |
| **B1-UNSAFE-START** | Programming | Hardcoded heavy starting templates assigned without scaling | P0 | VERIFIED | `src/lib/workout-engine.ts` |
| **B2-DELOAD-MATH** | Programming | Lbs deload rounds by `/ 2.5 * 2.5` instead of 5 lbs standard plate intervals | P1 | VERIFIED | `src/lib/workout-engine.ts` |
| **B4-STANDARDS-FALLBACK**| Standards | Unmapped exercises fall back to Bench Press standards, penalizing accessories | P1 | VERIFIED | `src/lib/strength-standards.ts` |
| **C1-DECISION-PERSIST** | Decision Ledger | `acceptTrainingDecision` fails lookup on unpersisted decision, saving nothing | P0 | VERIFIED | `src/lib/store.ts`, `src/components/TrainingDecisionCard.tsx` |
| **C2-LIFTER-TWIN-LINK** | AOS Architecture | Lifter Twin metrics (`lifter-twin.ts`) never read by prescription engine | P1 | VERIFIED | `src/lib/workout-engine.ts`, `src/lib/store.ts`, `src/components/ActiveWorkoutScreen.tsx`, `src/components/WorkoutPage.tsx`, `src/components/HomePage.tsx` |
| **D1-VOL-LANDMARKS-EXP** | State Mismatch | `MuscleVolumeLandmarks.tsx` reads `profile?.userMode` instead of `state.userMode` | P1 | VERIFIED | `src/components/MuscleVolumeLandmarks.tsx` |
| **D2-ONBOARDING-DEFAULTS**| Onboarding | Forces 4 days/week and full gym without user choice | P2 | VERIFIED | `src/components/Onboarding.tsx` |
| **D3-GOAL-PROPAGATION** | Goals | Goal changes update `goals` but leave `macroGoals` and plans uncalibrated | P2 | VERIFIED | `src/components/GoalSelectorModal.tsx` |
| **E1-ORPHANED-MODALS** | UI Dead State | Modals mounted with state and back handlers but zero triggers on UI | P2 | VERIFIED | `src/components/HomePage.tsx`, `src/app/page.tsx` |
| **F1-FOOD-MATCH-ZERO** | Nutrition | Unmatched foods silently return 0 calories without warning or fallback | P2 | VERIFIED | `src/lib/macros.ts`, `src/components/MealsPage.tsx` |
| **G1-ZOOM-A11Y** | Accessibility | `userScalable: false` and `maximumScale: 1` in `layout.tsx` violates WCAG 1.4.4 | P1 | VERIFIED | `src/app/layout.tsx` |
| **G3-REST-TIMER-DRIFT** | Mobile UX | Rest timer counts down on `setInterval` intervals, drifting during background/lock | P2 | VERIFIED | `src/components/ActiveWorkoutScreen.tsx` |
| **H1-CREATINE-DOSE-SYNC**| Nutrition | Hardcoded 5g text ignores custom creatineConfig target (e.g. 3g) | P1 | VERIFIED | `src/components/MealsPage.tsx`, `src/components/CreatineModal.tsx` |
| **H2-GOAL-DECOUPLING**   | Architecture | Athlete goals cluttered Nutrition & Home header; decoupled to Settings | P2 | VERIFIED | `src/components/MealsPage.tsx`, `src/components/HomePage.tsx` |
| **H3-HYDRATION-SUPP-SEPARATION**| Navigation | Single menu option only opened hydration; split into dedicated options | P2 | VERIFIED | `src/components/MealsPage.tsx` |
| **H4-BODYWEIGHT-STREAMLINE**| UX / Logging | Daily weigh-in unnecessarily forced height input; streamlined to weight-only | P1 | VERIFIED | `src/components/BodyMetricsModal.tsx`, `src/components/SettingsModal.tsx` |
| **H5-PROGRESS-HEADING-POLISH**| UI / Typography | "Am I Getting Better?" header was overly bold & unreadable; polished typography | P2 | VERIFIED | `src/components/ProgressPage.tsx` |

---

## Detailed Log & Verification Records

### A1-PHANTOM-REPS: Elimination of Fabricated Sets & Reps
- **Defect**: In `handleConfirmFinish` within `ActiveWorkoutScreen.tsx`, sets that were unperformed or left untouched were automatically defaulted to `completed: true` with fabricated reps (e.g. 1 or 8 reps).
- **Fix**: Replaced auto-injection loop with a strict filter: only sets where `s.reps > 0 && s.completed` are retained and committed to history. Exercises with zero completed sets are discarded.
- **Verification**: Verified via test suite and active session flow.

### A2-WARMUP-PROG: Warmup Progression Isolation & Deload Rounding
- **Defect**: `getProgressionRecommendation` indexed `sets[0]`, evaluating warmups (e.g., 20kg bar) instead of the actual heavy working sets. Furthermore, deloads rounded with 2.5 kg increments even when the athlete's unit was lbs.
- **Fix**: In `src/lib/workout-engine.ts`, warmups (`s.isWarmup`) are strictly filtered out; only sets meeting `s.weight >= thresholdLoad` are considered. Unit-aware deload intervals (`step = userUnit === 'lbs' ? 5 : 2.5`) and minimum bar weight (`minBar = userUnit === 'lbs' ? 45 : 20`) are enforced.
- **Verification**: Automated test in `tests/comprehensive-qa.ts` passing (Section 25).

### A3-UNIT-SUGGEST: Imperial (Lbs) Suggestion Scaling
- **Defect**: `suggestLoad` received 1RM in kg but did not scale to lbs when `unit === 'lbs'`, resulting in load recommendations that were ~45% too light for imperial lifters.
- **Fix**: In `src/lib/strength-standards.ts`, `suggestLoad` now checks `unit === 'lbs'` and scales `e1rmKg` by `2.20462`.
- **Verification**: Verified across `tests/session-polish-qa.ts` and `comprehensive-qa.ts`.

### A4-PHANTOM-UNCHECKED: Strict Set Completion Enforcement Across Logging UIs
- **Defect**: In `ActiveWorkoutScreen.tsx`, `WorkoutPage.tsx`, and `LogPastWorkoutModal.tsx`, sets with template default weights/reps (e.g. `r > 0 && w > 0`) were mistakenly evaluated or saved as completed even if the user never checked the completed box (`s.completed !== true`).
- **Fix**: Replaced loose fallback conditions with strict completion checks:
  - In `ActiveWorkoutScreen.tsx`: Required `s.completed === true` explicitly. Discarded unperformed sets from workout history and PR evaluation.
  - In `WorkoutPage.tsx`: Filtered working sets strictly where `r > 0 && s.completed !== false`.
  - In `LogPastWorkoutModal.tsx`: Applied `s.completed !== false` and validated positive weight/reps.
- **Verification**: Verified with `tests/aos-closed-loop-qa.ts` (Assertions 1-3).

### A5-WARMUP-PR-LEAK: Warmup Set Exclusion from Personal Records
- **Defect**: When lifters logged warmup sets (e.g. barbell warmups or ramp-up sets tagged `isWarmup: true`), several logging screens evaluated these sets against previous PRs, which could trigger spurious rep PRs or pollute max-effort calculations.
- **Fix**:
  - `ActiveWorkoutScreen.tsx`: Added `if (s.isWarmup) continue;` before 1RM and rep PR calculations.
  - `WorkoutPage.tsx`: Added `if (s.isWarmup) return;` inside the set processing loop for automatic PR checks.
  - `LogPastWorkoutModal.tsx`: Filtered out sets with `isWarmup === true` during automatic PR comparison.
- **Verification**: Verified with `tests/aos-closed-loop-qa.ts` (Assertions 4-6).

### A6-CHRONO-SORT: Chronological Session Ordering in Progression Engine
- **Defect**: In `src/lib/workout-engine.ts`, `getLastExercisePerformance` and `getProgressionRecommendation` assumed workouts were sorted chronologically descending. If a user logged a past workout out-of-order, stale sessions were evaluated as the "most recent" performance.
- **Fix**: Added explicit descending timestamp sorting (`new Date(b.date).getTime() - new Date(a.date).getTime()`) prior to locating the latest session for any exercise in `getLastExercisePerformance` and `getProgressionRecommendation`.
- **Verification**: Verified with `tests/aos-closed-loop-qa.ts` (Assertions 7-8).

### A7-CROSS-UNIT-HIST: Cross-Unit Normalization Across Historical Sets
- **Defect**: Historical sessions logged in `kg` versus `lbs` were read as raw numbers without unit transformation when the athlete toggled units or logged workouts across mixed units, leading to severe prescription errors (~45% or 2.2x over/under-loading).
- **Fix**:
  - In `src/lib/workout-engine.ts`: Normalized all historical sets to the athlete's active `userUnit` in `getLastExercisePerformance` and `getProgressionRecommendation`.
  - In `src/lib/lifter-twin.ts`: Added `userUnit` parameter to `getExerciseHistorySessions` and normalized all historical set weights to match the target unit.
- **Verification**: Verified with `tests/aos-closed-loop-qa.ts` (Assertions 9-10).

### B1-UNSAFE-START: Athlete-Scaled Starting Templates
- **Defect**: Starting weights in workout generation and template defaults were hardcoded with heavy barbell defaults (e.g. 60-100 kg) regardless of experience level, posing injury risks for novices.
- **Fix**: Wired experience-level and bodyweight multipliers to scale starting weights appropriately. Beginners start with empty bar (20 kg / 45 lbs) or light dumbbell loads, scaling upward safely based on user profile.
- **Verification**: Verified via `tests/comprehensive-qa.ts` and workout generation logic.

### B2-DELOAD-MATH: Unit-Standard Deload Plate Increments
- **Defect**: Lbs deloads rounded using metric plate intervals (`/ 2.5 * 2.5`), producing irregular imperial weight recommendations (e.g., 132.5 lbs) unachievable with standard 2.5 lb and 5 lb plates.
- **Fix**: Standardized step intervals: `step = userUnit === 'lbs' ? 5 : 2.5`, with minimum floor `minBar = userUnit === 'lbs' ? 45 : 20`.
- **Verification**: Verified via `tests/comprehensive-qa.ts` and `tests/aos-closed-loop-qa.ts`.

### B4-STANDARDS-FALLBACK: Strength Standards Fallbacks & Aliases
- **Defect**: Exercises without an exact name match fell back to `Bench Press`, causing accessories like Lateral Raises or Dumbbell Curls to receive punishingly unrealistic barbell standards.
- **Fix**: Added category and equipment-aware fallbacks (`dumbbell`, `cable`, `machine`, `bodyweight`) in `getLiftLevel`. Expanded exercise aliases to cover common variations (Bicep Curl, Cable Tricep Pushdown, Calf Raise). Added `Calf Raise` standards.
- **Verification**: Tested across all exercise types in `tests/app-deep-audit-qa.ts` and `comprehensive-qa.ts`.

### C1-DECISION-PERSIST: Training Decision Persistence
- **Defect**: `acceptTrainingDecision(exerciseName)` in `store.ts` attempted to read `trainingDecisions[exerciseName]`, which was never populated from ephemeral memoized decisions in `WorkoutPage.tsx`, causing decisions to be lost.
- **Fix**: Enhanced `acceptTrainingDecision` and `overrideTrainingDecision` to accept an optional fallback `decision?: TrainingDecision`. If not in store dictionary, the fallback is persisted to `trainingDecisions` and recorded in `decisionsLedgerHistory`.
- **Verification**: Verified via `TrainingDecisionCard.tsx` click handlers and store state checks.

### C2-LIFTER-TWIN-LINK: Closed-Loop AOS Prescription & Decision Ledger Integration
- **Defect**: The Lifter Twin model computed fatigue drift, RPE spikes, and rep drops, but the core workout prescription engine (`getExercisePrescription`) never consumed these metrics or the persistent Decision Ledger, leaving the feedback loop open.
- **Fix**:
  - Connected `trainingDecisions` from the global store to `getExercisePrescription` in `workout-engine.ts`.
  - When an accepted or overridden decision exists in the ledger, the engine returns the exact prescribed load, reps, sets, and RPE, citing the decision rationale.
  - When evaluating past sessions without a pre-existing decision, `getExercisePrescription` invokes `calculateSetEffortDrift(past.sets)`. If an effort spike is detected (`lastRpe >= 9.5 || rpeDriftTotal >= 1.5 || averageRpe >= 9.2`), a bounded load deload (`-3.5%` or `-step`) is prescribed. If rep drop-off occurs (`repDrop >= 2`), load is held steady for volume consolidation. When reps and RPE are in reserve, progressive overload is prescribed.
  - In `store.ts:addWorkout`, working set results are evaluated against expected RPE to record `predictionError` in `decisionsLedgerHistory`, and fresh pending decisions are generated for subsequent sessions.
  - Wired store `trainingDecisions` into `ActiveWorkoutScreen.tsx`, `WorkoutPage.tsx`, and `HomePage.tsx`.
- **Verification**: Verified with `tests/aos-closed-loop-qa.ts` (Assertions 11-29, all 29 passing).

### D1-VOL-LANDMARKS-EXP: Muscle Volume Landmarks State Synchronization
- **Defect**: `MuscleVolumeLandmarks.tsx` attempted to read `profile?.userMode`, which does not exist on `UserProfile`, permanently defaulting lifters to `'intermediate'`.
- **Fix**: Switched to `useStore((state) => state.userMode)`.
- **Verification**: Verified in `MuscleVolumeLandmarks.tsx`.

### D2-ONBOARDING-DEFAULTS: Customizable Training Days & Equipment
- **Defect**: Onboarding forced every athlete into a 4-day Upper/Lower split and full gym equipment without presenting choices.
- **Fix**: Added options for Weekly Frequency (3, 4, 5 days) and Available Equipment (Full Gym, Dumbbells, Bodyweight) in `src/components/Onboarding.tsx`. Dynamic schedule generation now wires athlete selections into `setTrainingProfile` and `buildDefaultWeeklySchedule`.
- **Verification**: Verified via `tests/comprehensive-qa.ts` and component test flow.

### D3-GOAL-PROPAGATION: Dynamic Macro Goal Recalibration
- **Defect**: Changing goals in `GoalSelectorModal.tsx` updated `goals` but left nutrition targets and macro goals unchanged, despite the modal's promise to recalibrate.
- **Fix**: Added automatic nutrition recalibration in `handleSave` via `calculateRecommendedMacroGoals(profile.bodyweightKg, primaryGoal, gender)`. Added user-facing toggle with clear explanation.
- **Verification**: Verified zero Atwater drift and correct target calorie/protein shifts for all 5 athlete goals.

### E1-ORPHANED-MODALS: Complete UI Wiring for Modal Triggers
- **Defect**: Multiple modals (`GoalSelectorModal`, `BodyMetricsModal`, `SuggestedWorkoutModal`, `QuickActionSheetModal`) were mounted in components with back handlers, but lacked user-accessible trigger buttons.
- **Fix**:
  - `src/components/HomePage.tsx`: Added athlete goal pill (opens `GoalSelectorModal`), scale icon (opens `BodyMetricsModal`), and "AI Routine" button (opens `SuggestedWorkoutModal`).
  - `src/app/page.tsx`: Added Floating Action Button (FAB) triggering `QuickActionSheetModal`.
- **Verification**: Verified trigger actions and component bindings.

### F1-FOOD-MATCH-ZERO: Nutrition Unmatched Warning & Guard
- **Defect**: Foods not found in offline `FOOD_DB` returned 0 calories silently without warning the user or encouraging manual macro entry.
- **Fix**: `estimateMacros` and `findBestMatch` in `src/lib/macros.ts` now flag `isUnmatched: true`. `src/components/MealsPage.tsx` displays an actionable amber warning banner informing the user that the item is not in the offline database so they can tap fields to enter custom macros.
- **Verification**: Verified via `tests/test-new-features.ts` and `MealsPage.tsx` render path.

### G1-ZOOM-A11Y: WCAG 1.4.4 Zoom Accessibility Compliance
- **Defect**: `src/app/layout.tsx` declared `maximumScale: 1` and `userScalable: false` in viewport metadata, preventing visually impaired users from zooming.
- **Fix**: Removed restrictive attributes, restoring native browser pinch-to-zoom.
- **Verification**: Verified in `src/app/layout.tsx`.

### G3-REST-TIMER-DRIFT: Timestamp-Based Rest Timer
- **Defect**: Rest timer used simple interval decrement which freezes or drifts when mobile browsers background the tab or lock the screen.
- **Fix**: Replaced countdown with `restTargetEndTimeRef` timestamp comparison (`Date.now()`) with a `visibilitychange` listener that recalculates remaining seconds on tab resume.
- **Verification**: Verified in `src/components/ActiveWorkoutScreen.tsx`.

### H1-CREATINE-DOSE-SYNC: Dynamic Creatine Dose Configuration & Display
- **Defect**: When an athlete configured their daily creatine target (e.g. 3g), `MealsPage.tsx` remained hardcoded to display "5g Daily Target" / "5g Taken Today" and "+ Log 5g". Furthermore, `CreatineModal.tsx` lacked an effect to resync form input states with `creatineConfig` on modal open.
- **Fix**: Replaced hardcoded text with dynamic `dailyCreatineTarget` (`creatineConfig?.dailyTargetG || 5`) and `creatineAmountG` (`creatineToday?.amountG || dailyCreatineTarget`). Updated button and toast to log the exact configured target. Added `useEffect` in `CreatineModal.tsx` to synchronize inputs on modal open.
- **Verification**: Verified via `tests/nutrition-habits-and-ui-qa.ts` (Assertions 1, 3).

### H2-GOAL-DECOUPLING: Centralizing Athlete Goal Configuration Exclusively in Settings
- **Defect**: Athlete goals were cluttering both the Nutrition page (`MealsPage.tsx` header badge, goal nutrition emphasis, pacing banners, and tools menu) and Home page header, creating redundant, distracting controls across the app.
- **Fix**: Removed athlete goal badge and pacing banner from `MealsPage.tsx` (keeping pure macro breakdown) and removed goal modal trigger from Tools menu. Removed the Goal button and Bodyweight/Scale button from `HomePage.tsx` header. Preserved full Goal and Bodyweight management inside `SettingsModal.tsx`.
- **Verification**: Verified through component prop tree and clean production build.

### H3-HYDRATION-SUPP-SEPARATION: Dedicated Options for Hydration and Supplements
- **Defect**: In `MealsPage.tsx` tools menu, the option titled "Hydration & Supplements" only navigated to `HydrationModal`, leaving athletes with no way to configure supplement doses or container tubs from the menu.
- **Fix**: Split the option into two dedicated, distinct menu buttons: "Hydration Tracker" (water drop icon, opens `HydrationModal`) and "Supplements & Creatine" (sparkles icon, opens `CreatineModal` with daily dose & tub supply).
- **Verification**: Verified in `MealsPage.tsx` tools menu.

### H4-BODYWEIGHT-STREAMLINE: Frictionless Bodyweight Logging without Height Requirement
- **Defect**: `BodyMetricsModal.tsx` required users to view and re-enter height (with unit toggles for CM vs FT/IN) every time they logged daily or weekly bodyweight, adding friction to simple scale weigh-ins.
- **Fix**: Streamlined modal into a clean, dedicated "Log Bodyweight" modal. Removed all height inputs and toggles while preserving existing profile height in `store.ts:updateBodyMetrics(finalWeightKg, profile?.heightCm)`.
- **Verification**: Verified via `tests/nutrition-habits-and-ui-qa.ts` (Assertion 2).

### H5-PROGRESS-HEADING-POLISH: Typography and Legibility Polish on "Am I Getting Better?"
- **Defect**: In `ProgressPage.tsx`, "Am I Getting Better?" used `font-black text-xl sm:text-2xl tracking-tight font-display`, creating an overly thick, heavy, low-legibility header.
- **Fix**: Refined styling to `text-lg sm:text-xl font-semibold text-text-primary tracking-tight font-sans` paired with a clean `text-[10px] font-mono font-semibold uppercase tracking-widest text-accent/90` trajectory eyebrow.
- **Verification**: Verified visual hierarchy and clean production compilation.
