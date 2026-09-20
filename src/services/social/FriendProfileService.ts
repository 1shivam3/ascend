import { getDatabase } from '../../database/sqlite';
import { FriendRepository } from '../../database/repositories/FriendRepository';
import { PrivacyRepository } from '../../database/repositories/PrivacyRepository';
import { ProfileRepository } from '../../database/repositories/ProfileRepository';
import { MasteryRepository } from '../../database/repositories/MasteryRepository';
import { ExerciseRepository } from '../../database/repositories/ExerciseRepository';
import { WorkoutRepository } from '../../database/repositories/WorkoutRepository';
import { SYSTEM_ACHIEVEMENTS } from '../../constants/achievements';
import {
  PublicUserProfile,
  PublicMasterySummary,
  PublicAchievementSummary,
} from '../../types/social.types';
import { RankTier } from '../../types/domain.types';

export class FriendProfileService {
  /**
   * Retrieves a privacy-safe public dossier for an operative.
   *
   * STRICT PRIVACY GUARANTEE:
   * - ZERO bodyweight, height, age, medical notes, or limitations.
   * - ZERO raw set-by-set logs, heart rate, or private workout notes.
   * - ZERO nutrition, calories, or auth identifiers.
   * - Respects target user's visibility and profile display toggles.
   */
  static async getPublicProfile(
    currentUserId: string,
    targetUserId: string
  ): Promise<PublicUserProfile | null> {
    const db = await getDatabase();

    // 1. Check if blocked
    const isBlocked = await FriendRepository.isBlocked(currentUserId, targetUserId);
    if (isBlocked) {
      return null;
    }

    // 2. Fetch basic profile summary
    const summary = await ProfileRepository.getPublicSummary(targetUserId);
    if (!summary) return null;

    // 3. Determine relationship
    const relationship = await FriendRepository.getRelationship(currentUserId, targetUserId);

    // 4. Check privacy settings
    const privacy = await PrivacyRepository.getSettings(targetUserId);

    const isSelf = currentUserId === targetUserId;
    const isFriend = relationship === 'FRIEND';

    // Check visibility permissions
    const canViewFullProfile =
      isSelf ||
      privacy.profileVisibility === 'PUBLIC' ||
      (privacy.profileVisibility === 'FRIENDS' && isFriend);

    // Evolution stage computation
    const level = summary.globalLevel || 1;
    let evolutionStage = { stageNumber: 1, title: 'INITIATE' };
    if (level >= 50) {
      evolutionStage = { stageNumber: 5, title: 'ASCENDED TITAN' };
    } else if (level >= 35) {
      evolutionStage = { stageNumber: 4, title: 'WARLORD' };
    } else if (level >= 20) {
      evolutionStage = { stageNumber: 3, title: 'VANGUARD' };
    } else if (level >= 10) {
      evolutionStage = { stageNumber: 2, title: 'OPERATIVE' };
    }

    if (!canViewFullProfile) {
      return {
        ...summary,
        currentStreak: privacy.showStreakOnProfile ? summary.currentStreak : undefined,
        relationship,
        selectedMastery: [],
        selectedAchievements: [],
        challengesCompletedCount: 0,
        evolutionStage,
      };
    }

    // 5. Fetch selected exercise mastery (if allowed)
    let selectedMastery: PublicMasterySummary[] = [];
    if (privacy.showMasteryOnProfile) {
      try {
        const [masteries, allEx] = await Promise.all([
          MasteryRepository.getTopMasteries(targetUserId, 4),
          ExerciseRepository.getAll(),
        ]);
        const exMap = new Map(allEx.map(e => [e.id, e.name]));

        selectedMastery = masteries.map(m => ({
          exerciseId: m.exerciseId,
          exerciseName: exMap.get(m.exerciseId) || 'Compound Lift',
          rank: (m.rank as RankTier) || 'E',
          masteryLevel: m.masteryLevel,
          estimated1RmKg: m.estimated1RmKg,
          bestWeightKg: m.bestWeightKg,
          relativeStrength: m.relativeStrength || null,
        }));
      } catch (err) {
        console.warn('Failed to load friend mastery summary:', err);
      }
    }

    // 6. Fetch selected unlocked achievements (if allowed)
    let selectedAchievements: PublicAchievementSummary[] = [];
    if (privacy.showAchievementsOnProfile) {
      try {
        const unlockedRows = await db.getAllAsync<{
          achievement_id: string;
          unlocked_at: string;
        }>(
          `SELECT achievement_id, unlocked_at FROM user_achievements 
           WHERE user_id = ? 
           ORDER BY unlocked_at DESC 
           LIMIT 6;`,
          [targetUserId]
        );

        const achMap = new Map(SYSTEM_ACHIEVEMENTS.map(a => [a.id, a]));

        selectedAchievements = unlockedRows
          .map(r => {
            const ach = achMap.get(r.achievement_id);
            if (!ach) return null;
            return {
              id: ach.id,
              title: ach.title,
              description: ach.description,
              icon: ach.icon,
              unlockedAt: r.unlocked_at,
            };
          })
          .filter((a): a is PublicAchievementSummary => a !== null);
      } catch (err) {
        console.warn('Failed to load friend achievements summary:', err);
      }
    }

    // 7. Fetch completed challenge stats
    let challengesCompletedCount = 0;
    try {
      const qRow = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM user_quests WHERE user_id = ? AND completed = 1;`,
        [targetUserId]
      );
      challengesCompletedCount = qRow?.count || 0;
    } catch {
      // ignore
    }

    // 8. Fetch high-level athletic stats (tonnage and workouts count)
    let lifetimeTonnageKg = 0;
    let totalWorkoutsCompleted = 0;
    try {
      const stats = await WorkoutRepository.getLifetimeStats(targetUserId);
      lifetimeTonnageKg = stats.totalVolumeKg;
      totalWorkoutsCompleted = stats.totalWorkouts;
    } catch {
      // ignore
    }

    return {
      ...summary,
      currentStreak: privacy.showStreakOnProfile ? summary.currentStreak : undefined,
      relationship,
      selectedMastery,
      selectedAchievements,
      challengesCompletedCount,
      lifetimeTonnageKg,
      totalWorkoutsCompleted,
      evolutionStage,
    };
  }
}
