import { PROGRESSION_CONFIG } from '../../config/progression.config';
import { CharacterAttributes, WorkoutSession } from '../../types/domain.types';

export class AttributeEngine {
  /**
   * Computes updated 4-core attributes (Strength, Endurance, Mobility, Consistency)
   * on a 10-100 scale based on training activities, relative bodyweight metrics,
   * and PROGRESSION_CONFIG rules. Also provides legacy compatibility mappings (agility, stamina, discipline, vitality).
   */
  static computeAttributes(
    currentAttributes: CharacterAttributes,
    recentWorkouts: WorkoutSession[],
    currentStreak: number,
    scheduledRestDaysRespected: number = 0,
    plannedRestDays: number = 1,
    athleteBodyweightKg: number = 75
  ): CharacterAttributes {
    const config = PROGRESSION_CONFIG.attributes;
    const safeBw = Math.max(40, athleteBodyweightKg || 75);

    // 1. Strength metrics: heavy compound volume, peak load / Wilks, relative strength
    let heavyCompoundVolume = 0;
    let maxWilksScoreEstimate = 1.0;
    let maxRelativeCompoundRatio = 0.5;

    // 2. Endurance metrics: total reps and session density
    let totalReps = 0;
    let totalDurationMinutes = 0;
    let totalVolume = 0;

    // 3. Mobility & Agility metrics
    let mobilitySets = 0;
    let mobilitySessions = 0;
    let warmupSets = 0;
    let bodyweightVolume = 0;
    let unilateralSets = 0;
    let totalSets = 0;

    for (const workout of recentWorkouts) {
      if (workout.status !== 'COMPLETED') continue;

      const isMobilitySession =
        (workout.title && /mobility|stretch|yoga|recovery|flexibility/i.test(workout.title)) ||
        (workout.exercises || []).some(exLog =>
          exLog.exercise?.name && /mobility|stretch|foam roll|yoga/i.test(exLog.exercise.name)
        );

      if (isMobilitySession) {
        mobilitySessions++;
      }

      totalVolume += workout.totalVolumeKg || 0;
      totalReps += workout.totalReps || 0;
      totalSets += workout.totalSets || 0;
      totalDurationMinutes += Math.max(1, Math.round((workout.durationSeconds || 0) / 60));

      for (const exLog of workout.exercises || []) {
        const exName = exLog.exercise?.name?.toLowerCase() || '';
        const isCompound =
          exLog.exercise?.tier === 'COMPOUND_PRIMARY' ||
          exLog.exercise?.movementPattern === 'SQUAT' ||
          exLog.exercise?.movementPattern === 'HINGE' ||
          exLog.exercise?.movementPattern === 'PUSH_HORIZONTAL';

        const isBodyweight = exLog.exercise?.equipment === 'BODYWEIGHT';
        const isUnilateral =
          exLog.exercise?.movementPattern === 'LUNGE' ||
          exName.includes('unilateral') ||
          exName.includes('split squat') ||
          exName.includes('bulgarian');

        const isMobilityExercise =
          exLog.exercise?.progressionType === 'MOBILITY' ||
          exName.includes('mobility') ||
          exName.includes('stretch') ||
          exName.includes('yoga') ||
          exName.includes('band dislocate') ||
          exName.includes('face pull');

        for (const set of exLog.sets || []) {
          if (!set.completed) continue;
          const vol = set.weightKg * set.reps;

          if (set.setType === 'WARMUP') {
            warmupSets++;
          }

          if (isMobilityExercise) {
            mobilitySets++;
          }

          if (isCompound && (set.rpe === null || set.rpe === undefined || set.rpe >= 7.5)) {
            heavyCompoundVolume += vol;
            const relativeRatio = set.weightKg / safeBw;
            if (relativeRatio > maxRelativeCompoundRatio) {
              maxRelativeCompoundRatio = relativeRatio;
            }

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

    // Mathematical attribute calculations driven by PROGRESSION_CONFIG
    // STRENGTH: 10 + (28 * log10(1 + volume / 25000)) + (14 * (wilks / 2.5)) + (relativeStrength / 2.5 * 10)
    const strLog = Math.log10(1 + heavyCompoundVolume / config.strength.logDivisor);
    const relStrengthContribution = Math.min(15, Math.round((maxRelativeCompoundRatio / 2.0) * 15));
    const calculatedStr = Math.round(
      config.minAttributeScore +
        config.strength.volumeMultiplier * strLog +
        config.strength.wilksMultiplier * (maxWilksScoreEstimate / config.strength.wilksScale) +
        relStrengthContribution
    );
    const strength = Math.min(
      config.maxAttributeScore,
      Math.max(currentAttributes.strength || config.minAttributeScore, calculatedStr)
    );

    // ENDURANCE: 10 + (30 * (totalReps / 2000)) + (20 * (avgDensity / 120))
    const avgDensity = totalDurationMinutes > 0 ? totalVolume / totalDurationMinutes : 0;
    const calculatedEnd = Math.round(
      config.minAttributeScore +
        config.endurance.repsMultiplier * (totalReps / config.endurance.repsDivisor) +
        config.endurance.densityMultiplier * (avgDensity / config.endurance.densityDivisor)
    );
    const prevEnd = currentAttributes.endurance || currentAttributes.stamina || config.minAttributeScore;
    const endurance = Math.min(config.maxAttributeScore, Math.max(prevEnd, calculatedEnd));

    // MOBILITY: 10 + (mobilitySessions * 10) + (warmupSets * 2) + (unilateralSets / totalSets * 20) + activeRecovery
    const uniRatioMob = totalSets > 0 ? unilateralSets / totalSets : 0.05;
    const calculatedMob = Math.round(
      config.minAttributeScore +
        Math.min(35, mobilitySessions * 12) +
        Math.min(25, mobilitySets * 3 + warmupSets * 1.5) +
        Math.min(20, uniRatioMob * 30) +
        (scheduledRestDaysRespected > 0 ? 10 : 0)
    );
    const prevMob = currentAttributes.mobility || config.minAttributeScore;
    const mobility = Math.min(config.maxAttributeScore, Math.max(prevMob, calculatedMob));

    // AGILITY: 10 + (40 * bwRatio) + (30 * uniRatio)
    const bwRatio = totalVolume > 0 ? bodyweightVolume / totalVolume : 0.1;
    const uniRatio = totalSets > 0 ? unilateralSets / totalSets : 0.1;
    const calculatedAgi = Math.round(
      config.minAttributeScore +
        config.agility.bodyweightRatioMultiplier * bwRatio +
        config.agility.unilateralRatioMultiplier * uniRatio
    );
    const agility = Math.min(
      config.maxAttributeScore,
      Math.max(currentAttributes.agility || config.minAttributeScore, calculatedAgi)
    );

    // CONSISTENCY: 10 + (45 * (streak / 30)) + adherenceBonus
    const calculatedCon = Math.round(
      config.minAttributeScore +
        config.consistency.streakMultiplier * Math.min(1, currentStreak / config.consistency.streakDaysDivisor) +
        config.consistency.baseAdherenceBonus
    );
    const prevCon = currentAttributes.consistency || currentAttributes.discipline || config.minAttributeScore;
    const consistency = Math.min(config.maxAttributeScore, Math.max(prevCon, calculatedCon));

    // Backward-compatibility aliases
    const stamina = endurance;
    const discipline = consistency;
    const vitality = Math.min(
      config.maxAttributeScore,
      Math.max(
        currentAttributes.vitality || config.minAttributeScore,
        Math.round((endurance + consistency) / 2)
      )
    );

    return {
      strength,
      endurance,
      mobility,
      consistency,
      agility,
      stamina,
      discipline,
      vitality,
    };
  }
}
