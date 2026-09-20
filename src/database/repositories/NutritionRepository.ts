import { getDatabase } from '../sqlite';
import { SyncQueueRepository } from './SyncQueueRepository';

export interface NutritionEntry {
  id?: string;
  userId: string;
  date: string; // YYYY-MM-DD
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
  bodyweightKg?: number | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface SqliteNutritionRow {
  id: string;
  user_id: string;
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  water_ml: number;
  bodyweight_kg: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export class NutritionRepository {
  /**
   * Logs or updates daily manual nutrition and bodyweight metrics.
   */
  static async logDailyNutrition(entry: NutritionEntry): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const id = entry.id || `nutr-${entry.userId}-${entry.date}`;

    await db.runAsync(
      `INSERT OR REPLACE INTO nutrition_logs (
        id, user_id, date, calories, protein_g, carbs_g, fat_g, water_ml, bodyweight_kg, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM nutrition_logs WHERE user_id = ? AND date = ?), ?), ?);`,
      [
        id,
        entry.userId,
        entry.date,
        Math.max(0, Math.round(entry.calories || 0)),
        Math.max(0, Math.round((entry.proteinG || 0) * 10) / 10),
        Math.max(0, Math.round((entry.carbsG || 0) * 10) / 10),
        Math.max(0, Math.round((entry.fatG || 0) * 10) / 10),
        Math.max(0, Math.round(entry.waterMl || 0)),
        entry.bodyweightKg != null ? Math.round(entry.bodyweightKg * 10) / 10 : null,
        entry.notes || null,
        entry.userId,
        entry.date,
        now,
        now,
      ]
    );

    // If bodyweight was logged, also keep user profile weightKg in sync
    if (entry.bodyweightKg && entry.bodyweightKg > 0) {
      await db.runAsync(
        `UPDATE profiles SET weight_kg = ?, updated_at = ? WHERE id = ?;`,
        [entry.bodyweightKg, now, entry.userId]
      );
    }

    // Enqueue for background synchronization to Supabase
    await SyncQueueRepository.enqueue(
      'nutrition_log',
      id,
      'UPDATE',
      {
        id,
        user_id: entry.userId,
        date: entry.date,
        calories: Math.max(0, Math.round(entry.calories || 0)),
        protein_g: Math.max(0, Math.round((entry.proteinG || 0) * 10) / 10),
        carbs_g: Math.max(0, Math.round((entry.carbsG || 0) * 10) / 10),
        fat_g: Math.max(0, Math.round((entry.fatG || 0) * 10) / 10),
        water_ml: Math.max(0, Math.round(entry.waterMl || 0)),
        bodyweight_kg: entry.bodyweightKg != null ? Math.round(entry.bodyweightKg * 10) / 10 : null,
        notes: entry.notes || null,
        updated_at: now,
      },
      `nutr:${entry.userId}:${entry.date}`
    );
  }

  /**
   * Retrieves nutrition entry for a specific date.
   */
  static async getDailyNutrition(userId: string, dateStr: string): Promise<NutritionEntry | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<SqliteNutritionRow>(
      `SELECT * FROM nutrition_logs WHERE user_id = ? AND date = ?;`,
      [userId, dateStr]
    );

    return row ? this.mapRow(row) : null;
  }

  /**
   * Retrieves recent nutrition logs ordered by date descending.
   */
  static async getRecentNutritionHistory(
    userId: string,
    limitDays: number = 7
  ): Promise<NutritionEntry[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<SqliteNutritionRow>(
      `SELECT * FROM nutrition_logs WHERE user_id = ? ORDER BY date DESC LIMIT ?;`,
      [userId, limitDays]
    );

    return rows.map(this.mapRow);
  }

  /**
   * Computes average daily intake over the last N days.
   */
  static async getAverageIntake(
    userId: string,
    days: number = 7
  ): Promise<{ avgCalories: number; avgProtein: number; avgWater: number }> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{
      avg_cal: number | null;
      avg_pro: number | null;
      avg_water: number | null;
    }>(
      `SELECT 
        AVG(calories) as avg_cal,
        AVG(protein_g) as avg_pro,
        AVG(water_ml) as avg_water
       FROM (
         SELECT calories, protein_g, water_ml FROM nutrition_logs
         WHERE user_id = ? ORDER BY date DESC LIMIT ?
       );`,
      [userId, days]
    );

    return {
      avgCalories: Math.round(row?.avg_cal || 0),
      avgProtein: Math.round((row?.avg_pro || 0) * 10) / 10,
      avgWater: Math.round(row?.avg_water || 0),
    };
  }

  private static mapRow(row: SqliteNutritionRow): NutritionEntry {
    return {
      id: row.id,
      userId: row.user_id,
      date: row.date,
      calories: row.calories,
      proteinG: row.protein_g,
      carbsG: row.carbs_g,
      fatG: row.fat_g,
      waterMl: row.water_ml,
      bodyweightKg: row.bodyweight_kg,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
