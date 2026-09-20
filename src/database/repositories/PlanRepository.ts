import { getDatabase } from '../sqlite';
import { AIWorkoutPlan, AIWorkoutPlanSchema } from '../../services/ai/schemas';

export class PlanRepository {
  /**
   * Persists a workout plan into SQLite workout_plans table.
   * If isActive is true, deactivates other plans for this user.
   */
  static async savePlan(
    userId: string,
    plan: AIWorkoutPlan,
    isActive: boolean = true
  ): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    if (isActive) {
      await db.runAsync(
        `UPDATE workout_plans SET is_active = 0, updated_at = ? WHERE user_id = ?;`,
        [now, userId]
      );
    }

    await db.runAsync(
      `INSERT OR REPLACE INTO workout_plans (
        id, user_id, name, description, split_type, days_per_week, is_active, schedule_metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        plan.id,
        userId,
        plan.name,
        plan.progression_suggestions || plan.weekly_structure,
        plan.split_type,
        plan.days_per_week,
        isActive ? 1 : 0,
        JSON.stringify(plan),
        plan.created_at || now,
        now,
      ]
    );
  }

  /**
   * Retrieves the current active plan for a user.
   */
  static async getActivePlan(userId: string): Promise<AIWorkoutPlan | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ schedule_metadata: string }>(
      `SELECT schedule_metadata FROM workout_plans
       WHERE user_id = ? AND is_active = 1
       ORDER BY updated_at DESC
       LIMIT 1;`,
      [userId]
    );

    if (!row?.schedule_metadata) return null;

    try {
      const parsed = JSON.parse(row.schedule_metadata);
      const validation = AIWorkoutPlanSchema.safeParse(parsed);
      return validation.success ? validation.data : null;
    } catch {
      return null;
    }
  }

  /**
   * Retrieves a plan by ID.
   */
  static async getPlanById(planId: string): Promise<AIWorkoutPlan | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ schedule_metadata: string }>(
      `SELECT schedule_metadata FROM workout_plans WHERE id = ?;`,
      [planId]
    );

    if (!row?.schedule_metadata) return null;

    try {
      const parsed = JSON.parse(row.schedule_metadata);
      const validation = AIWorkoutPlanSchema.safeParse(parsed);
      return validation.success ? validation.data : null;
    } catch {
      return null;
    }
  }

  /**
   * Updates an existing plan's metadata and structure.
   */
  static async updatePlan(userId: string, plan: AIWorkoutPlan): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    await db.runAsync(
      `UPDATE workout_plans SET
        name = ?,
        description = ?,
        split_type = ?,
        days_per_week = ?,
        schedule_metadata = ?,
        updated_at = ?
      WHERE id = ? AND user_id = ?;`,
      [
        plan.name,
        plan.progression_suggestions || plan.weekly_structure,
        plan.split_type,
        plan.days_per_week,
        JSON.stringify(plan),
        now,
        plan.id,
        userId,
      ]
    );
  }

  /**
   * Sets a specific plan as active, deactivating others.
   */
  static async setActivePlan(userId: string, planId: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    await db.runAsync(
      `UPDATE workout_plans SET is_active = 0, updated_at = ? WHERE user_id = ?;`,
      [now, userId]
    );

    await db.runAsync(
      `UPDATE workout_plans SET is_active = 1, updated_at = ? WHERE id = ? AND user_id = ?;`,
      [now, planId, userId]
    );
  }
}
