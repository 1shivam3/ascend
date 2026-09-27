import {
  FitnessComparisonEvaluation,
  UserPerformanceInput,
  ReferenceBenchmark,
} from '../../types/comparison.types';
import { getReferenceBenchmark } from '../../config/population_benchmarks.config';
import { calculateEpley1RM } from '../../utils/1rm';
import { ExerciseRepository } from '../../database/repositories/ExerciseRepository';
import { ProfileRepository } from '../../database/repositories/ProfileRepository';
import { MasteryRepository } from '../../database/repositories/MasteryRepository';
import { getDatabase } from '../../database/sqlite';
import { STARTER_EXERCISES } from '../../constants/exercises';

export interface EvaluateComparisonParams {
  userId?: string;
  exerciseId: string;
  exerciseName?: string;
  userPerformance?: UserPerformanceInput;
  bodyweightKg?: number;
}

export class FitnessComparisonService {
  /**
   * Pure evaluation function: computes the 11-point transparent comparison
   * without database side effects.
   */
  static calculateComparison(params: {
    exerciseId: string;
    exerciseName: string;
    primaryMuscle?: string;
    movementPattern?: string;
    userPerformance: UserPerformanceInput;
    bodyweightKg: number;
    benchmarkOverride?: ReferenceBenchmark;
  }): FitnessComparisonEvaluation {
    const {
      exerciseId,
      exerciseName,
      primaryMuscle = 'Compound Movement',
      movementPattern = 'Full Body',
      userPerformance,
      bodyweightKg,
      benchmarkOverride,
    } = params;

    const benchmark = benchmarkOverride || getReferenceBenchmark(exerciseId, exerciseName);
    const weight = Math.max(0, userPerformance.weightKg || 0);
    const reps = Math.max(0, userPerformance.reps || 0);
    const rpe = userPerformance.rpe ?? null;
    const safeBodyweight = bodyweightKg > 0 ? bodyweightKg : 75.0;

    // 10. Whether the value is estimated or tested
    let performanceValueType: 'TESTED_1RM' | 'ESTIMATED_1RM' | 'BEST_WORKING_SET' | 'BODYWEIGHT_REPETITIONS';
    let effective1RmKg = 0;
    let summaryText = '';

    const isRepetitionBased =
      benchmark.supportedMetrics.includes('REPETITIONS') &&
      !benchmark.supportedMetrics.includes('1RM');

    if (isRepetitionBased) {
      performanceValueType = 'BODYWEIGHT_REPETITIONS';
      effective1RmKg = safeBodyweight; // effective moved mass is bodyweight
      summaryText = `${reps} consecutive repetitions (bodyweight)`;
    } else if (userPerformance.isTested1Rm || (reps === 1 && (rpe === null || rpe >= 8.5))) {
      performanceValueType = 'TESTED_1RM';
      effective1RmKg = weight;
      summaryText = `${weight} kg × 1 rep (Tested 1RM)`;
    } else if (reps > 1) {
      performanceValueType = 'ESTIMATED_1RM';
      // Submaximal Epley formula is scientifically validated up to 10 reps
      const calculationReps = Math.min(reps, 10);
      effective1RmKg = calculateEpley1RM(weight, calculationReps);
      if (reps > 10) {
        summaryText = `${weight} kg × ${reps} reps (Estimated via submaximal Epley ≤ 10 reps)`;
      } else {
        summaryText = `${weight} kg × ${reps} reps (~${effective1RmKg} kg Estimated 1RM)`;
      }
    } else {
      performanceValueType = 'BEST_WORKING_SET';
      effective1RmKg = weight;
      summaryText = `${weight} kg × ${reps} reps`;
    }

    // 4. Relative strength: lifted weight / body weight
    // For repetitions, relative strength ratio is 1.0 (moving 100% BW) or reps per unit mass
    const relativeStrengthRatio =
      isRepetitionBased
        ? Math.round((reps / (safeBodyweight / 10)) * 100) / 100 // reps scaled per 10kg mass reference
        : Math.round((effective1RmKg / safeBodyweight) * 100) / 100;

    const relativeStrengthNote =
      'Relative strength = lifted weight / body weight. This is a useful metric, but it is not automatically a universal population ranking. Linear ratios naturally disadvantage heavier individuals due to geometric allometric scaling (muscle cross-sectional area scales with mass to the 2/3 power, M^0.67, rather than linear body mass).';

    // 11. Whether the user's data is self-reported or verified
    const dataVerificationStatus: 'VERIFIED_WORKOUT_DATA' | 'SELF_REPORTED' =
      userPerformance.isSelfReported || !userPerformance.verifiedSessionId
        ? 'SELF_REPORTED'
        : 'VERIFIED_WORKOUT_DATA';

    // Check if reliable benchmark data exists
    const hasReliableData =
      benchmark.cohortType !== 'INSUFFICIENT_DATA' &&
      Array.isArray(benchmark.normBands) &&
      benchmark.normBands.length > 0;

    let contextualObservation:
      | {
          tierName: string;
          description: string;
          percentileBand: string;
        }
      | undefined = undefined;

    if (hasReliableData && benchmark.normBands) {
      if (isRepetitionBased) {
        // Match by consecutive repetitions
        for (const band of benchmark.normBands) {
          const meetsMin = band.minReps === undefined || reps >= band.minReps;
          const meetsMax = band.maxReps === undefined || reps <= band.maxReps;
          if (meetsMin && meetsMax) {
            contextualObservation = {
              tierName: band.tierName,
              description: band.contextNote,
              percentileBand: band.percentileRangeDescription,
            };
            break;
          }
        }
      } else {
        // Match by relative strength ratio (effective1RM / bodyweight)
        for (const band of benchmark.normBands) {
          const meetsMin = band.minRatio === undefined || relativeStrengthRatio >= band.minRatio;
          const meetsMax = band.maxRatio === undefined || relativeStrengthRatio <= band.maxRatio;
          if (meetsMin && meetsMax) {
            contextualObservation = {
              tierName: band.tierName,
              description: band.contextNote,
              percentileBand: band.percentileRangeDescription,
            };
            break;
          }
        }
      }

      // Fallback if extreme outlier
      if (!contextualObservation) {
        const bands = benchmark.normBands;
        if (isRepetitionBased) {
          const lowest = bands[0];
          const highest = bands[bands.length - 1];
          if (reps < (lowest.minReps ?? 0)) {
            contextualObservation = {
              tierName: lowest.tierName,
              description: lowest.contextNote,
              percentileBand: lowest.percentileRangeDescription,
            };
          } else {
            contextualObservation = {
              tierName: highest.tierName,
              description: highest.contextNote,
              percentileBand: highest.percentileRangeDescription,
            };
          }
        } else {
          const lowest = bands[0];
          const highest = bands[bands.length - 1];
          if (relativeStrengthRatio < (lowest.minRatio ?? 0)) {
            contextualObservation = {
              tierName: lowest.tierName,
              description: lowest.contextNote,
              percentileBand: lowest.percentileRangeDescription,
            };
          } else {
            contextualObservation = {
              tierName: highest.tierName,
              description: highest.contextNote,
              percentileBand: highest.percentileRangeDescription,
            };
          }
        }
      }
    }

    return {
      // 1. Exercise
      exerciseId,
      exerciseName,
      primaryMuscle,
      movementPattern,

      // 2. User's entered performance
      enteredPerformance: {
        weightKg: weight,
        reps,
        rpe,
        effective1RmKg,
        summaryText,
      },

      // 3. Body weight
      bodyweightKg: safeBodyweight,

      // 4. Relative strength
      relativeStrengthRatio,
      relativeStrengthNote,

      // 5. Reference group
      referenceGroup: benchmark.referenceGroupDescription,

      // 6. Data source
      dataSource: benchmark.dataSourceCitation,

      // 7. Population and date, when available
      populationAndDate: `${benchmark.sampleDescription} (${benchmark.publicationDate})`,

      // 8. Method used
      methodUsed: `${benchmark.methodUsed}: ${benchmark.methodDescription}`,

      // 9. Limitations
      limitations: benchmark.limitations,

      // 10. Whether the value is estimated or tested
      performanceValueType,

      // 11. Whether the user's data is self-reported or verified
      dataVerificationStatus,

      // Reliable data state
      hasReliableData,
      insufficientDataMessage: hasReliableData
        ? undefined
        : benchmark.insufficientDataReason || 'Not enough reliable data for this comparison.',

      contextualObservation,

      generalPopulationCaveat:
        'ASCEND does not claim you are stronger than any percentage of the general population unless verified against representative epidemiological surveys. Resistance standards are based strictly on recreational trainee cohorts, not sedentary populations.',
      allometricScalingNote:
        'Allometric scaling law: Muscle cross-sectional area and force output scale geometrically with body mass to the 2/3 power (M^0.67), not linearly (M^1.0). Consequently, a 100 kg lifter moving 150 kg (1.5x) exerts greater raw muscle tension than a 60 kg lifter moving 90 kg (1.5x).',
    };
  }

  /**
   * Evaluates comparison with automated user data hydration from SQLite database.
   */
  static async evaluateUserComparison(
    params: EvaluateComparisonParams
  ): Promise<FitnessComparisonEvaluation> {
    const { userId, exerciseId, userPerformance: explicitPerformance, bodyweightKg: explicitWeight } = params;

    // 1. Resolve exercise metadata
    let exerciseName = params.exerciseName || '';
    let primaryMuscle = 'Compound Movement';
    let movementPattern = 'Full Body';

    try {
      const dbExercise = await ExerciseRepository.getById(exerciseId);
      if (dbExercise) {
        exerciseName = dbExercise.name;
        primaryMuscle = dbExercise.primaryMuscle;
        movementPattern = dbExercise.movementPattern;
      } else {
        const starter = STARTER_EXERCISES.find((e) => e.id === exerciseId);
        if (starter) {
          exerciseName = starter.name;
          primaryMuscle = starter.primaryMuscle;
          movementPattern = starter.movementPattern;
        }
      }
    } catch {
      // Fallback
    }

    if (!exerciseName) {
      exerciseName = exerciseId.replace(/^ex-/, '').replace(/-/g, ' ');
      exerciseName = exerciseName.charAt(0).toUpperCase() + exerciseName.slice(1);
    }

    // 2. Resolve body weight
    let resolvedBodyweight = explicitWeight;
    if (!resolvedBodyweight && userId) {
      try {
        const profile = await ProfileRepository.getProfile(userId);
        if (profile?.weightKg) {
          resolvedBodyweight = profile.weightKg;
        }
      } catch {
        // fallback
      }
    }
    const finalBodyweight = resolvedBodyweight && resolvedBodyweight > 0 ? resolvedBodyweight : 75.0;

    // 3. Resolve user performance
    let finalPerformance: UserPerformanceInput;

    if (explicitPerformance) {
      finalPerformance = explicitPerformance;
    } else if (userId) {
      // Hydrate best performance from workout logs
      const benchmark = getReferenceBenchmark(exerciseId, exerciseName);
      const isRepetitionBased =
        benchmark.supportedMetrics.includes('REPETITIONS') &&
        !benchmark.supportedMetrics.includes('1RM');

      let loggedBest: {
        weightKg: number;
        reps: number;
        rpe: number | null;
        sessionId: string | null;
        isTested1Rm: boolean;
      } | null = null;

      try {
        const db = await getDatabase();
        if (isRepetitionBased) {
          const row = await db.getFirstAsync<{
            weight_kg: number;
            reps: number;
            rpe: number | null;
            workout_id: string;
          }>(
            `SELECT sl.weight_kg, sl.reps, sl.rpe, el.workout_id
             FROM set_logs sl
             JOIN exercise_logs el ON el.id = sl.exercise_log_id
             WHERE el.exercise_id = ? AND sl.user_id = ? AND sl.completed = 1 AND sl.is_skipped = 0
             ORDER BY sl.reps DESC, sl.weight_kg DESC
             LIMIT 1;`,
            [exerciseId, userId]
          );
          if (row) {
            loggedBest = {
              weightKg: row.weight_kg,
              reps: row.reps,
              rpe: row.rpe,
              sessionId: row.workout_id,
              isTested1Rm: false,
            };
          }
        } else {
          // Look for best estimated 1RM or top single
          const row = await db.getFirstAsync<{
            weight_kg: number;
            reps: number;
            rpe: number | null;
            estimated_1rm_kg: number;
            workout_id: string;
          }>(
            `SELECT sl.weight_kg, sl.reps, sl.rpe, sl.estimated_1rm_kg, el.workout_id
             FROM set_logs sl
             JOIN exercise_logs el ON el.id = sl.exercise_log_id
             WHERE el.exercise_id = ? AND sl.user_id = ? AND sl.completed = 1 AND sl.is_skipped = 0
             ORDER BY sl.estimated_1rm_kg DESC, sl.weight_kg DESC
             LIMIT 1;`,
            [exerciseId, userId]
          );
          if (row) {
            const isSingle = row.reps === 1 && (row.rpe === null || row.rpe >= 8.5);
            loggedBest = {
              weightKg: row.weight_kg,
              reps: row.reps,
              rpe: row.rpe,
              sessionId: row.workout_id,
              isTested1Rm: isSingle,
            };
          }
        }
      } catch {
        // fallback
      }

      if (loggedBest) {
        finalPerformance = {
          weightKg: loggedBest.weightKg,
          reps: loggedBest.reps,
          rpe: loggedBest.rpe,
          isTested1Rm: loggedBest.isTested1Rm,
          isEstimated1Rm: !loggedBest.isTested1Rm && loggedBest.reps > 1,
          isSelfReported: false,
          verifiedSessionId: loggedBest.sessionId,
        };
      } else {
        // Try MasteryRepository
        try {
          const mastery = await MasteryRepository.getMastery(userId, exerciseId);
          if (mastery && (mastery.bestWeightKg > 0 || mastery.bestReps > 0)) {
            finalPerformance = {
              weightKg: mastery.bestWeightKg,
              reps: mastery.bestReps || 1,
              isTested1Rm: mastery.bestReps === 1,
              isEstimated1Rm: mastery.bestReps > 1,
              isSelfReported: false,
              verifiedSessionId: `mastery-${mastery.id}`,
            };
          } else {
            finalPerformance = {
              weightKg: 0,
              reps: 0,
              isSelfReported: true,
              verifiedSessionId: null,
            };
          }
        } catch {
          finalPerformance = {
            weightKg: 0,
            reps: 0,
            isSelfReported: true,
            verifiedSessionId: null,
          };
        }
      }
    } else {
      finalPerformance = {
        weightKg: 0,
        reps: 0,
        isSelfReported: true,
        verifiedSessionId: null,
      };
    }

    return this.calculateComparison({
      exerciseId,
      exerciseName,
      primaryMuscle,
      movementPattern,
      userPerformance: finalPerformance,
      bodyweightKg: finalBodyweight,
    });
  }
}
