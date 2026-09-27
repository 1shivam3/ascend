import { getDatabase } from '../sqlite';
import { StepDailySummary } from '../../services/step/types';

interface SqliteStepSummaryRow {
  id: string;
  user_id: string;
  date: string;
  today_steps: number;
  step_goal: number;
  last_sensor_value: number;
  baseline: number;
  last_updated_at: string;
  synced_at: string | null;
  created_at: string;
}

export class StepRepository {
  /**
   * Retrieves daily step summary for a specific user and date (YYYY-MM-DD).
   */
  static async getDailySummary(
    userId: string,
    date: string
  ): Promise<StepDailySummary | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<SqliteStepSummaryRow>(
      `SELECT * FROM daily_step_summaries WHERE user_id = ? AND date = ? LIMIT 1;`,
      [userId, date]
    );

    if (!row) return null;
    return this.mapRow(row);
  }

  /**
   * Retrieves today's summary for user.
   */
  static async getTodaySummary(userId: string): Promise<StepDailySummary | null> {
    const today = new Date().toISOString().substring(0, 10);
    return this.getDailySummary(userId, today);
  }

  /**
   * Saves or updates a daily step summary with idempotency.
   */
  static async saveDailySummary(summary: StepDailySummary): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO daily_step_summaries (
        id, user_id, date, today_steps, step_goal,
        last_sensor_value, baseline, last_updated_at, synced_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, date) DO UPDATE SET
        today_steps = excluded.today_steps,
        step_goal = excluded.step_goal,
        last_sensor_value = excluded.last_sensor_value,
        baseline = excluded.baseline,
        last_updated_at = excluded.last_updated_at,
        synced_at = excluded.synced_at;`,
      [
        summary.id,
        summary.userId,
        summary.date,
        summary.todaySteps,
        summary.stepGoal,
        summary.lastSensorValue,
        summary.baseline,
        summary.lastUpdatedAt || now,
        summary.syncedAt ?? null,
        summary.createdAt || now,
      ]
    );
  }

  /**
   * Updates step goal for a given user and date.
   */
  static async updateStepGoal(
    userId: string,
    date: string,
    stepGoal: number
  ): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE daily_step_summaries SET step_goal = ? WHERE user_id = ? AND date = ?;`,
      [stepGoal, userId, date]
    );
  }

  /**
   * Retrieves recent step summaries for weekly analytics.
   */
  static async getRecentSummaries(
    userId: string,
    limit: number = 7
  ): Promise<StepDailySummary[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<SqliteStepSummaryRow>(
      `SELECT * FROM daily_step_summaries 
       WHERE user_id = ? 
       ORDER BY date DESC 
       LIMIT ?;`,
      [userId, limit]
    );

    return rows.map((r) => this.mapRow(r));
  }

  private static mapRow(row: SqliteStepSummaryRow): StepDailySummary {
    return {
      id: row.id,
      userId: row.user_id,
      date: row.date,
      todaySteps: row.today_steps,
      stepGoal: row.step_goal,
      lastSensorValue: row.last_sensor_value,
      baseline: row.baseline,
      lastUpdatedAt: row.last_updated_at,
      syncedAt: row.synced_at,
      createdAt: row.created_at,
    };
  }
}
