import {
  ACHIEVEMENTS_CONFIG,
  AchievementConfig,
  AchievementContext,
} from '../../config/achievements.config';
import { AchievementRepository } from '../../database/repositories/AchievementRepository';
import { XpRepository } from '../../database/repositories/XpRepository';
import { NotificationEngine } from '../notifications/NotificationEngine';
import { getDatabase } from '../../database/sqlite';

export interface AchievementEvaluationResult {
  newlyUnlocked: AchievementConfig[];
  totalXpAwarded: number;
}

export class AchievementEngine {
  /**
   * Evaluates athlete context against declarative achievement rules.
   * Unlocks new achievements, records transactions, and sends celebratory notifications.
   */
  static async evaluateAndUnlock(
    userId: string,
    context: AchievementContext
  ): Promise<AchievementEvaluationResult> {
    const unlockedIds = await AchievementRepository.getUnlockedIds(userId);
    const newlyUnlocked: AchievementConfig[] = [];
    let totalXpAwarded = 0;

    for (const ach of ACHIEVEMENTS_CONFIG) {
      if (unlockedIds.has(ach.id)) {
        continue; // Already unlocked
      }

      const meetsCondition = ach.condition(context);
      if (meetsCondition) {
        // Unlock in database
        await AchievementRepository.unlockAchievement(userId, ach.id, ach.xpReward);

        // Record XP transaction
        await this.recordAchievementXp(userId, ach);

        // Dispatch celebratory notification
        await NotificationEngine.notifyAchievementUnlocked(userId, ach);

        newlyUnlocked.push(ach);
        totalXpAwarded += ach.xpReward;
      }
    }

    return {
      newlyUnlocked,
      totalXpAwarded,
    };
  }

  /**
   * Retrieves all achievements with live unlock status for the given user.
   */
  static async getAllWithStatus(
    userId: string
  ): Promise<{ achievement: AchievementConfig; isUnlocked: boolean; unlockedAt?: string }[]> {
    const userAchievements = await AchievementRepository.getUserAchievements(userId);
    const unlockMap = new Map<string, string>();
    userAchievements.forEach(ua => {
      unlockMap.set(ua.achievement_id, ua.unlocked_at);
    });

    return ACHIEVEMENTS_CONFIG.map(ach => ({
      achievement: ach,
      isUnlocked: unlockMap.has(ach.id),
      unlockedAt: unlockMap.get(ach.id),
    }));
  }

  private static async recordAchievementXp(userId: string, ach: AchievementConfig): Promise<void> {
    await XpRepository.recordTransaction(
      userId,
      'ACHIEVEMENT',
      ach.id,
      ach.xpReward,
      `Feat Unlocked: ${ach.title}`
    );
  }
}
