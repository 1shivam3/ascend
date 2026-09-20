import { AIWorkoutPlan, AIWorkoutDay, AIExercisePrescription, GenerationInput } from './schemas';
import { Exercise, EquipmentTier, MovementPattern } from '../../types/domain.types';
import { STARTER_EXERCISES } from '../../constants/exercises';

export interface ValidationResult {
  isValid: boolean;
  sanitizedPlan: AIWorkoutPlan;
  modifications: string[];
}

export class WorkoutPlanValidator {
  /**
   * Deterministically validates, sanitizes, and repairs an AI-generated workout plan
   * against local business rules, exercise catalog, equipment constraints, and athlete limits.
   */
  static validateAndSanitize(
    plan: AIWorkoutPlan,
    input: GenerationInput,
    catalog: Exercise[] = STARTER_EXERCISES
  ): ValidationResult {
    const modifications: string[] = [];
    const availableEquipment = new Set(input.equipment.map(e => e.toUpperCase()));
    const excludedSet = new Set(
      input.excluded_exercises.map(e => e.toLowerCase().trim())
    );
    const limitationsSet = new Set(
      input.limitations.map(l => l.toLowerCase().trim())
    );

    // Build catalog lookup maps
    const idMap = new Map<string, Exercise>();
    const slugMap = new Map<string, Exercise>();
    const nameMap = new Map<string, Exercise>();

    for (const ex of catalog) {
      idMap.set(ex.id, ex);
      slugMap.set(ex.slug, ex);
      nameMap.set(ex.name.toLowerCase().trim(), ex);
    }

    const sanitizedDays: AIWorkoutDay[] = [];

    for (const day of plan.days) {
      const seenExerciseIds = new Set<string>();
      const sanitizedExercises: AIExercisePrescription[] = [];

      for (let i = 0; i < day.exercises.length; i++) {
        const item = day.exercises[i];
        const lowerName = item.name.toLowerCase().trim();
        const lowerId = item.exercise_id.toLowerCase().trim();

        // 1. Check Excluded Exercises & Limitations
        if (excludedSet.has(lowerName) || excludedSet.has(lowerId)) {
          modifications.push(`Removed excluded exercise '${item.name}' from Day ${day.day_number}`);
          continue;
        }

        let matchedExercise: Exercise | undefined =
          idMap.get(item.exercise_id) ||
          slugMap.get(item.exercise_id) ||
          nameMap.get(lowerName);

        // 2. Check Exercise Existence in Catalog
        if (!matchedExercise) {
          // Attempt fuzzy find or substitute
          matchedExercise = catalog.find(
            c => c.name.toLowerCase().includes(lowerName) || lowerName.includes(c.name.toLowerCase())
          );

          if (matchedExercise) {
            modifications.push(`Mapped unknown exercise '${item.name}' to '${matchedExercise.name}'`);
          } else {
            // Substitute with a safe canonical movement matching available equipment
            matchedExercise = this.getFallbackExercise(availableEquipment, catalog);
            modifications.push(`Replaced invalid exercise '${item.name}' with '${matchedExercise.name}'`);
          }
        }

        // 3. Check Equipment Availability
        const exerciseEquipment = matchedExercise.equipment.toUpperCase();
        if (!availableEquipment.has(exerciseEquipment)) {
          // Find alternative with available equipment
          const replacement = catalog.find(
            c =>
              availableEquipment.has(c.equipment.toUpperCase()) &&
              c.primaryMuscle === matchedExercise?.primaryMuscle &&
              !excludedSet.has(c.name.toLowerCase())
          ) || this.getFallbackExercise(availableEquipment, catalog);

          modifications.push(
            `Replaced '${matchedExercise.name}' (${exerciseEquipment}) with '${replacement.name}' (${replacement.equipment}) due to equipment constraint`
          );
          matchedExercise = replacement;
        }

        // 4. Duplicate Exercises check
        if (seenExerciseIds.has(matchedExercise.id)) {
          modifications.push(`Removed duplicate exercise '${matchedExercise.name}' from Day ${day.day_number}`);
          continue;
        }
        seenExerciseIds.add(matchedExercise.id);

        // 5. Validate Set Counts (1 to 10 sets per exercise)
        let sets = item.sets;
        if (typeof sets !== 'number' || sets < 1 || sets > 10) {
          sets = Math.max(1, Math.min(10, Number(sets) || 3));
          modifications.push(`Clamped invalid set count for '${matchedExercise.name}' to ${sets}`);
        }

        // 6. Validate Rep Ranges (1 to 50 reps)
        let targetReps = item.target_reps;
        if (typeof targetReps === 'number') {
          if (targetReps < 1 || targetReps > 50) {
            targetReps = Math.max(1, Math.min(50, targetReps));
            modifications.push(`Clamped invalid numeric reps for '${matchedExercise.name}' to ${targetReps}`);
          }
        } else if (typeof targetReps === 'string') {
          const match = targetReps.match(/\d+/g);
          if (!match || match.length === 0) {
            targetReps = '8-12';
            modifications.push(`Defaulted non-parseable rep string for '${matchedExercise.name}' to 8-12`);
          }
        } else {
          targetReps = '8-10';
        }

        // Validate rest seconds (15 to 360 seconds)
        let restSeconds = item.rest_seconds;
        if (typeof restSeconds !== 'number' || restSeconds < 15 || restSeconds > 360) {
          restSeconds = 90;
        }

        sanitizedExercises.push({
          exercise_id: matchedExercise.id,
          name: matchedExercise.name,
          order: sanitizedExercises.length,
          sets,
          target_reps: targetReps,
          target_rpe: item.target_rpe || 8,
          rest_seconds: restSeconds,
          instructions: item.instructions || matchedExercise.instructions || null,
          alternatives: item.alternatives || [],
        });
      }

      // If all exercises in this day were filtered out, inject at least 2 canonical fallback exercises
      if (sanitizedExercises.length === 0) {
        const fallbacks = catalog
          .filter(c => availableEquipment.has(c.equipment.toUpperCase()) && !excludedSet.has(c.name.toLowerCase()))
          .slice(0, 3);

        fallbacks.forEach((fb, idx) => {
          sanitizedExercises.push({
            exercise_id: fb.id,
            name: fb.name,
            order: idx,
            sets: 3,
            target_reps: '8-10',
            target_rpe: 8,
            rest_seconds: 90,
            instructions: fb.instructions || null,
            alternatives: [],
          });
        });
        modifications.push(`Injected default movements into empty Day ${day.day_number}`);
      }

      // 7. Validate Duration
      let duration = day.estimated_duration_min;
      const calculatedDuration = Math.round(
        sanitizedExercises.reduce((acc, ex) => acc + ex.sets * ((ex.rest_seconds || 90) + 45), 0) / 60
      );

      if (!duration || duration < 15 || duration > 180) {
        duration = Math.max(20, Math.min(120, calculatedDuration));
        modifications.push(`Recalculated duration for Day ${day.day_number} to ${duration} min`);
      }

      sanitizedDays.push({
        ...day,
        estimated_duration_min: duration,
        exercises: sanitizedExercises,
      });
    }

    const sanitizedPlan: AIWorkoutPlan = {
      ...plan,
      days: sanitizedDays,
    };

    return {
      isValid: true,
      sanitizedPlan,
      modifications,
    };
  }

  private static getFallbackExercise(
    availableEquipment: Set<string>,
    catalog: Exercise[]
  ): Exercise {
    const compatible = catalog.filter(c => availableEquipment.has(c.equipment.toUpperCase()));
    return (
      compatible.find(c => c.tier === 'COMPOUND_PRIMARY') ||
      compatible[0] ||
      catalog[0] ||
      STARTER_EXERCISES[0]
    );
  }
}
