import { WorkoutSession } from '../../types/domain.types';
import { UserQuestProgress } from '../../types/quest.types';

export interface QuestEvaluationResult {
  updatedQuests: UserQuestProgress[];
  newlyCompletedQuests: UserQuestProgress[];
  totalQuestXpBonus: number;
}

export class QuestEngine {
  /**
   * Evaluates a completed workout against all active user quest progresses.
   */
  static evaluateWorkoutForQuests(
    workout: WorkoutSession,
    currentQuests: UserQuestProgress[]
  ): QuestEvaluationResult {
    const updatedQuests: UserQuestProgress[] = [];
    const newlyCompletedQuests: UserQuestProgress[] = [];
    let totalQuestXpBonus = 0;

    const now = new Date().toISOString();

    // Tally session metrics
    const totalVolume = workout.totalVolumeKg || 0;
    let failureSetsCount = 0;
    let compoundSetsCount = 0;
    let heavyCompoundSetsCount = 0;
    let totalDistanceMeters = 0;
    let powerConditioningSetsCount = 0;
    let calisthenicsRepsCount = 0;

    for (const ex of workout.exercises || []) {
      const isCompound =
        ex.exercise?.tier === 'COMPOUND_PRIMARY' ||
        ex.exercise?.movementPattern === 'SQUAT' ||
        ex.exercise?.movementPattern === 'HINGE' ||
        ex.exercise?.movementPattern === 'PUSH_HORIZONTAL' ||
        ex.exercise?.movementPattern === 'PUSH_VERTICAL' ||
        ex.exercise?.movementPattern === 'PULL_HORIZONTAL' ||
        ex.exercise?.movementPattern === 'PULL_VERTICAL';

      const isBodyweight =
        ex.exercise?.equipment === 'BODYWEIGHT' ||
        Boolean(ex.exercise?.isBodyweight);

      const isPower =
        ex.exercise?.movementPattern === 'ATHLETIC' ||
        ex.exercise?.movementPattern === 'CARRY' ||
        ex.exercise?.equipment === 'KETTLEBELL' ||
        Boolean(ex.exercise?.slug?.includes('jump'));

      for (const s of ex.sets || []) {
        if (!s.completed || s.isSkipped) continue;

        if (s.setType === 'FAILURE') {
          failureSetsCount++;
        }
        if (isCompound) {
          compoundSetsCount++;
          if (s.reps > 0 && s.reps <= 6) {
            heavyCompoundSetsCount++;
          }
        }
        if (isPower) {
          powerConditioningSetsCount++;
        }
        if (isBodyweight && s.reps > 0) {
          calisthenicsRepsCount += s.reps;
        }
        if (s.distanceMeters && s.distanceMeters > 0) {
          totalDistanceMeters += s.distanceMeters;
        }
      }
    }

    for (const uq of currentQuests) {
      if (uq.completed) {
        updatedQuests.push(uq);
        continue;
      }

      const quest = uq.quest;
      let newProgress = uq.currentProgress;
      let isNewlyCompleted = false;

      switch (quest?.category) {
        case 'WORKOUT_COUNT':
          newProgress = Math.min(uq.targetValue, uq.currentProgress + 1);
          break;

        case 'VOLUME_TOTAL':
        case 'TARGET_VOLUME':
          newProgress = Math.min(uq.targetValue, uq.currentProgress + totalVolume);
          break;

        case 'FAILURE_SETS':
          newProgress = Math.min(uq.targetValue, uq.currentProgress + failureSetsCount);
          break;

        case 'COMPOUND_SETS':
          newProgress = Math.min(uq.targetValue, uq.currentProgress + compoundSetsCount);
          break;

        case 'HEAVY_COMPOUND':
          newProgress = Math.min(uq.targetValue, uq.currentProgress + heavyCompoundSetsCount);
          break;

        case 'TARGET_DISTANCE':
          newProgress = Math.min(uq.targetValue, uq.currentProgress + totalDistanceMeters);
          break;

        case 'POWER_CONDITIONING':
          newProgress = Math.min(uq.targetValue, uq.currentProgress + powerConditioningSetsCount);
          break;

        case 'CALISTHENICS_REPS':
          newProgress = Math.min(uq.targetValue, uq.currentProgress + calisthenicsRepsCount);
          break;

        case 'MASTERY_LEVEL':
          // Preserved as-is; updated during mastery milestone progression
          break;

        default:
          break;
      }

      const completed = newProgress >= uq.targetValue;
      if (completed && !uq.completed) {
        isNewlyCompleted = true;
        totalQuestXpBonus += quest?.xpReward || 0;
      }

      const updatedProgress: UserQuestProgress = {
        ...uq,
        currentProgress: newProgress,
        completed,
        completedAt: isNewlyCompleted ? now : uq.completedAt,
      };

      updatedQuests.push(updatedProgress);
      if (isNewlyCompleted) {
        newlyCompletedQuests.push(updatedProgress);
      }
    }

    return {
      updatedQuests,
      newlyCompletedQuests,
      totalQuestXpBonus,
    };
  }
}
