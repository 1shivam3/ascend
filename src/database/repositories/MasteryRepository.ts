import { getDatabase } from '../sqlite';
import { ExerciseMastery, PersonalRecord } from '../../types/domain.types';

export class MasteryRepository {
  static async getMastery(userId: string, exerciseId: string): Promise<ExerciseMastery | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<any>(
      `SELECT * FROM exercise_mastery WHERE user_id = ? AND exercise_id = ?;`,
      [userId, exerciseId]
    );

    return row ? this.mapRowToMastery(row) : null;
  }

  static async getAllMasteries(userId: string): Promise<ExerciseMastery[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM exercise_mastery WHERE user_id = ? ORDER BY mastery_level DESC, mastery_xp DESC;`,
      [userId]
    );

    return rows.map(this.mapRowToMastery);
  }

  static async upsertMastery(mastery: ExerciseMastery): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT OR REPLACE INTO exercise_mastery (
        id, user_id, exercise_id, mastery_level, mastery_xp, estimated_1rm_kg, best_weight_kg, best_reps, best_volume_kg, total_sessions, total_sets, total_reps, total_volume_kg, recent_performance, last_trained_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM exercise_mastery WHERE user_id = ? AND exercise_id = ?), ?), ?);`,
      [
        mastery.id || `em-${mastery.userId}-${mastery.exerciseId}`,
        mastery.userId,
        mastery.exerciseId,
        mastery.masteryLevel,
        mastery.masteryXp,
        mastery.estimated1RmKg,
        mastery.bestWeightKg,
        mastery.bestReps,
        mastery.bestVolumeKg,
        mastery.totalSessions,
        mastery.totalSets,
        mastery.totalReps,
        mastery.totalVolumeKg,
        JSON.stringify(mastery.recentPerformance),
        mastery.lastTrainedAt || now,
        mastery.userId,
        mastery.exerciseId,
        now,
        now,
      ]
    );
  }

  static async savePersonalRecord(pr: PersonalRecord): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT OR REPLACE INTO personal_records (
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
  }

  static async getPersonalRecords(userId: string, exerciseId: string): Promise<PersonalRecord[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM personal_records WHERE user_id = ? AND exercise_id = ?;`,
      [userId, exerciseId]
    );

    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      exerciseId: r.exercise_id,
      prType: r.pr_type,
      value: r.value,
      setLogId: r.set_log_id,
      achievedAt: r.achieved_at,
    }));
  }

  private static mapRowToMastery(row: any): ExerciseMastery {
    let recentPerformance = [];
    try {
      recentPerformance = JSON.parse(row.recent_performance);
    } catch {
      recentPerformance = [];
    }

    return {
      id: row.id,
      userId: row.user_id,
      exerciseId: row.exercise_id,
      masteryLevel: row.mastery_level,
      masteryXp: row.mastery_xp,
      estimated1RmKg: row.estimated_1rm_kg,
      bestWeightKg: row.best_weight_kg,
      bestReps: row.best_reps,
      bestVolumeKg: row.best_volume_kg,
      totalSessions: row.total_sessions,
      totalSets: row.total_sets,
      totalReps: row.total_reps,
      totalVolumeKg: row.total_volume_kg,
      recentPerformance,
      lastTrainedAt: row.last_trained_at,
    };
  }
}
