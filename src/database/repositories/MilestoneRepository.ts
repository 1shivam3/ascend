import { getDatabase } from '../sqlite';
import { ExerciseMilestone, UserExerciseMilestone, ExerciseMastery } from '../../types/domain.types';
import { SqliteMilestoneRow, SqliteUserMilestoneRow } from '../types';
import { SyncQueueRepository } from './SyncQueueRepository';
import { DEFAULT_EXERCISE_MILESTONES } from '../../config/milestones.config';

export class MilestoneRepository {
  /**
   * Retrieves all defined milestones for a specific exercise.
   * If none exist in the local SQLite table yet, returns defaults from config.
   */
  static async getMilestonesForExercise(exerciseId: string): Promise<ExerciseMilestone[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<SqliteMilestoneRow>(
      `SELECT * FROM exercise_milestones WHERE exercise_id = ? ORDER BY threshold ASC;`,
      [exerciseId]
    );

    if (rows.length > 0) {
      return rows.map(r => ({
        id: r.id,
        exerciseId: r.exercise_id,
        metric: r.metric as ExerciseMilestone['metric'],
        threshold: r.threshold,
        rewardXp: r.reward_xp,
        title: r.title,
        description: r.description,
      }));
    }

    return DEFAULT_EXERCISE_MILESTONES.filter(m => m.exerciseId === exerciseId);
  }

  /**
   * Retrieves all user unlocked milestone records, optionally filtered by exercise.
   */
  static async getUserUnlockedMilestones(
    userId: string,
    exerciseId?: string
  ): Promise<UserExerciseMilestone[]> {
    const db = await getDatabase();
    let query = `SELECT * FROM user_exercise_milestones WHERE user_id = ?`;
    const params: (string | number)[] = [userId];

    if (exerciseId) {
      query += ` AND exercise_id = ?`;
      params.push(exerciseId);
    }
    query += ` ORDER BY unlocked_at DESC;`;

    const rows = await db.getAllAsync<SqliteUserMilestoneRow>(query, params);
    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      milestoneId: r.milestone_id,
      exerciseId: r.exercise_id,
      unlockedAt: r.unlocked_at,
      xpAwarded: r.xp_awarded,
    }));
  }

  /**
   * Unlocks an exercise milestone for a user idempotently.
   * If the milestone was already unlocked, returns false.
   */
  static async unlockMilestone(
    userId: string,
    milestoneId: string,
    exerciseId: string,
    xpReward: number
  ): Promise<boolean> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const id = `uem-${userId}-${milestoneId}`;

    const insertResult = await db.runAsync(
      `INSERT OR IGNORE INTO user_exercise_milestones (
        id, user_id, milestone_id, exercise_id, unlocked_at, xp_awarded, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [id, userId, milestoneId, exerciseId, now, xpReward, now]
    );

    if ((insertResult?.changes ?? 0) > 0) {
      // Enqueue to sync queue
      await SyncQueueRepository.enqueue(
        'user_exercise_milestone',
        id,
        'INSERT',
        {
          id,
          user_id: userId,
          milestone_id: milestoneId,
          exercise_id: exerciseId,
          unlocked_at: now,
          xp_awarded: xpReward,
        },
        id
      );
      return true;
    }

    return false;
  }

  /**
   * Evaluates current mastery against exercise milestones, unlocking any newly met ones.
   */
  static async evaluateMilestones(
    userId: string,
    exerciseId: string,
    mastery: ExerciseMastery
  ): Promise<{
    unlockedMilestones: ExerciseMilestone[];
    totalXpAwarded: number;
  }> {
    const milestones = await this.getMilestonesForExercise(exerciseId);
    const existingUnlocked = await this.getUserUnlockedMilestones(userId, exerciseId);
    const unlockedIds = new Set(existingUnlocked.map(u => u.milestoneId));

    const newlyUnlocked: ExerciseMilestone[] = [];
    let totalXp = 0;

    for (const ms of milestones) {
      if (unlockedIds.has(ms.id)) continue;

      let achieved = false;
      switch (ms.metric) {
        case 'BEST_E1RM':
          achieved = (mastery.estimated1RmKg || mastery.estimated_1rm || 0) >= ms.threshold;
          break;
        case 'BEST_WEIGHT':
          achieved = (mastery.bestWeightKg || mastery.best_weight || 0) >= ms.threshold;
          break;
        case 'TOTAL_VOLUME':
          achieved = (mastery.totalVolumeKg || mastery.total_volume || 0) >= ms.threshold;
          break;
        case 'SESSION_COUNT':
          achieved = (mastery.totalSessions || mastery.total_sessions || 0) >= ms.threshold;
          break;
      }

      if (achieved) {
        const success = await this.unlockMilestone(userId, ms.id, exerciseId, ms.rewardXp);
        if (success) {
          newlyUnlocked.push(ms);
          totalXp += ms.rewardXp;
        }
      }
    }

    return {
      unlockedMilestones: newlyUnlocked,
      totalXpAwarded: totalXp,
    };
  }

  /**
   * Finds the closest upcoming milestone across the user's lifts for the dashboard.
   */
  static async getClosestMilestone(userId: string): Promise<{
    milestone: ExerciseMilestone;
    exerciseName: string;
    currentMetricValue: number;
    remaining: number;
    progressPercent: number;
  } | null> {
    const db = await getDatabase();
    // Get masteries where estimated_1rm_kg > 0
    const masteries = await db.getAllAsync<{
      exercise_id: string;
      estimated_1rm_kg: number;
      best_weight_kg: number;
      exercise_name: string;
    }>(
      `SELECT em.exercise_id, em.estimated_1rm_kg, em.best_weight_kg, ec.name as exercise_name
       FROM exercise_mastery em
       JOIN exercise_catalog ec ON ec.id = em.exercise_id
       WHERE em.user_id = ? AND em.estimated_1rm_kg > 0
       ORDER BY em.mastery_level DESC;`,
      [userId]
    );

    if (!masteries || masteries.length === 0) return null;

    const unlocked = await this.getUserUnlockedMilestones(userId);
    const unlockedIds = new Set(unlocked.map(u => u.milestoneId));

    let closest: {
      milestone: ExerciseMilestone;
      exerciseName: string;
      currentMetricValue: number;
      remaining: number;
      progressPercent: number;
    } | null = null;

    for (const m of masteries) {
      const milestones = await this.getMilestonesForExercise(m.exercise_id);
      for (const ms of milestones) {
        if (unlockedIds.has(ms.id)) continue;

        let currentVal = 0;
        if (ms.metric === 'BEST_E1RM') currentVal = m.estimated_1rm_kg;
        else if (ms.metric === 'BEST_WEIGHT') currentVal = m.best_weight_kg;
        else continue;

        if (currentVal < ms.threshold) {
          const remaining = ms.threshold - currentVal;
          const progressPercent = Math.min(99, Math.round((currentVal / ms.threshold) * 100));

          if (!closest || remaining < closest.remaining) {
            closest = {
              milestone: ms,
              exerciseName: m.exercise_name,
              currentMetricValue: currentVal,
              remaining: Math.round(remaining * 10) / 10,
              progressPercent,
            };
          }
        }
      }
    }

    return closest;
  }
}
