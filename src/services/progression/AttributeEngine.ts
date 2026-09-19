import { CharacterAttributes, WorkoutSession } from '../../types/domain.types';

export class AttributeEngine {
  /**
   * Computes updated 5-core attributes (1-100 scale) based on rolling training history.
   */
  static computeAttributes(
    currentAttributes: CharacterAttributes,
    recentWorkouts: WorkoutSession[],
    currentStreak: number,
    scheduledRestDaysRespected: number = 0,
    plannedRestDays: number = 1
  ): CharacterAttributes {
    // 1. Strength Calculation
    // Driven by heavy compound volume and peak sets with high weight
    let heavyCompoundVolume = 0;
    let maxWilksScoreEstimate = 1.0;

    // 2. Stamina Calculation
    // Driven by total reps, high-rep sets (>10 reps), and workout density (volume/min)
    let totalReps = 0;
    let totalDurationMinutes = 0;
    let totalVolume = 0;

    // 3. Agility Calculation
    // Driven by bodyweight/calisthenics volume and unilateral exercises
    let bodyweightVolume = 0;
    let unilateralSets = 0;
    let totalSets = 0;

    for (const workout of recentWorkouts) {
      totalVolume += workout.totalVolumeKg;
      totalReps += workout.totalReps;
      totalSets += workout.totalSets;
      totalDurationMinutes += Math.max(1, Math.round(workout.durationSeconds / 60));

      for (const exLog of workout.exercises) {
        const isCompound = exLog.exercise?.tier === 'COMPOUND_PRIMARY';
        const isBodyweight = exLog.exercise?.equipment === 'BODYWEIGHT';
        const isUnilateral = exLog.exercise?.movementPattern === 'LUNGE';

        for (const set of exLog.sets) {
          if (!set.completed) continue;
          const vol = set.weightKg * set.reps;

          if (isCompound && (set.rpe === null || set.rpe >= 7.5)) {
            heavyCompoundVolume += vol;
            if (set.weightKg > 150) maxWilksScoreEstimate = Math.max(maxWilksScoreEstimate, 2.2);
            else if (set.weightKg > 100) maxWilksScoreEstimate = Math.max(maxWilksScoreEstimate, 1.6);
          }

          if (isBodyweight) {
            bodyweightVolume += vol;
          }

          if (isUnilateral) {
            unilateralSets++;
          }
        }
      }
    }

    // Mathematical attribute models clamped between 10 and 100
    // STR: 10 + 25 * log10(1 + heavyCompoundVolume / 20000) + 15 * (wilks / 2.5)
    const strLog = Math.log10(1 + heavyCompoundVolume / 20000);
    const calculatedStr = Math.round(10 + (28 * strLog) + (14 * (maxWilksScoreEstimate / 2.5)));
    const strength = Math.min(100, Math.max(currentAttributes.strength, calculatedStr));

    // STA: 10 + 30 * (totalReps / 2000) + 20 * (avgDensity / 120)
    const avgDensity = totalDurationMinutes > 0 ? totalVolume / totalDurationMinutes : 0;
    const calculatedSta = Math.round(10 + (30 * (totalReps / 2000)) + (20 * (avgDensity / 120)));
    const stamina = Math.min(100, Math.max(currentAttributes.stamina, calculatedSta));

    // AGI: 10 + 40 * (bwRatio) + 30 * (unilateralRatio)
    const bwRatio = totalVolume > 0 ? bodyweightVolume / totalVolume : 0.1;
    const uniRatio = totalSets > 0 ? unilateralSets / totalSets : 0.1;
    const calculatedAgi = Math.round(10 + (40 * bwRatio) + (30 * uniRatio));
    const agility = Math.min(100, Math.max(currentAttributes.agility, calculatedAgi));

    // DIS: 10 + 45 * (streak / 30) + 35 * completionRatio
    const calculatedDis = Math.round(10 + (45 * Math.min(1, currentStreak / 30)) + 30);
    const discipline = Math.min(100, Math.max(currentAttributes.discipline, calculatedDis));

    // VIT: 10 + 40 * (restRespected / plannedRest) + 30 * recoveryConsistency
    const restRatio = plannedRestDays > 0 ? Math.min(1, scheduledRestDaysRespected / plannedRestDays) : 0.5;
    const calculatedVit = Math.round(10 + (45 * restRatio) + 25);
    const vitality = Math.min(100, Math.max(currentAttributes.vitality, calculatedVit));

    return {
      strength,
      stamina,
      agility,
      discipline,
      vitality,
    };
  }
}
