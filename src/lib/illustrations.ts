import { MuscleGroup } from './exercise-library';

/**
 * Maps muscle groups to illustration images.
 * Premium soft-flat vector illustrations showing proper form.
 */
const MUSCLE_IMAGE_MAP: Record<string, string> = {
  Chest: '/images/exercises/muscle-chest.webp',
  Back: '/images/exercises/muscle-back.webp',
  Legs: '/images/exercises/muscle-legs.webp',
  Shoulders: '/images/exercises/muscle-shoulders.webp',
  Arms: '/images/exercises/muscle-arms.webp',
  Core: '/images/exercises/muscle-core.webp',
  Conditioning: '/images/exercises/muscle-core.webp', // fallback
};

export function getMuscleGroupImage(muscle: MuscleGroup): string {
  return MUSCLE_IMAGE_MAP[muscle] || MUSCLE_IMAGE_MAP['Core'];
}

/**
 * Get illustration for empty states.
 */
export const EMPTY_STATE_IMAGES = {
  workouts: '/images/illustrations/empty-workouts.webp',
  meals: '/images/illustrations/empty-meals.webp',
  prs: '/images/illustrations/empty-prs.webp',
  photos: '/images/illustrations/empty-photos.webp',
} as const;

/**
 * Get badge image for achievements.
 */
export const BADGE_IMAGES = {
  firstWorkout: '/images/badges/badge-first-workout.webp',
  streak7: '/images/badges/badge-streak-7.webp',
  pr: '/images/badges/badge-pr.webp',
  hundredWorkouts: '/images/badges/badge-100-workouts.webp',
  earlyBird: '/images/badges/badge-early-bird.webp',
} as const;
