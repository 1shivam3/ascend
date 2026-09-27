import { PROGRESSION_CONFIG } from '../../config/progression.config';
import { SetLog, Exercise, PerformanceMetricType, RankConfirmationStatus } from '../../types/domain.types';
import { calculateEpley1RM } from '../../utils/1rm';

export interface SetClassificationResult {
  metricType: PerformanceMetricType;
  valueKg: number;
  is1RmEligible: boolean;
  explanation: string;
}

export interface OutlierCheckResult {
  isOutlier: boolean;
  reason?: string;
  sanitizedWeightKg: number;
}

export interface VerificationStatusResult {
  status: RankConfirmationStatus;
  verifiedSessionsCount: number;
  sessionsRemaining: number;
  isProvisional: boolean;
  message: string;
}

export class ReliableDataEngine {
  /**
   * Classifies a training set into its true biomechanical metric type:
   * - TESTED_1RM: Single maximal repetition effort (reps = 1, high RPE or failure)
   * - ESTIMATED_1RM: Submaximal compound set within reliable accuracy window (2 to 10 reps)
   * - ENDURANCE_SET: Sets exceeding 10 reps (excluded from 1RM due to fatigue curve distortions)
   * - BEST_WORKING_SET: Heaviest successful working load in regular rep ranges
   */
  static classifySetPerformance(
    set: Pick<SetLog, 'weightKg' | 'reps' | 'setType' | 'rpe' | 'completed'>,
    exercise?: Pick<Exercise, 'supports1Rm' | 'progressionType'>
  ): SetClassificationResult {
    const weight = Math.max(0, set.weightKg || 0);
    const reps = Math.max(0, set.reps || 0);

    if (!set.completed || reps <= 0 || weight <= 0) {
      return {
        metricType: 'BEST_WORKING_SET',
        valueKg: weight,
        is1RmEligible: false,
        explanation: 'Set not completed or zero workload',
      };
    }

    if (exercise?.supports1Rm === false) {
      return {
        metricType: 'BEST_WORKING_SET',
        valueKg: weight,
        is1RmEligible: false,
        explanation: 'Exercise does not track 1RM metrics',
      };
    }

    // 1. Tested 1RM: Exactly 1 rep performed at near-maximal or maximal effort
    const isHighEffort = (set.rpe !== null && set.rpe !== undefined && set.rpe >= 8.5) || set.setType === 'FAILURE';
    if (reps === 1 && isHighEffort) {
      return {
        metricType: 'TESTED_1RM',
        valueKg: weight,
        is1RmEligible: true,
        explanation: 'Verified single-repetition maximal effort',
      };
    }

    // 2. Estimated 1RM: 2 to 10 reps (Epley formula is physiologically valid up to 10 reps)
    const maxRepsFor1Rm = PROGRESSION_CONFIG.dataReliability.maxRepsForEstimated1RM;
    if (reps >= 2 && reps <= maxRepsFor1Rm) {
      const e1rm = calculateEpley1RM(weight, reps);
      return {
        metricType: 'ESTIMATED_1RM',
        valueKg: e1rm,
        is1RmEligible: true,
        explanation: `Submaximal estimated 1RM (${weight}kg × ${reps} reps via Epley)`,
      };
    }

    // 3. Sets > 10 reps: High-rep fatigue produces wildly inaccurate 1RM projections
    if (reps > maxRepsFor1Rm) {
      return {
        metricType: 'ENDURANCE_SET',
        valueKg: weight,
        is1RmEligible: false,
        explanation: `High-repetition volume set (${reps} reps). Excluded from 1RM estimation to maintain data integrity.`,
      };
    }

    return {
      metricType: 'BEST_WORKING_SET',
      valueKg: weight,
      is1RmEligible: false,
      explanation: 'Standard working set load',
    };
  }

  /**
   * Detects impossible or anomalous outlier numbers to protect rank integrity:
   * - Absolute weight > 500kg (world-record threshold)
   * - Upper body relative strength > 3.5x BW
   * - Lower body relative strength > 4.5x BW
   * - Sudden single-session spikes (>30% jump AND >40kg leap over established verified baseline)
   */
  static detectAnomalousOutlier(
    weightKg: number,
    reps: number,
    bodyweightKg: number = 75,
    exercise?: Pick<Exercise, 'movementPattern' | 'tier'>,
    baseline1RmKg: number = 0
  ): OutlierCheckResult {
    const safeWeight = Math.max(0, weightKg);
    const safeBw = Math.max(40, bodyweightKg || 75);
    const maxWeightCap = PROGRESSION_CONFIG.dataReliability.maxPlausibleSingleSetWeightKg;

    // 1. Absolute impossible weight check
    if (safeWeight > maxWeightCap) {
      return {
        isOutlier: true,
        reason: `Weight (${safeWeight}kg) exceeds absolute human physiological threshold (${maxWeightCap}kg)`,
        sanitizedWeightKg: maxWeightCap,
      };
    }

    // 2. Relative strength multiplier check
    const isUpper =
      exercise?.movementPattern === 'PUSH_HORIZONTAL' ||
      exercise?.movementPattern === 'PUSH_VERTICAL' ||
      exercise?.movementPattern === 'PULL_HORIZONTAL' ||
      exercise?.movementPattern === 'PULL_VERTICAL';

    const maxRatio = isUpper
      ? PROGRESSION_CONFIG.dataReliability.maxRelativeStrengthMultiplierUpper
      : PROGRESSION_CONFIG.dataReliability.maxRelativeStrengthMultiplierLower;

    const relativeRatio = safeWeight / safeBw;
    if (relativeRatio > maxRatio) {
      return {
        isOutlier: true,
        reason: `Load (${safeWeight}kg) represents an extreme relative strength ratio (${relativeRatio.toFixed(1)}x BW vs limit ${maxRatio}x BW)`,
        sanitizedWeightKg: Math.round(safeBw * maxRatio),
      };
    }

    // 3. Sudden single-session leap over established baseline
    if (baseline1RmKg >= 40 && reps <= 10) {
      const candidate1Rm = calculateEpley1RM(safeWeight, reps);
      const jumpKg = candidate1Rm - baseline1RmKg;
      const jumpPercent = (jumpKg / baseline1RmKg) * 100;

      const maxJumpPercent = PROGRESSION_CONFIG.dataReliability.maxSingleSession1RmJumpPercent;
      const maxJumpKg = PROGRESSION_CONFIG.dataReliability.maxSingleSession1RmJumpKg;

      if (jumpPercent > maxJumpPercent && jumpKg > maxJumpKg) {
        return {
          isOutlier: true,
          reason: `Sudden single-session 1RM jump (+${Math.round(jumpKg)}kg / +${Math.round(jumpPercent)}%) exceeds anomaly threshold (+${maxJumpKg}kg / +${maxJumpPercent}%)`,
          sanitizedWeightKg: baseline1RmKg + maxJumpKg,
        };
      }
    }

    return {
      isOutlier: false,
      sanitizedWeightKg: safeWeight,
    };
  }

  /**
   * Determines if user has enough verified sessions to hold a confirmed rank.
   * New accounts (< 3 verified sessions) receive a PROVISIONAL status.
   */
  static getVerificationStatus(verifiedSessionsCount: number): VerificationStatusResult {
    const required = PROGRESSION_CONFIG.dataReliability.minVerifiedSessionsForConfirmedRank;
    const safeCount = Math.max(0, Math.floor(verifiedSessionsCount || 0));
    const isProvisional = safeCount < required;
    const sessionsRemaining = Math.max(0, required - safeCount);

    return {
      status: isProvisional ? 'PROVISIONAL' : 'CONFIRMED',
      verifiedSessionsCount: safeCount,
      sessionsRemaining,
      isProvisional,
      message: isProvisional
        ? `Rank is Provisional (${safeCount}/${required} verified sessions). Complete ${sessionsRemaining} more verified workout${sessionsRemaining === 1 ? '' : 's'} to confirm official rank.`
        : `Rank is Confirmed with ${safeCount} verified training sessions.`,
    };
  }
}
