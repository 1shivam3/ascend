import { getDatabase } from '../sqlite';
import { SQLITE_SCHEMA } from '../schema';
import { STARTER_EXERCISES } from '../../constants/exercises';
import { DEFAULT_EXERCISE_MILESTONES } from '../../config/milestones.config';

export const DEFAULT_USER_ID = 'u-default-local';

export function generateDefaultFriendCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let p1 = '';
  let p2 = '';
  for (let i = 0; i < 4; i++) {
    p1 += chars.charAt(Math.floor(Math.random() * chars.length));
    p2 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `ASC-${p1}-${p2}`;
}

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

  // 3. Safe column migration for existing database installs
  const columnsToAdd = [
    { name: 'goal', ddl: 'ALTER TABLE profiles ADD COLUMN goal TEXT NOT NULL DEFAULT "STRENGTH";' },
    { name: 'primary_goal', ddl: "ALTER TABLE profiles ADD COLUMN primary_goal TEXT NOT NULL DEFAULT 'GET_STRONGER';" },
    { name: 'secondary_goals', ddl: "ALTER TABLE profiles ADD COLUMN secondary_goals TEXT NOT NULL DEFAULT '[]';" },
    { name: 'experience', ddl: 'ALTER TABLE profiles ADD COLUMN experience TEXT NOT NULL DEFAULT "INTERMEDIATE";' },
    { name: 'age', ddl: 'ALTER TABLE profiles ADD COLUMN age INTEGER NOT NULL DEFAULT 25;' },
    { name: 'height_cm', ddl: 'ALTER TABLE profiles ADD COLUMN height_cm REAL NOT NULL DEFAULT 175.0;' },
    { name: 'weight_kg', ddl: 'ALTER TABLE profiles ADD COLUMN weight_kg REAL NOT NULL DEFAULT 75.0;' },
    { name: 'training_preferences', ddl: 'ALTER TABLE profiles ADD COLUMN training_preferences TEXT NOT NULL DEFAULT "{}";' },
    { name: 'is_guest', ddl: 'ALTER TABLE profiles ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 1;' },
    { name: 'onboarding_completed', ddl: 'ALTER TABLE profiles ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0;' },
    { name: 'leaderboard_opt_in', ddl: 'ALTER TABLE profiles ADD COLUMN leaderboard_opt_in INTEGER NOT NULL DEFAULT 0;' },
    { name: 'auth_id', ddl: 'ALTER TABLE profiles ADD COLUMN auth_id TEXT;' },
    { name: 'idempotency_key', ddl: 'ALTER TABLE local_sync_queue ADD COLUMN idempotency_key TEXT;' },
    { name: 'next_retry_at', ddl: 'ALTER TABLE local_sync_queue ADD COLUMN next_retry_at INTEGER;' },
    { name: 'progression_type', ddl: "ALTER TABLE exercise_catalog ADD COLUMN progression_type TEXT NOT NULL DEFAULT 'BARBELL_COMPOUND';" },
    { name: 'supports_1rm', ddl: 'ALTER TABLE exercise_catalog ADD COLUMN supports_1rm INTEGER NOT NULL DEFAULT 1;' },
    { name: 'supports_relative_strength', ddl: 'ALTER TABLE exercise_catalog ADD COLUMN supports_relative_strength INTEGER NOT NULL DEFAULT 0;' },
    { name: 'is_bodyweight', ddl: 'ALTER TABLE exercise_catalog ADD COLUMN is_bodyweight INTEGER NOT NULL DEFAULT 0;' },
    { name: 'rank', ddl: "ALTER TABLE exercise_mastery ADD COLUMN rank TEXT NOT NULL DEFAULT 'E';" },
    { name: 'relative_strength', ddl: 'ALTER TABLE exercise_mastery ADD COLUMN relative_strength REAL;' },
    { name: 'personal_records_count', ddl: 'ALTER TABLE exercise_mastery ADD COLUMN personal_records_count INTEGER NOT NULL DEFAULT 0;' },
    { name: 'milestones_unlocked_count', ddl: 'ALTER TABLE exercise_mastery ADD COLUMN milestones_unlocked_count INTEGER NOT NULL DEFAULT 0;' },
    { name: 'exercise_id', ddl: 'ALTER TABLE xp_transactions ADD COLUMN exercise_id TEXT;' },
    { name: 'xp_type', ddl: "ALTER TABLE xp_transactions ADD COLUMN xp_type TEXT NOT NULL DEFAULT 'PLAYER';" },
    { name: 'superset_id', ddl: 'ALTER TABLE exercise_logs ADD COLUMN superset_id TEXT;' },
    { name: 'trend', ddl: "ALTER TABLE exercise_mastery ADD COLUMN trend TEXT NOT NULL DEFAULT 'NEW';" },
    { name: 'xp_to_next_level', ddl: 'ALTER TABLE exercise_mastery ADD COLUMN xp_to_next_level INTEGER NOT NULL DEFAULT 100;' },
    { name: 'best_distance_meters', ddl: 'ALTER TABLE exercise_mastery ADD COLUMN best_distance_meters REAL DEFAULT 0.0;' },
    { name: 'best_duration_seconds', ddl: 'ALTER TABLE exercise_mastery ADD COLUMN best_duration_seconds INTEGER DEFAULT 0;' },
    { name: 'best_pace_seconds_per_km', ddl: 'ALTER TABLE exercise_mastery ADD COLUMN best_pace_seconds_per_km REAL DEFAULT 0.0;' },
    { name: 'total_distance_meters', ddl: 'ALTER TABLE exercise_mastery ADD COLUMN total_distance_meters REAL DEFAULT 0.0;' },
    { name: 'total_duration_seconds', ddl: 'ALTER TABLE exercise_mastery ADD COLUMN total_duration_seconds INTEGER DEFAULT 0;' },
    { name: 'distance_meters', ddl: 'ALTER TABLE set_logs ADD COLUMN distance_meters REAL;' },
    { name: 'duration_seconds', ddl: 'ALTER TABLE set_logs ADD COLUMN duration_seconds INTEGER;' },
    { name: 'pace_seconds_per_km', ddl: 'ALTER TABLE set_logs ADD COLUMN pace_seconds_per_km REAL;' },
    { name: 'friend_code', ddl: 'ALTER TABLE profiles ADD COLUMN friend_code TEXT;' },
  ];

  for (const col of columnsToAdd) {
    try {
      await db.runAsync(col.ddl);
    } catch {
      // Column already exists, safe to continue
    }
  }

  // Ensure idempotency indices exist
  try {
    await db.runAsync(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_transactions_unique 
       ON xp_transactions (user_id, source_type, source_id);`
    );
  } catch {
    // Index may already exist or constraint present
  }

  try {
    await db.runAsync(
      `CREATE INDEX IF NOT EXISTS idx_sync_queue_retry 
       ON local_sync_queue (status, next_retry_at);`
    );
  } catch {
    // Index may already exist
  }

  // 4. Backfill friend_code on profiles if missing
  try {
    const profilesWithoutCode = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM profiles WHERE friend_code IS NULL OR friend_code = "";'
    );
    for (const p of profilesWithoutCode) {
      const code = generateDefaultFriendCode();
      await db.runAsync('UPDATE profiles SET friend_code = ? WHERE id = ?;', [code, p.id]);
    }
  } catch {
    // Column might not exist yet if fresh
  }

  // 5. Seed default privacy_settings for existing profiles
  try {
    const profilesWithoutPrivacy = await db.getAllAsync<{ id: string }>(
      `SELECT p.id FROM profiles p LEFT JOIN privacy_settings ps ON p.id = ps.user_id WHERE ps.id IS NULL;`
    );
    const now = new Date().toISOString();
    for (const p of profilesWithoutPrivacy) {
      await db.runAsync(
        `INSERT OR IGNORE INTO privacy_settings (
          id, user_id, profile_visibility, feed_visibility_default,
          show_workouts_in_feed, show_prs_in_feed, show_level_ups_in_feed,
          show_rank_ups_in_feed, show_achievements_in_feed, show_challenges_in_feed,
          show_evolution_in_feed, allow_friend_requests, show_mastery_on_profile,
          show_achievements_on_profile, show_streak_on_profile, created_at, updated_at
        ) VALUES (?, ?, 'FRIENDS', 'FRIENDS', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, ?, ?);`,
        [`ps-${p.id}`, p.id, now, now]
      );
    }
  } catch {
    // Table might be initializing
  }

  // 6. Check if default user profile exists
  const userProfile = await db.getFirstAsync<{ id: string; onboarding_completed: number }>(
    'SELECT id, onboarding_completed FROM profiles WHERE id = ?;',
    [DEFAULT_USER_ID]
  );

  if (!userProfile) {
    const now = new Date().toISOString();
    const defaultFriendCode = generateDefaultFriendCode();
    const defaultAttributes = JSON.stringify({
      strength: 10,
      endurance: 10,
      agility: 10,
      consistency: 10,
      stamina: 10,
      discipline: 10,
      vitality: 10,
    });
    const defaultPreferences = JSON.stringify({
      daysPerWeek: 4,
      sessionDurationMinutes: 60,
      equipment: ['BARBELL', 'DUMBBELL', 'CABLE', 'MACHINE', 'BODYWEIGHT'],
      trainingLocation: 'COMMERCIAL_GYM',
      preferredExerciseIds: [],
      excludedExerciseIds: [],
      limitations: [],
    });

    await db.runAsync(
      `INSERT INTO profiles (
        id, username, display_name, avatar_url, goal, experience, age, height_cm, weight_kg,
        training_preferences, global_level, total_xp, rank_tier, rank_division,
        attributes, current_streak, longest_streak, streak_freeze_tokens,
        is_guest, onboarding_completed, leaderboard_opt_in, auth_id, friend_code, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        DEFAULT_USER_ID,
        'vanguard_one',
        'Vanguard',
        '⚔️',
        'STRENGTH',
        'INTERMEDIATE',
        25,
        175.0,
        75.0,
        defaultPreferences,
        1,
        0,
        'E',
        4,
        defaultAttributes,
        0,
        0,
        1,
        1,
        0, // onboarding_completed is 0 until user finishes onboarding
        0, // leaderboard_opt_in is 0 (opted-out by default)
        null,
        defaultFriendCode,
        now,
        now,
      ]
    );

    // Also insert initial privacy settings for default user
    await db.runAsync(
      `INSERT OR IGNORE INTO privacy_settings (
        id, user_id, profile_visibility, feed_visibility_default,
        show_workouts_in_feed, show_prs_in_feed, show_level_ups_in_feed,
        show_rank_ups_in_feed, show_achievements_in_feed, show_challenges_in_feed,
        show_evolution_in_feed, allow_friend_requests, show_mastery_on_profile,
        show_achievements_on_profile, show_streak_on_profile, created_at, updated_at
      ) VALUES (?, ?, 'FRIENDS', 'FRIENDS', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, ?, ?);`,
      [`ps-${DEFAULT_USER_ID}`, DEFAULT_USER_ID, now, now]
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

    // Seed Tactical Quests
    const defaultQuests = [
      {
        id: 'quest-field-deployment',
        title: 'Field Deployment',
        description: 'Complete and record any active training session today.',
        type: 'DAILY',
        category: 'WORKOUT_COUNT',
        targetValue: 1,
        unit: 'SESSION',
        xpReward: 75,
        badgeVariant: 'cyan',
      },
      {
        id: 'quest-tonnage-threshold',
        title: 'Tonnage Threshold',
        description: 'Accumulate at least 4,000 kg total volume across all completed sets.',
        type: 'DAILY',
        category: 'VOLUME_TOTAL',
        targetValue: 4000,
        unit: 'KG',
        xpReward: 75,
        badgeVariant: 'cyan',
      },
      {
        id: 'quest-limit-exertion',
        title: 'Limit Exertion',
        description: 'Log at least 1 working set taken to true technical failure (Type: F).',
        type: 'DAILY',
        category: 'FAILURE_SETS',
        targetValue: 1,
        unit: 'FAILURE SET',
        xpReward: 75,
        badgeVariant: 'amber',
      },
      {
        id: 'quest-iron-consistency',
        title: 'Iron Consistency',
        description: 'Complete 4 distinct scheduled training days this calendar week.',
        type: 'WEEKLY',
        category: 'WORKOUT_COUNT',
        targetValue: 4,
        unit: 'DAYS',
        xpReward: 250,
        badgeVariant: 'emerald',
      },
      {
        id: 'quest-compound-domination',
        title: 'Compound Domination',
        description: 'Log 20 total sets across primary compound lifts (Squat/Bench/Deadlift).',
        type: 'WEEKLY',
        category: 'COMPOUND_SETS',
        targetValue: 20,
        unit: 'SETS',
        xpReward: 250,
        badgeVariant: 'emerald',
      },
      {
        id: 'quest-big-three-mastery',
        title: 'The Big Three Mastery',
        description: 'Reach Lift Level 10 on Bench Press, Back Squat, and Conventional Deadlift.',
        type: 'CAMPAIGN',
        category: 'MASTERY_LEVEL',
        targetValue: 3,
        unit: 'MOVEMENTS',
        xpReward: 500,
        badgeVariant: 'violet',
      },
      {
        id: 'quest-heavy-iron',
        title: 'Heavy Compound Overload',
        description: 'Log 12 heavy compound sets (3-6 reps) on primary compound lifts.',
        type: 'WEEKLY',
        category: 'HEAVY_COMPOUND',
        targetValue: 12,
        unit: 'SETS',
        xpReward: 250,
        badgeVariant: 'emerald',
      },
      {
        id: 'quest-aerobic-distance',
        title: 'Distance Pacesetter',
        description: 'Accumulate 10,000 meters of running, rowing, or cardio distance.',
        type: 'WEEKLY',
        category: 'TARGET_DISTANCE',
        targetValue: 10000,
        unit: 'METERS',
        xpReward: 300,
        badgeVariant: 'emerald',
      },
      {
        id: 'quest-calisthenics-mastery',
        title: 'Bodyweight Mastery',
        description: 'Complete 100 total repetitions across bodyweight movements (pull-ups, push-ups, dips).',
        type: 'WEEKLY',
        category: 'CALISTHENICS_REPS',
        targetValue: 100,
        unit: 'REPS',
        xpReward: 250,
        badgeVariant: 'cyan',
      },
      {
        id: 'quest-power-conditioning',
        title: 'Kinetic Power Output',
        description: 'Complete 10 explosive power sets (box jumps, kettlebell swings, or carries).',
        type: 'WEEKLY',
        category: 'POWER_CONDITIONING',
        targetValue: 10,
        unit: 'SETS',
        xpReward: 250,
        badgeVariant: 'amber',
      },
      {
        id: 'quest-hypertrophy-volume',
        title: 'Hypertrophy Surge',
        description: 'Accumulate 15,000 kg total volume across all working sets.',
        type: 'WEEKLY',
        category: 'TARGET_VOLUME',
        targetValue: 15000,
        unit: 'KG',
        xpReward: 300,
        badgeVariant: 'emerald',
      },
    ];

    for (const q of defaultQuests) {
      await db.runAsync(
        `INSERT OR IGNORE INTO quests (
          id, title, description, type, category, target_value, unit, xp_reward, badge_variant, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [q.id, q.title, q.description, q.type, q.category, q.targetValue, q.unit, q.xpReward, q.badgeVariant, now]
      );

      await db.runAsync(
        `INSERT OR IGNORE INTO user_quests (
          id, user_id, quest_id, current_progress, target_value, completed, completed_at, last_reset_date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          `uq-${DEFAULT_USER_ID}-${q.id}`,
          DEFAULT_USER_ID,
          q.id,
          0,
          q.targetValue,
          0,
          null,
          now.split('T')[0],
          now,
          now,
        ]
      );
    }
  }

  // 5. Seed Exercise Milestones
  const now = new Date().toISOString();
  for (const ms of DEFAULT_EXERCISE_MILESTONES) {
    await db.runAsync(
      `INSERT OR IGNORE INTO exercise_milestones (
        id, exercise_id, metric, threshold, reward_xp, title, description, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [ms.id, ms.exerciseId, ms.metric, ms.threshold, ms.rewardXp, ms.title, ms.description, now]
    );
  }

  // 6. Historical Data Migration: derive initial exercise mastery from historical workout logs
  await backfillHistoricalMastery(db);

  // 7. Seed Default Workout Templates & Supersets
  await seedDefaultTemplates(db);
}

async function backfillHistoricalMastery(db: any): Promise<void> {
  try {
    const historicalRows: {
      user_id: string;
      exercise_id: string;
      total_sessions: number;
      total_sets: number;
      total_reps: number;
      total_volume: number;
      best_weight: number;
      best_reps: number;
      best_e1rm: number;
      last_performed_at: string;
    }[] = await db.getAllAsync(`
      SELECT 
        el.user_id,
        el.exercise_id,
        COUNT(DISTINCT el.workout_id) as total_sessions,
        COUNT(s.id) as total_sets,
        COALESCE(SUM(s.reps), 0) as total_reps,
        COALESCE(SUM(s.weight_kg * s.reps), 0) as total_volume,
        COALESCE(MAX(s.weight_kg), 0) as best_weight,
        COALESCE(MAX(s.reps), 0) as best_reps,
        COALESCE(MAX(s.estimated_1rm_kg), 0) as best_e1rm,
        MAX(s.completed_at) as last_performed_at
      FROM exercise_logs el
      JOIN set_logs s ON s.exercise_log_id = el.id
      WHERE s.completed = 1 AND s.is_skipped = 0
      GROUP BY el.user_id, el.exercise_id;
    `);

    for (const row of historicalRows) {
      // Calculate initial XP, level, rank
      const setsXp = row.total_sets * 20 + Math.round(row.total_volume / 100);
      const initialLevel = Math.max(1, Math.floor(Math.pow(setsXp / 100, 1 / 1.25)));
      const rank = initialLevel >= 81 ? 'SSS' :
                   initialLevel >= 61 ? 'SS' :
                   initialLevel >= 51 ? 'S' :
                   initialLevel >= 41 ? 'A' :
                   initialLevel >= 31 ? 'B' :
                   initialLevel >= 21 ? 'C' :
                   initialLevel >= 11 ? 'D' : 'E';

      const now = new Date().toISOString();
      await db.runAsync(
        `INSERT OR IGNORE INTO exercise_mastery (
          id, user_id, exercise_id, mastery_level, mastery_xp, rank,
          estimated_1rm_kg, best_weight_kg, best_reps, best_volume_kg,
          relative_strength, total_sessions, total_sets, total_reps, total_volume_kg,
          personal_records_count, milestones_unlocked_count, recent_performance,
          last_trained_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          `em-${row.user_id}-${row.exercise_id}`,
          row.user_id,
          row.exercise_id,
          initialLevel,
          setsXp,
          rank,
          row.best_e1rm,
          row.best_weight,
          row.best_reps,
          0,
          null,
          row.total_sessions,
          row.total_sets,
          row.total_reps,
          row.total_volume,
          0,
          0,
          '[]',
          row.last_performed_at || now,
          now,
          now
        ]
      );
    }
  } catch (err) {
    console.warn('[init] Historical mastery backfill error (non-fatal):', err);
  }
}

async function seedDefaultTemplates(db: any): Promise<void> {
  try {
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS workout_templates (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        split_type TEXT NOT NULL DEFAULT 'CUSTOM',
        folder TEXT,
        is_preset INTEGER NOT NULL DEFAULT 0,
        estimated_duration_min INTEGER NOT NULL DEFAULT 60,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_workout_templates_user ON workout_templates (user_id);`);

    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS workout_template_exercises (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        exercise_id TEXT NOT NULL,
        order_index INTEGER NOT NULL DEFAULT 0,
        target_sets INTEGER NOT NULL DEFAULT 3,
        target_reps TEXT NOT NULL DEFAULT '8-12',
        target_weight_kg REAL,
        target_rpe REAL,
        rest_seconds INTEGER NOT NULL DEFAULT 90,
        superset_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
      );
    `);
    await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_workout_template_ex_template ON workout_template_exercises (template_id, order_index);`);

    const presetCount = (await db.getFirstAsync(
      `SELECT COUNT(*) as count FROM workout_templates WHERE is_preset = 1;`
    )) as { count: number } | null;

    if (presetCount && presetCount.count > 0) {
      return;
    }

    const now = new Date().toISOString();

    const presets = [
      {
        id: 'tpl-push-heavy',
        userId: DEFAULT_USER_ID,
        name: 'Push Heavy Compound',
        description: 'Pectoral, anterior deltoid, and tricep power foundation.',
        splitType: 'PUSH',
        folder: 'Hypertrophy & Power',
        isPreset: 1,
        estimatedDurationMin: 60,
        exercises: [
          { exerciseId: 'ex-bench-press', order: 0, sets: 4, reps: '5', weight: 80, rpe: 8, rest: 180, supersetId: null, notes: 'Warm up thoroughly. Drive aggressively.' },
          { exerciseId: 'ex-incline-db-press', order: 1, sets: 3, reps: '8-10', weight: 30, rpe: 8, rest: 120, supersetId: null, notes: 'Focus on clavicular pec stretch.' },
          { exerciseId: 'ex-overhead-press', order: 2, sets: 3, reps: '6-8', weight: 50, rpe: 8.5, rest: 120, supersetId: null, notes: 'Full overhead lockout.' },
          { exerciseId: 'ex-lateral-raise', order: 3, sets: 4, reps: '12-15', weight: 12, rpe: 9, rest: 60, supersetId: null, notes: 'Strict form, lead with elbows.' },
        ],
      },
      {
        id: 'tpl-pull-power',
        userId: DEFAULT_USER_ID,
        name: 'Pull Hypertrophy & Hinge',
        description: 'Posterior chain, lat sweep, and elbow flexor development.',
        splitType: 'PULL',
        folder: 'Hypertrophy & Power',
        isPreset: 1,
        estimatedDurationMin: 65,
        exercises: [
          { exerciseId: 'ex-barbell-deadlift', order: 0, sets: 4, reps: '5', weight: 120, rpe: 8.5, rest: 180, supersetId: null, notes: 'Reset between reps. Maintain brace.' },
          { exerciseId: 'ex-pullup', order: 1, sets: 3, reps: '8-10', weight: 0, rpe: 8, rest: 90, supersetId: null, notes: 'Dead hang to chin over bar.' },
          { exerciseId: 'ex-barbell-row', order: 2, sets: 3, reps: '8-10', weight: 70, rpe: 8, rest: 90, supersetId: null, notes: 'Pull bar to navel.' },
          { exerciseId: 'ex-seated-cable-row', order: 3, sets: 3, reps: '10-12', weight: 60, rpe: 8.5, rest: 60, supersetId: null, notes: 'Squeeze shoulder blades.' },
        ],
      },
      {
        id: 'tpl-legs-power',
        userId: DEFAULT_USER_ID,
        name: 'Legs Quad & Hamstring Focus',
        description: 'Knee flexion, hip hinge, and lower body work capacity.',
        splitType: 'LEGS',
        folder: 'Hypertrophy & Power',
        isPreset: 1,
        estimatedDurationMin: 70,
        exercises: [
          { exerciseId: 'ex-barbell-back-squat', order: 0, sets: 4, reps: '5', weight: 100, rpe: 8, rest: 180, supersetId: null, notes: 'Depth below parallel.' },
          { exerciseId: 'ex-barbell-front-squat', order: 1, sets: 3, reps: '8', weight: 60, rpe: 8, rest: 120, supersetId: null, notes: 'High elbows, upright torso.' },
          { exerciseId: 'ex-lying-leg-curl', order: 2, sets: 3, reps: '10-12', weight: 45, rpe: 8.5, rest: 60, supersetId: null, notes: 'Controlled eccentric.' },
          { exerciseId: 'ex-standing-calf-raise', order: 3, sets: 4, reps: '15', weight: 50, rpe: 9, rest: 45, supersetId: null, notes: 'Full bottom stretch.' },
        ],
      },
      {
        id: 'tpl-upper-superset',
        userId: DEFAULT_USER_ID,
        name: 'Upper Body Antagonist Superset',
        description: 'High-density paired antagonist supersets for maximum hypertrophy and work capacity.',
        splitType: 'UPPER',
        folder: 'Superset Protocols',
        isPreset: 1,
        estimatedDurationMin: 55,
        exercises: [
          { exerciseId: 'ex-bench-press', order: 0, sets: 4, reps: '8', weight: 75, rpe: 8, rest: 45, supersetId: 'SS-1', notes: 'Superset Part A1' },
          { exerciseId: 'ex-pullup', order: 1, sets: 4, reps: '8', weight: 0, rpe: 8, rest: 90, supersetId: 'SS-1', notes: 'Superset Part A2' },
          { exerciseId: 'ex-dumbbell-shoulder-press', order: 2, sets: 3, reps: '10', weight: 24, rpe: 8, rest: 45, supersetId: 'SS-2', notes: 'Superset Part B1' },
          { exerciseId: 'ex-seated-cable-row', order: 3, sets: 3, reps: '10', weight: 55, rpe: 8, rest: 90, supersetId: 'SS-2', notes: 'Superset Part B2' },
        ],
      },
    ];

    for (const p of presets) {
      await db.runAsync(
        `INSERT OR IGNORE INTO workout_templates (
          id, user_id, name, description, split_type, folder, is_preset, estimated_duration_min, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [p.id, p.userId, p.name, p.description, p.splitType, p.folder, p.isPreset, p.estimatedDurationMin, now, now]
      );

      for (const ex of p.exercises) {
        await db.runAsync(
          `INSERT OR IGNORE INTO workout_template_exercises (
            id, template_id, exercise_id, order_index, target_sets, target_reps, target_weight_kg, target_rpe, rest_seconds, superset_id, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            `wte-${p.id}-${ex.order}`,
            p.id,
            ex.exerciseId,
            ex.order,
            ex.sets,
            String(ex.reps),
            ex.weight,
            ex.rpe,
            ex.rest,
            ex.supersetId,
            ex.notes,
            now
          ]
        );
      }
    }
  } catch (err) {
    console.warn('[init] Template seeding error (non-fatal):', err);
  }

  // 12. Seed default system challenges
  try {
    const challengeCount = (await (db as any).getFirstAsync(
      'SELECT COUNT(*) as count FROM challenges WHERE created_by = "SYSTEM";'
    )) as { count: number } | null;

    if (!challengeCount || challengeCount.count === 0) {
      const now = new Date();
      const startAt = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const endAt = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
      const createdAt = now.toISOString();

      const systemChallenges = [
        {
          id: 'ch-the-climb',
          title: 'THE CLIMB',
          description: 'Complete 4 qualifying workout sessions this cycle. Prove your dedication.',
          type: 'WORKOUT_COUNT',
          metric: 'WORKOUTS',
          target: 4,
          startAt,
          endAt,
          visibility: 'PUBLIC',
          rewardXp: 300,
        },
        {
          id: 'ch-iron-week',
          title: 'IRON WEEK',
          description: 'Accumulate 20,000 kg total training volume across all compound and accessory lifts.',
          type: 'TRAINING_VOLUME',
          metric: 'VOLUME_KG',
          target: 20000,
          startAt,
          endAt,
          visibility: 'PUBLIC',
          rewardXp: 500,
        },
        {
          id: 'ch-cardio-rush',
          title: 'CARDIO RUSH',
          description: 'Cover a cumulative distance of 15 km through running, rowing, or conditioning protocols.',
          type: 'DISTANCE',
          metric: 'DISTANCE_KM',
          target: 15,
          startAt,
          endAt,
          visibility: 'PUBLIC',
          rewardXp: 400,
        },
        {
          id: 'ch-consistency',
          title: 'CONSISTENCY',
          description: 'Log training sessions on 5 distinct days to forge unbreakable discipline.',
          type: 'GOAL_METRIC',
          metric: 'DAYS_ACTIVE',
          target: 5,
          startAt,
          endAt,
          visibility: 'PUBLIC',
          rewardXp: 450,
        },
        {
          id: 'ch-strength-push',
          title: 'STRENGTH PUSH',
          description: 'Complete 3 heavy qualifying strength sessions meeting baseline progressive overload thresholds.',
          type: 'GOAL_METRIC',
          metric: 'SESSIONS',
          target: 3,
          startAt,
          endAt,
          visibility: 'PUBLIC',
          rewardXp: 400,
        },
      ];

      for (const ch of systemChallenges) {
        await db.runAsync(
          `INSERT OR IGNORE INTO challenges (
            id, title, description, type, metric, target, start_at, end_at, visibility, created_by, status, config, reward_xp, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYSTEM', 'ACTIVE', '{}', ?, ?, ?);`,
          [
            ch.id,
            ch.title,
            ch.description,
            ch.type,
            ch.metric,
            ch.target,
            ch.startAt,
            ch.endAt,
            ch.visibility,
            ch.rewardXp,
            createdAt,
            createdAt,
          ]
        );
      }
    }
  } catch (err) {
    console.warn('[init] Challenge seeding error (non-fatal):', err);
  }
}


