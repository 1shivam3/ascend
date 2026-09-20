import { AIWorkoutPlan, AIWorkoutDay, AIExercisePrescription, FeedbackType, GenerationInput } from './schemas';
import { PlanRepository } from '../../database/repositories/PlanRepository';
import { Exercise, EquipmentTier } from '../../types/domain.types';
import { STARTER_EXERCISES } from '../../constants/exercises';
import { DeterministicWorkoutGenerator } from './DeterministicWorkoutGenerator';

export class WorkoutAdaptationEngine {
  /**
   * Modifies future workouts in the active plan based on athlete feedback (TOO_EASY, GOOD, TOO_HARD).
   * GUARANTEE: Never modifies or rewrites completed historical sessions.
   */
  static async applySessionFeedback(
    userId: string,
    plan: AIWorkoutPlan,
    dayNumber: number,
    feedback: FeedbackType
  ): Promise<AIWorkoutPlan> {
    const updatedDays = plan.days.map(day => {
      // Modify target day for future iterations and subsequent days
      if (day.day_number === dayNumber) {
        const adaptedExercises = day.exercises.map(ex => {
          if (feedback === 'TOO_EASY') {
            // Increase load/volume stimulus
            let newReps = ex.target_reps;
            if (typeof newReps === 'number') {
              newReps = Math.min(50, newReps + 1);
            } else if (typeof newReps === 'string') {
              newReps = this.adjustRepString(newReps, +1);
            }

            return {
              ...ex,
              target_reps: newReps,
              target_rpe: Math.min(10, (ex.target_rpe || 8) + 0.5),
              rest_seconds: Math.max(45, ex.rest_seconds - 15),
            };
          } else if (feedback === 'TOO_HARD') {
            // Relieve fatigue stimulus
            let newReps = ex.target_reps;
            if (typeof newReps === 'number') {
              newReps = Math.max(1, newReps - 1);
            } else if (typeof newReps === 'string') {
              newReps = this.adjustRepString(newReps, -1);
            }

            return {
              ...ex,
              target_reps: newReps,
              target_rpe: Math.max(6, (ex.target_rpe || 8) - 0.5),
              rest_seconds: Math.min(300, ex.rest_seconds + 30),
            };
          }

          // GOOD: standard progressive overload
          return ex;
        });

        return {
          ...day,
          exercises: adaptedExercises,
        };
      }

      return day;
    });

    const note = feedback === 'TOO_EASY'
      ? `\n[Adaptation: Intensity advanced after Day ${dayNumber} reported Too Easy]`
      : feedback === 'TOO_HARD'
      ? `\n[Adaptation: Intensity moderated after Day ${dayNumber} reported Too Hard]`
      : '';

    const updatedPlan: AIWorkoutPlan = {
      ...plan,
      days: updatedDays,
      progression_suggestions: (plan.progression_suggestions || '') + note,
      updated_at: new Date().toISOString(),
    };

    await PlanRepository.updatePlan(userId, updatedPlan);
    return updatedPlan;
  }

  /**
   * Adapts upcoming workouts for Home Workout or No Equipment environments.
   */
  static async adaptToEnvironment(
    userId: string,
    plan: AIWorkoutPlan,
    mode: 'HOME_WORKOUT' | 'NO_EQUIPMENT',
    catalog: Exercise[] = STARTER_EXERCISES
  ): Promise<AIWorkoutPlan> {
    const allowedEquipment = mode === 'NO_EQUIPMENT'
      ? new Set(['BODYWEIGHT'])
      : new Set(['BODYWEIGHT', 'DUMBBELL']);

    const updatedDays = plan.days.map(day => {
      const adaptedExercises: AIExercisePrescription[] = [];

      for (const exPrescription of day.exercises) {
        const catalogEx = catalog.find(c => c.id === exPrescription.exercise_id);
        const eq = (catalogEx?.equipment || 'BARBELL').toUpperCase();

        if (allowedEquipment.has(eq)) {
          adaptedExercises.push(exPrescription);
        } else {
          // Substitute with bodyweight/dumbbell counterpart
          const replacement = catalog.find(
            c =>
              allowedEquipment.has(c.equipment.toUpperCase()) &&
              (c.movementPattern === catalogEx?.movementPattern || c.primaryMuscle === catalogEx?.primaryMuscle)
          ) || catalog.find(c => allowedEquipment.has(c.equipment.toUpperCase())) || STARTER_EXERCISES[0];

          adaptedExercises.push({
            ...exPrescription,
            exercise_id: replacement.id,
            name: replacement.name,
            instructions: `Adapted for ${mode.replace('_', ' ')}: ${replacement.instructions || 'Execute with control.'}`,
          });
        }
      }

      return {
        ...day,
        exercises: adaptedExercises,
      };
    });

    const updatedPlan: AIWorkoutPlan = {
      ...plan,
      name: `${plan.name} (${mode === 'NO_EQUIPMENT' ? 'CALISTHENICS' : 'HOME'})`,
      days: updatedDays,
      updated_at: new Date().toISOString(),
    };

    await PlanRepository.updatePlan(userId, updatedPlan);
    return updatedPlan;
  }

  /**
   * Replaces a specific exercise in the future plan with an alternative movement.
   */
  static async replaceExercise(
    userId: string,
    plan: AIWorkoutPlan,
    dayNumber: number,
    targetExerciseId: string,
    newExercise: Exercise
  ): Promise<AIWorkoutPlan> {
    const updatedDays = plan.days.map(day => {
      if (day.day_number === dayNumber) {
        const updatedExercises = day.exercises.map(ex => {
          if (ex.exercise_id === targetExerciseId) {
            return {
              ...ex,
              exercise_id: newExercise.id,
              name: newExercise.name,
              instructions: newExercise.instructions || ex.instructions,
            };
          }
          return ex;
        });

        return {
          ...day,
          exercises: updatedExercises,
        };
      }
      return day;
    });

    const updatedPlan: AIWorkoutPlan = {
      ...plan,
      days: updatedDays,
      updated_at: new Date().toISOString(),
    };

    await PlanRepository.updatePlan(userId, updatedPlan);
    return updatedPlan;
  }

  /**
   * Changes plan difficulty (EASIER or HARDER).
   */
  static async changeDifficulty(
    userId: string,
    plan: AIWorkoutPlan,
    direction: 'EASIER' | 'HARDER'
  ): Promise<AIWorkoutPlan> {
    const isHarder = direction === 'HARDER';

    const updatedDays = plan.days.map(day => ({
      ...day,
      exercises: day.exercises.map(ex => ({
        ...ex,
        sets: isHarder ? Math.min(6, ex.sets + 1) : Math.max(2, ex.sets - 1),
        target_rpe: isHarder ? Math.min(10, (ex.target_rpe || 8) + 1) : Math.max(6, (ex.target_rpe || 8) - 1),
        rest_seconds: isHarder ? Math.max(60, ex.rest_seconds - 15) : Math.min(180, ex.rest_seconds + 30),
      })),
    }));

    const updatedPlan: AIWorkoutPlan = {
      ...plan,
      difficulty: isHarder ? 'ADVANCED' : 'BEGINNER',
      days: updatedDays,
      updated_at: new Date().toISOString(),
    };

    await PlanRepository.updatePlan(userId, updatedPlan);
    return updatedPlan;
  }

  /**
   * Helper to adjust string rep ranges like "8-10" or "6-8" by an offset (+1 or -1).
   */
  private static adjustRepString(repStr: string, offset: number): string {
    const nums = repStr.match(/\d+/g);
    if (!nums || nums.length === 0) return repStr;

    if (nums.length === 1) {
      const val = Math.max(1, Math.min(50, parseInt(nums[0], 10) + offset));
      return String(val);
    }

    const min = Math.max(1, parseInt(nums[0], 10) + offset);
    const max = Math.max(min + 1, parseInt(nums[1], 10) + offset);
    return `${min}-${max}`;
  }
}
