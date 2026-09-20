import { getDatabase } from '../sqlite';
import { ExerciseMastery, PersonalRecord, PrType } from '../../types/domain.types';
import { SqliteMasteryRow, SqlitePersonalRecordRow } from '../types';
import { MasteryEngine } from '../../services/progression/MasteryEngine';

export class MasteryRepository {
  static async getMastery(userId: string, exerciseId: string): Promise<ExerciseMastery | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<SqliteMasteryRow>(
      `SELECT * FROM exercise_mastery WHERE user_id = ? AND exercise_id = ?;`,
      [userId, exerciseId]
    );

    return row ? this.mapRowToMastery(row) : null;
  }

  static async getAllMasteries(userId: string): Promise<ExerciseMastery[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<SqliteMasteryRow>(
      `SELECT * FROM exercise_mastery WHERE user_id = ? ORDER BY mastery_level DESC, mastery_xp DESC;`,
      [userId]
    );

    return rows.map(this.mapRowToMastery);
  }

  static async upsertMastery(mastery: ExerciseMastery): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const uid = mastery.userId || mastery.user_id || '';
    const eid = mastery.exerciseId || mastery.exercise_id || '';

    await db.runAsync(
      `INSERT OR REPLACE INTO exercise_mastery (
        id, user_id, exercise_id, mastery_level, mastery_xp, rank, estimated_1rm_kg, best_weight_kg, best_reps, best_volume_kg, relative_strength, total_sessions, total_sets, total_reps, total_volume_kg, personal_records_count, milestones_unlocked_count, recent_performance, last_trained_at, trend, xp_to_next_level, best_distance_meters, best_duration_seconds, best_pace_seconds_per_km, total_distance_meters, total_duration_seconds, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM exercise_mastery WHERE user_id = ? AND exercise_id = ?), ?), ?);`,
      [
        mastery.id || `em-${uid}-${eid}`,
        uid,
        eid,
        mastery.masteryLevel ?? mastery.mastery_level ?? 1,
        mastery.masteryXp ?? mastery.mastery_xp ?? 0,
        mastery.rank || 'E',
        mastery.estimated1RmKg ?? mastery.estimated_1rm ?? 0,
        mastery.bestWeightKg ?? mastery.best_weight ?? 0,
        mastery.bestReps ?? mastery.best_reps ?? 0,
        mastery.bestVolumeKg ?? mastery.best_volume ?? 0,
        mastery.relativeStrength ?? mastery.relative_strength ?? null,
        mastery.totalSessions ?? mastery.total_sessions ?? 0,
        mastery.totalSets ?? 0,
        mastery.totalReps ?? 0,
        mastery.totalVolumeKg ?? mastery.total_volume ?? 0,
        mastery.personalRecordsCount ?? mastery.personal_records_count ?? 0,
        mastery.milestonesUnlockedCount ?? mastery.milestones_unlocked ?? 0,
        JSON.stringify(mastery.recentPerformance || []),
        mastery.lastTrainedAt || mastery.last_performed_at || now,
        mastery.trend || 'NEW',
        mastery.xpToNextLevel ?? mastery.xp_to_next_level ?? 100,
        mastery.bestDistanceMeters ?? mastery.best_distance_meters ?? 0,
        mastery.bestDurationSeconds ?? mastery.best_duration_seconds ?? 0,
        mastery.bestPaceSecondsPerKm ?? mastery.best_pace_seconds_per_km ?? 0,
        mastery.totalDistanceMeters ?? mastery.total_distance_meters ?? 0,
        mastery.totalDurationSeconds ?? mastery.total_duration_seconds ?? 0,
        uid,
        eid,
        now,
        now,
      ]
    );
  }

  /**
   * Saves a personal record using Highest Value Wins conflict resolution.
   * Only saves or updates if the new PR strictly exceeds any existing record for
   * (user_id, exercise_id, pr_type). Returns true if saved as a new record, false otherwise.
   */
  static async savePersonalRecord(pr: PersonalRecord): Promise<boolean> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    const existing = await db.getFirstAsync<{ id: string; value: number }>(
      `SELECT id, value FROM personal_records 
       WHERE user_id = ? AND exercise_id = ? AND pr_type = ? 
       LIMIT 1;`,
      [pr.userId, pr.exerciseId, pr.prType]
    );

    if (existing) {
      const isImprovement =
        pr.prType === 'BEST_PACE'
          ? existing.value === 0 || pr.value < existing.value
          : pr.value > existing.value;

      if (!isImprovement) {
        // Record is not an improvement; do not overwrite or duplicate
        return false;
      }

      await db.runAsync(
        `UPDATE personal_records SET 
          value = ?, 
          set_log_id = ?, 
          achieved_at = ?, 
          updated_at = ? 
        WHERE id = ?;`,
        [pr.value, pr.setLogId || null, pr.achievedAt, now, existing.id]
      );
      return true;
    }

    await db.runAsync(
      `INSERT INTO personal_records (
        id, user_id, exercise_id, pr_type, value, set_log_id, achieved_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        pr.id,
        pr.userId,
        pr.exerciseId,
        pr.prType,
        pr.value,
        pr.setLogId || null,
        pr.achievedAt,
        now,
        now,
      ]
    );
    return true;
  }

  static async getPersonalRecords(userId: string, exerciseId: string): Promise<PersonalRecord[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<SqlitePersonalRecordRow>(
      `SELECT * FROM personal_records WHERE user_id = ? AND exercise_id = ?;`,
      [userId, exerciseId]
    );

    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      exerciseId: r.exercise_id,
      prType: r.pr_type as PrType,
      value: r.value,
      setLogId: r.set_log_id,
      achievedAt: r.achieved_at,
    }));
  }

  static async getAllPersonalRecords(userId: string): Promise<PersonalRecord[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<SqlitePersonalRecordRow>(
      `SELECT * FROM personal_records WHERE user_id = ? ORDER BY achieved_at DESC;`,
      [userId]
    );

    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      exerciseId: r.exercise_id,
      prType: r.pr_type as PrType,
      value: r.value,
      setLogId: r.set_log_id,
      achievedAt: r.achieved_at,
    }));
  }

  static async getTopMasteries(userId: string, limit: number = 5): Promise<ExerciseMastery[]> {
    return this.getStrongestLifts(userId, limit);
  }

  static async getStrongestLifts(userId: string, limit: number = 5): Promise<ExerciseMastery[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<SqliteMasteryRow>(
      `SELECT * FROM exercise_mastery WHERE user_id = ? ORDER BY mastery_level DESC, estimated_1rm_kg DESC LIMIT ?;`,
      [userId, limit]
    );

    return rows.map(this.mapRowToMastery);
  }

  /**
   * Backfills or recalculates exercise mastery for a user based on historical workout logs.
   */
  static async deriveMasteryFromHistory(userId: string): Promise<void> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      exercise_id: string;
      total_sessions: number;
      total_sets: number;
      total_reps: number;
      total_volume_kg: number;
      best_weight_kg: number;
      best_reps: number;
      best_e1rm_kg: number;
      best_distance_meters: number;
      best_duration_seconds: number;
      best_pace_seconds_per_km: number;
      total_distance_meters: number;
      total_duration_seconds: number;
      last_trained_at: string;
    }>(
      `SELECT 
        el.exercise_id,
        COUNT(DISTINCT el.workout_id) as total_sessions,
        COUNT(sl.id) as total_sets,
        COALESCE(SUM(sl.reps), 0) as total_reps,
        COALESCE(SUM(sl.weight_kg * sl.reps), 0.0) as total_volume_kg,
        COALESCE(MAX(sl.weight_kg), 0.0) as best_weight_kg,
        COALESCE(MAX(sl.reps), 0) as best_reps,
        COALESCE(MAX(sl.estimated_1rm_kg), 0.0) as best_e1rm_kg,
        COALESCE(MAX(sl.distance_meters), 0.0) as best_distance_meters,
        COALESCE(MAX(sl.duration_seconds), 0) as best_duration_seconds,
        COALESCE(MIN(CASE WHEN sl.pace_seconds_per_km > 0 THEN sl.pace_seconds_per_km ELSE NULL END), 0.0) as best_pace_seconds_per_km,
        COALESCE(SUM(sl.distance_meters), 0.0) as total_distance_meters,
        COALESCE(SUM(sl.duration_seconds), 0) as total_duration_seconds,
        MAX(sl.completed_at) as last_trained_at
       FROM exercise_logs el
       JOIN set_logs sl ON sl.exercise_log_id = el.id
       WHERE el.user_id = ? AND sl.completed = 1 AND sl.is_skipped = 0
       GROUP BY el.exercise_id;`,
      [userId]
    );

    for (const r of rows) {
      const existing = await this.getMastery(userId, r.exercise_id);
      if (!existing) {
        // Calculate initial XP and level using unified MasteryEngine
        const cardioXp = Math.round((r.total_distance_meters || 0) / 100) + Math.round((r.total_duration_seconds || 0) / 30);
        const initialXp = Math.max(100, Math.round(r.total_sets * 20 + r.total_volume_kg / 100 + cardioXp));
        const levelInfo = MasteryEngine.getMasteryLevelInfo(initialXp);
        const rankInfo = MasteryEngine.getExerciseRankFromLevel(levelInfo.level);

        await this.upsertMastery({
          id: `em-${userId}-${r.exercise_id}`,
          userId,
          exerciseId: r.exercise_id,
          masteryLevel: levelInfo.level,
          masteryXp: initialXp,
          rank: rankInfo.tier,
          estimated1RmKg: r.best_e1rm_kg,
          bestWeightKg: r.best_weight_kg,
          bestReps: r.best_reps,
          bestVolumeKg: r.best_weight_kg * r.best_reps,
          totalSessions: r.total_sessions,
          totalSets: r.total_sets,
          totalReps: r.total_reps,
          totalVolumeKg: r.total_volume_kg,
          personalRecordsCount: 0,
          milestonesUnlockedCount: 0,
          recentPerformance: [],
          lastTrainedAt: r.last_trained_at,
          trend: 'MAINTAINING',
          xpToNextLevel: levelInfo.xpToNextLevel,
          bestDistanceMeters: r.best_distance_meters,
          bestDurationSeconds: r.best_duration_seconds,
          bestPaceSecondsPerKm: r.best_pace_seconds_per_km,
          totalDistanceMeters: r.total_distance_meters,
          totalDurationSeconds: r.total_duration_seconds,
        });
      }
    }
  }

  private static mapRowToMastery(row: SqliteMasteryRow): ExerciseMastery {
    let recentPerformance: ExerciseMastery['recentPerformance'] = [];
    try {
      recentPerformance = JSON.parse(row.recent_performance);
    } catch {
      recentPerformance = [];
    }

    const rank = (row.rank as any) || 'E';
    const relativeStrength = row.relative_strength ?? null;
    const personalRecordsCount = row.personal_records_count ?? 0;
    const milestonesUnlockedCount = row.milestones_unlocked_count ?? 0;
    const trend = (row.trend as any) || 'NEW';
    const xpToNextLevel = row.xp_to_next_level ?? 100;
    const bestDistanceMeters = row.best_distance_meters ?? 0;
    const bestDurationSeconds = row.best_duration_seconds ?? 0;
    const bestPaceSecondsPerKm = row.best_pace_seconds_per_km ?? 0;
    const totalDistanceMeters = row.total_distance_meters ?? 0;
    const totalDurationSeconds = row.total_duration_seconds ?? 0;

    return {
      id: row.id,
      userId: row.user_id,
      exerciseId: row.exercise_id,
      masteryLevel: row.mastery_level,
      masteryXp: row.mastery_xp,
      rank,
      estimated1RmKg: row.estimated_1rm_kg,
      bestWeightKg: row.best_weight_kg,
      bestReps: row.best_reps,
      bestVolumeKg: row.best_volume_kg,
      relativeStrength,
      totalSessions: row.total_sessions,
      totalSets: row.total_sets,
      totalReps: row.total_reps,
      totalVolumeKg: row.total_volume_kg,
      personalRecordsCount,
      milestonesUnlockedCount,
      recentPerformance,
      lastTrainedAt: row.last_trained_at,
      trend,
      xpToNextLevel,
      bestDistanceMeters,
      bestDurationSeconds,
      bestPaceSecondsPerKm,
      totalDistanceMeters,
      totalDurationSeconds,

      // Direct SQL aliases
      user_id: row.user_id,
      exercise_id: row.exercise_id,
      mastery_level: row.mastery_level,
      mastery_xp: row.mastery_xp,
      xp_to_next_level: xpToNextLevel,
      estimated_1rm: row.estimated_1rm_kg,
      best_weight: row.best_weight_kg,
      best_reps: row.best_reps,
      best_volume: row.best_volume_kg,
      relative_strength: relativeStrength,
      total_volume: row.total_volume_kg,
      total_sessions: row.total_sessions,
      personal_records_count: personalRecordsCount,
      milestones_unlocked: milestonesUnlockedCount,
      last_performed_at: row.last_trained_at,
      best_distance_meters: bestDistanceMeters,
      best_duration_seconds: bestDurationSeconds,
      best_pace_seconds_per_km: bestPaceSecondsPerKm,
      total_distance_meters: totalDistanceMeters,
      total_duration_seconds: totalDurationSeconds,
    };
  }
}
