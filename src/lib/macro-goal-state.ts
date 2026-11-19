/**
 * N1 (bug program Phase 2) — the ONE home for macro-target
 * provenance, rounding, and input snapshots.
 *
 * Before this module, `MacroGoals` was a bare numbers bag: any write
 * path could replace it, the store's safety enforcement rewrote it
 * silently, and no surface could say where the numbers came from or
 * what they were derived from. The gym-video bug (owner saves
 * 3,000 kcal, the app stores 2,356 and the toast quotes 3,000) was
 * the visible symptom.
 *
 * The contract now:
 *  - every write through the store's setMacroGoals is stamped with
 *    { source, updatedAt, inputsSnapshot } and rounded by the ONE
 *    rounding rule below;
 *  - setMacroGoals RETURNS the stored goals (read-back) so callers
 *    report what actually landed, never what was typed;
 *  - a 'manual' target is never overwritten by automatic
 *    recalculation (the safety envelope in lib/minor-targets still
 *    applies to every source — see N3).
 */
import { normalizeCalorieDelta } from './macros';
import { resolvePrimaryGoal, type MacroGoalInputsSnapshot, type MacroGoalSource, type MacroGoals } from './types';

/**
 * The source of a stored target, or null when it was never recorded.
 * Pre-Phase-2 saves carry no source — and they are NOT treated as
 * manual: before Phase 2 the app's contract was "targets follow the
 * profile" (a minor's clamped target unlocks at 18; an unknown-age
 * target unlocks when the DOB arrives), and no user was ever
 * promised manual permanence. The 'manual' protection therefore
 * applies only to targets explicitly saved as manual from Phase 2
 * onward. Legacy targets still gain the Phase 2 protections that
 * don't depend on provenance: every automatic change is restamped
 * and written to the diagnostics log instead of happening silently.
 */
export function goalSource(goals: MacroGoals | null | undefined): MacroGoalSource | null {
  if (!goals) return null;
  return goals.source ?? null;
}

/**
 * THE rounding rule for stored targets: whole kcal and whole grams,
 * everywhere, applied once at the store write. (Derivations in
 * macros.ts already round their outputs; this rule exists so manual
 * and coach writes can't store fractional targets that then render
 * differently on different surfaces.)
 */
export function roundMacroGoals(goals: MacroGoals): MacroGoals {
  const out: MacroGoals = {
    ...goals,
    calories: Math.round(goals.calories),
    proteinG: Math.round(goals.proteinG),
  };
  if (goals.carbsG !== undefined) out.carbsG = Math.round(goals.carbsG);
  if (goals.fatG !== undefined) out.fatG = Math.round(goals.fatG);
  if (goals.maintenanceCalories !== undefined) {
    out.maintenanceCalories = Math.round(goals.maintenanceCalories);
  }
  if (goals.calorieDelta !== undefined) {
    out.calorieDelta = normalizeCalorieDelta(goals.calorieDelta);
  }
  return out;
}

/** The profile shape a snapshot can be taken from. */
export interface GoalInputsProfile {
  bodyweightKg?: number | null;
  heightCm?: number | null;
  age?: number | null;
  gender?: MacroGoalInputsSnapshot['gender'];
  goals?: Parameters<typeof resolvePrimaryGoal>[0];
}

/** Snapshot the inputs a target is being derived from, right now. */
export function snapshotGoalInputs(
  profile: GoalInputsProfile | null | undefined,
  activityLevel?: string,
): MacroGoalInputsSnapshot {
  const snap: MacroGoalInputsSnapshot = {};
  if (!profile) return snap;
  if (profile.bodyweightKg != null) snap.bodyweightKg = profile.bodyweightKg;
  if (profile.heightCm != null) snap.heightCm = profile.heightCm;
  if (profile.age != null) snap.age = profile.age;
  if (profile.gender != null) snap.gender = profile.gender;
  const goal = resolvePrimaryGoal(profile.goals);
  if (goal) snap.goal = goal;
  if (activityLevel) snap.activityLevel = activityLevel;
  return snap;
}

/** Round + stamp a target for storage. Pure: returns a new object.
 * The inputs snapshot is only attached when at least one input is
 * actually known — an empty snapshot would be noise, not provenance. */
export function stampMacroGoals(
  goals: MacroGoals,
  source: MacroGoalSource,
  profile: GoalInputsProfile | null | undefined,
  activityLevel?: string,
  now: Date = new Date(),
): MacroGoals {
  const snapshot = snapshotGoalInputs(profile, activityLevel);
  return {
    ...roundMacroGoals(goals),
    source,
    updatedAt: now.toISOString(),
    ...(Object.keys(snapshot).length > 0 ? { inputsSnapshot: snapshot } : {}),
  };
}
