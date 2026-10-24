/**
 * UX redesign Stage 4 — workout view resolution.
 *
 * The perform surface's Beginner/Advanced split now follows the app
 * density by default (Simple -> Beginner, Detailed -> Advanced) unless
 * the user pinned an explicit workoutModeOverride (null = follow
 * density; an explicit override survives density switches).
 *
 * This is a pure derivation: it never writes the store and never
 * touches the legacy userMode key (onboarding still writes that key;
 * it no longer drives the perform/display split, whose rendering was
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
