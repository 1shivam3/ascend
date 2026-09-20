import { SetLog, ExerciseLog } from '../../types/domain.types';
import { calculateEstimated1RM } from '../../utils/1rm';

export type PRType = 'MAX_WEIGHT' | 'MAX_ESTIMATED_1RM' | 'MAX_REPS' | 'MAX_VOLUME';

export interface DetectedPR {
  prType: PRType;
  exerciseId: string;
  exerciseName: string;
  previousValue: number;
  newValue: number;
  delta: number;
  unit: string;
  title: string;
  description: string;
  setLogId: string;
  xpBonus: number;
}

export class PREngine {
  static readonly PR_TITLES: Record<PRType, string> = {
    MAX_WEIGHT: 'HEAVIEST WEIGHT RECORD',
    MAX_ESTIMATED_1RM: 'ESTIMATED 1RM APEX',
    MAX_REPS: 'MAX REPETITION FEAT',
    MAX_VOLUME: 'SET TONNAGE OVERLOAD',
  };

  /**
   * Deterministically evaluates a completed set against existing PR records for an exercise.
   */
  static evaluateSetForPRs(
    set: SetLog,
    exerciseId: string,
    exerciseName: string,
    existingPrMap: Record<string, number>
  ): DetectedPR[] {
    if (!set.completed || set.isSkipped || set.setType === 'WARMUP' || set.reps <= 0 || set.weightKg <= 0) {
      return [];
    }

    const detected: DetectedPR[] = [];
    const e1rm = calculateEstimated1RM(set.weightKg, set.reps);
    const volume = set.weightKg * set.reps;

    // 1. Heaviest Weight PR
    const bestWeight = existingPrMap['MAX_WEIGHT'] || 0;
    if (set.weightKg > bestWeight) {
      const delta = set.weightKg - bestWeight;
      detected.push({
        prType: 'MAX_WEIGHT',
        exerciseId,
        exerciseName,
        previousValue: bestWeight,
        newValue: set.weightKg,
        delta: Math.round(delta * 10) / 10,
        unit: 'kg',
        title: this.PR_TITLES.MAX_WEIGHT,
        description: bestWeight > 0 
          ? `Elevated peak absolute load from ${bestWeight} kg to ${set.weightKg} kg (+${Math.round(delta * 10) / 10} kg)`
          : `Established baseline peak load at ${set.weightKg} kg`,
        setLogId: set.id,
        xpBonus: 150,
      });
      existingPrMap['MAX_WEIGHT'] = set.weightKg;
    }

    // 2. Estimated 1RM PR
    const best1Rm = existingPrMap['MAX_ESTIMATED_1RM'] || 0;
    if (e1rm > best1Rm) {
      const delta = e1rm - best1Rm;
      detected.push({
        prType: 'MAX_ESTIMATED_1RM',
        exerciseId,
        exerciseName,
        previousValue: best1Rm,
        newValue: e1rm,
        delta: Math.round(delta * 10) / 10,
        unit: 'kg',
        title: this.PR_TITLES.MAX_ESTIMATED_1RM,
        description: best1Rm > 0
          ? `Calculated 1RM advanced from ${best1Rm} kg to ${e1rm} kg (+${Math.round(delta * 10) / 10} kg)`
          : `Initialized calculated 1RM at ${e1rm} kg`,
        setLogId: set.id,
        xpBonus: 150,
      });
      existingPrMap['MAX_ESTIMATED_1RM'] = e1rm;
    }

    // 3. Rep PR (at non-trivial load)
    const bestReps = existingPrMap['MAX_REPS'] || 0;
    if (set.reps > bestReps) {
      const delta = set.reps - bestReps;
      detected.push({
        prType: 'MAX_REPS',
        exerciseId,
        exerciseName,
        previousValue: bestReps,
        newValue: set.reps,
        delta,
        unit: 'reps',
        title: this.PR_TITLES.MAX_REPS,
        description: bestReps > 0
          ? `Exceeded previous max reps from ${bestReps} to ${set.reps} reps (+${delta} reps)`
          : `Recorded initial rep benchmark of ${set.reps} reps`,
        setLogId: set.id,
        xpBonus: 100,
      });
      existingPrMap['MAX_REPS'] = set.reps;
    }

    // 4. Single-Set Volume PR
    const bestVolume = existingPrMap['MAX_VOLUME'] || 0;
    if (volume > bestVolume) {
      const delta = volume - bestVolume;
      detected.push({
        prType: 'MAX_VOLUME',
        exerciseId,
        exerciseName,
        previousValue: bestVolume,
        newValue: volume,
        delta: Math.round(delta * 10) / 10,
        unit: 'kg',
        title: this.PR_TITLES.MAX_VOLUME,
        description: bestVolume > 0
          ? `Single set tonnage expanded from ${Math.round(bestVolume)} kg to ${Math.round(volume)} kg (+${Math.round(delta)} kg)`
          : `Recorded initial single set tonnage benchmark of ${Math.round(volume)} kg`,
        setLogId: set.id,
        xpBonus: 100,
      });
      existingPrMap['MAX_VOLUME'] = volume;
    }

    return detected;
  }

  /**
   * Evaluates all completed sets across all exercises in a session to find all new PRs.
   */
  static evaluateWorkoutForPRs(
    exercises: ExerciseLog[],
    existingPrsByExercise: Record<string, Record<string, number>>
  ): DetectedPR[] {
    const allDetectedPRs: DetectedPR[] = [];

    for (const exLog of exercises) {
      const exerciseId = exLog.exerciseId;
      const exerciseName = exLog.exercise?.name || 'Movement';
      const existingPrMap = { ...(existingPrsByExercise[exerciseId] || {}) };

      for (const set of exLog.sets) {
        const prs = this.evaluateSetForPRs(set, exerciseId, exerciseName, existingPrMap);
        allDetectedPRs.push(...prs);
      }
    }

    return allDetectedPRs;
  }
}
