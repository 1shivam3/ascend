import { getDatabase } from '../sqlite';
import { Exercise, EquipmentTier, MovementPattern, ExerciseTier } from '../../types/domain.types';
import { SqliteExerciseRow } from '../types';

export class ExerciseRepository {
  static async getAll(): Promise<Exercise[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<SqliteExerciseRow>(
      'SELECT * FROM exercise_catalog ORDER BY name ASC;'
    );

    return rows.map(this.mapRowToExercise);
  }

  static async search(query: string = '', muscle?: string, equipment?: string): Promise<Exercise[]> {
    const db = await getDatabase();
    let sql = 'SELECT * FROM exercise_catalog WHERE 1=1';
    const params: string[] = [];

    if (query.trim().length > 0) {
      sql += ' AND (name LIKE ? OR primary_muscle LIKE ?)';
      params.push(`%${query.trim()}%`, `%${query.trim()}%`);
    }

    if (muscle && muscle !== 'ALL') {
      sql += ' AND primary_muscle = ?';
      params.push(muscle);
    }

    if (equipment && equipment !== 'ALL') {
      sql += ' AND equipment = ?';
      params.push(equipment);
    }

    sql += ' ORDER BY name ASC;';
    const rows = await db.getAllAsync<SqliteExerciseRow>(sql, params);
    return rows.map(this.mapRowToExercise);
  }

  static async getById(id: string): Promise<Exercise | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<SqliteExerciseRow>(
      'SELECT * FROM exercise_catalog WHERE id = ?;',
      [id]
    );

    return row ? this.mapRowToExercise(row) : null;
  }

  private static mapRowToExercise(row: SqliteExerciseRow): Exercise {
    let secondaryMuscles: string[] = [];
    try {
      secondaryMuscles = JSON.parse(row.secondary_muscles);
    } catch {
      secondaryMuscles = [];
    }

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      primaryMuscle: row.primary_muscle,
      secondaryMuscles,
      equipment: row.equipment as EquipmentTier,
      movementPattern: row.movement_pattern as MovementPattern,
      tier: row.tier as ExerciseTier,
      instructions: row.instructions || undefined,
      videoUrl: row.video_url || undefined,
      isCustom: Boolean(row.is_custom),
    };
  }
}
