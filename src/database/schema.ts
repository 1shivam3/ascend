export const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  global_level INTEGER NOT NULL DEFAULT 1,
  total_xp INTEGER NOT NULL DEFAULT 0,
  rank_tier TEXT NOT NULL DEFAULT 'INITIATE',
  rank_division INTEGER NOT NULL DEFAULT 1,
  attributes TEXT NOT NULL, -- JSON string: {strength, stamina, agility, discipline, vitality}
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  streak_freeze_tokens INTEGER NOT NULL DEFAULT 1,
  last_workout_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  preferred_unit TEXT NOT NULL DEFAULT 'kg',
  sound_enabled INTEGER NOT NULL DEFAULT 1,
  haptics_enabled INTEGER NOT NULL DEFAULT 1,
  default_rest_seconds INTEGER NOT NULL DEFAULT 90,
  push_notifications_enabled INTEGER NOT NULL DEFAULT 1,
  streak_freeze_auto_use INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exercise_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  primary_muscle TEXT NOT NULL,
  secondary_muscles TEXT NOT NULL, -- JSON array of strings
  equipment TEXT NOT NULL,
  movement_pattern TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'STANDARD',
  instructions TEXT,
  video_url TEXT,
  is_custom INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exercise_primary_muscle ON exercise_catalog (primary_muscle);
CREATE INDEX IF NOT EXISTS idx_exercise_equipment ON exercise_catalog (equipment);

CREATE TABLE IF NOT EXISTS workout_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  split_type TEXT NOT NULL,
  days_per_week INTEGER NOT NULL DEFAULT 4,
  is_active INTEGER NOT NULL DEFAULT 0,
  schedule_metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workouts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_id TEXT,
  title TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_seconds INTEGER DEFAULT 0,
  total_volume_kg REAL NOT NULL DEFAULT 0.0,
  total_reps INTEGER NOT NULL DEFAULT 0,
  total_sets INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  xp_earned INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workouts_user_started ON workouts (user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS exercise_logs (
  id TEXT PRIMARY KEY,
  workout_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workout_id) REFERENCES workouts (id) ON DELETE CASCADE,
  FOREIGN KEY (exercise_id) REFERENCES exercise_catalog (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS set_logs (
  id TEXT PRIMARY KEY,
  exercise_log_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  set_number INTEGER NOT NULL,
  set_type TEXT NOT NULL DEFAULT 'NORMAL',
  weight_kg REAL NOT NULL DEFAULT 0.0,
  reps INTEGER NOT NULL DEFAULT 0,
  rpe REAL,
  estimated_1rm_kg REAL NOT NULL DEFAULT 0.0,
  is_pr INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 1,
  completed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (exercise_log_id) REFERENCES exercise_logs (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_set_logs_exercise_log ON set_logs (exercise_log_id);

CREATE TABLE IF NOT EXISTS exercise_mastery (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL UNIQUE,
  mastery_level INTEGER NOT NULL DEFAULT 1,
  mastery_xp INTEGER NOT NULL DEFAULT 0,
  estimated_1rm_kg REAL NOT NULL DEFAULT 0.0,
  best_weight_kg REAL NOT NULL DEFAULT 0.0,
  best_reps INTEGER NOT NULL DEFAULT 0,
  best_volume_kg REAL NOT NULL DEFAULT 0.0,
  total_sessions INTEGER NOT NULL DEFAULT 0,
  total_sets INTEGER NOT NULL DEFAULT 0,
  total_reps INTEGER NOT NULL DEFAULT 0,
  total_volume_kg REAL NOT NULL DEFAULT 0.0,
  recent_performance TEXT NOT NULL DEFAULT '[]',
  last_trained_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (exercise_id) REFERENCES exercise_catalog (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS personal_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  pr_type TEXT NOT NULL,
  value REAL NOT NULL,
  set_log_id TEXT,
  achieved_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, exercise_id, pr_type)
);

CREATE TABLE IF NOT EXISTS xp_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  amount INTEGER NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_sync_queue (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT NOT NULL,
  client_timestamp INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status_ts 
  ON local_sync_queue (status, client_timestamp ASC);
`;
