/**
 * UX redesign Stage 4 — workout view resolution.
 *
 * Open-items J5.1 DECOUPLED the workout view from Today density:
 * uiPreferences.workoutModeOverride is now the persisted workout-view
 * preference itself, and sanitizeUiPreferences materializes any
 * legacy null ("Auto = follow density") to the mode density resolved
 * at upgrade time. This resolver stays as the defensive read path:
 * a concrete override wins; a null/invalid override (only possible
 * in unsanitized legacy data) still falls back to the density rule,
 * which is exactly the value sanitize would have materialized.
 *
 * Pure derivation: it never writes the store and never touches the
 * legacy userMode key (onboarding still writes that key; it no
 * longer drives the perform/display split, whose rendering was
 * binary — `=== 'advanced'` vs everything else — so 'intermediate'
 * never rendered distinctly from 'beginner').
 */
export type WorkoutMode = 'beginner' | 'advanced';
export type WorkoutModeOverride = WorkoutMode | null;
export type AppDensity = 'simple' | 'detailed';

export function resolveWorkoutMode(
  density: AppDensity | string | undefined | null,
  override: WorkoutModeOverride | string | undefined | null,
): WorkoutMode {
  if (override === 'beginner' || override === 'advanced') return override;
  return density === 'detailed' ? 'advanced' : 'beginner';
}
