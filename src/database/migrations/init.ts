import { getDatabase } from '../sqlite';
import { SQLITE_SCHEMA } from '../schema';
import { STARTER_EXERCISES } from '../../constants/exercises';

export const DEFAULT_USER_ID = 'u-default-local';

export async function initializeDatabase(): Promise<void> {
  const db = await getDatabase();

  // 1. Execute DDL tables
  await db.execAsync(SQLITE_SCHEMA);

  // 2. Check if exercise catalog is seeded
  const exerciseCount = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM exercise_catalog;'
  );

  if (!exerciseCount || exerciseCount.count === 0) {
    const now = new Date().toISOString();
    for (const ex of STARTER_EXERCISES) {
      await db.runAsync(
        `INSERT OR IGNORE INTO exercise_catalog (
          id, name, slug, primary_muscle, secondary_muscles, equipment, movement_pattern, tier, instructions, is_custom, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          ex.id,
          ex.name,
          ex.slug,
          ex.primaryMuscle,
          JSON.stringify(ex.secondaryMuscles),
          ex.equipment,
          ex.movementPattern,
          ex.tier,
          ex.instructions || null,
          ex.isCustom ? 1 : 0,
          now,
          now,
        ]
      );
    }
  }

  // 3. Check if default user profile exists
  const userProfile = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM profiles WHERE id = ?;',
    [DEFAULT_USER_ID]
  );

  if (!userProfile) {
    const now = new Date().toISOString();
    const defaultAttributes = JSON.stringify({
      strength: 10,
      stamina: 10,
      agility: 10,
      discipline: 10,
      vitality: 10,
    });

    await db.runAsync(
      `INSERT INTO profiles (
        id, username, display_name, global_level, total_xp, rank_tier, rank_division, attributes, current_streak, longest_streak, streak_freeze_tokens, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        DEFAULT_USER_ID,
        'vanguard_one',
        'Vanguard',
        1,
        0,
        'INITIATE',
        4,
        defaultAttributes,
        0,
        0,
        1,
        now,
        now,
      ]
    );

    await db.runAsync(
      `INSERT INTO user_settings (
        id, user_id, preferred_unit, sound_enabled, haptics_enabled, default_rest_seconds, push_notifications_enabled, streak_freeze_auto_use, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        's-default-local',
        DEFAULT_USER_ID,
        'kg',
        1,
        1,
        90,
        1,
        1,
        now,
        now,
      ]
    );
  }
}
