import { TitleDefinition, TitleEvaluationContext, UserTitle } from '../../types/title.types';
import { TITLES_CATALOG, getTitleById } from '../../config/titles.config';
import { TitleRepository } from '../../database/repositories/TitleRepository';

const RANK_VALUES: Record<string, number> = {
  E: 0,
  D: 1,
  C: 2,
  B: 3,
  A: 4,
  S: 5,
  SS: 6,
  SSS: 7,
};

export class TitleEngine {
  /**
   * Pure deterministic evaluation of qualifying titles based on verified athlete context.
   *
   * ANTI-EXPLOIT MANDATE:
   * No title is ever awarded for opening the app, logging in, or visiting screens.
   * All titles demand actual, verified physical workouts, streaks, or progression milestones.
   */
  static evaluateQualifyingTitles(context: TitleEvaluationContext): TitleDefinition[] {
    const qualifying: TitleDefinition[] = [];

    // Guard: An athlete with zero workouts cannot unlock workout, strength, or challenge titles
    const hasTrained = context.totalWorkouts > 0;

    for (const title of TITLES_CATALOG) {
      let meetsCondition = false;

      switch (title.requirementType) {
        case 'WORKOUT_COUNT':
          meetsCondition = context.totalWorkouts >= title.requirementThreshold;
          break;

        case 'STREAK_DAYS':
          // Must have at least 1 workout to have a legitimate streak
          meetsCondition =
            hasTrained &&
            (context.currentStreak >= title.requirementThreshold ||
              context.longestStreak >= title.requirementThreshold);
          break;

        case 'STRENGTH_RATIO':
          meetsCondition = hasTrained && context.maxRelativeStrength >= title.requirementThreshold;
          break;

        case 'LIFETIME_VOLUME_KG':
          meetsCondition = hasTrained && context.totalVolumeKg >= title.requirementThreshold;
          break;

        case 'CHALLENGES_COMPLETED':
          meetsCondition =
            hasTrained && context.completedChallengesCount >= title.requirementThreshold;
          break;

        case 'MOBILITY_SCORE':
          meetsCondition =
            hasTrained && context.mobilityScore >= title.requirementThreshold;
          break;

        case 'MOBILITY_WORKOUTS':
          meetsCondition =
            context.mobilityWorkoutsCount >= title.requirementThreshold;
          break;

        case 'LEVEL_REACHED':
          // Demands both the level threshold AND at least 1 verified workout
          meetsCondition = hasTrained && context.globalLevel >= title.requirementThreshold;
          break;

        case 'RANK_TIER': {
          const requiredTier = title.requirementMeta?.minRankTier || 'E';
          const requiredVal = RANK_VALUES[requiredTier] ?? 0;
          const userVal = RANK_VALUES[context.rankTier] ?? 0;
          meetsCondition = hasTrained && userVal >= requiredVal;
          break;
        }

        default:
          meetsCondition = false;
          break;
      }

      if (meetsCondition) {
        qualifying.push(title);
      }
    }

    return qualifying;
  }

  /**
   * Synchronizes athlete context against the catalog and unlocks newly eligible titles.
   * Returns an array of newly unlocked titles.
   */
  static async syncAndUnlockTitles(context: TitleEvaluationContext): Promise<UserTitle[]> {
    if (!context.userId) return [];

    const eligible = this.evaluateQualifyingTitles(context);
    const existing = await TitleRepository.getUserTitles(context.userId);
    const existingIds = new Set(existing.map((e) => e.titleId));

    const newlyUnlocked: UserTitle[] = [];

    for (const title of eligible) {
      if (!existingIds.has(title.id)) {
        const unlocked = await TitleRepository.unlockTitle(context.userId, title.id);
        newlyUnlocked.push(unlocked);
      }
    }

    return newlyUnlocked;
  }
}
