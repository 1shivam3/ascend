export const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  goal TEXT NOT NULL DEFAULT 'STRENGTH',
  primary_goal TEXT NOT NULL DEFAULT 'GET_STRONGER',
  secondary_goals TEXT NOT NULL DEFAULT '[]',
  experience TEXT NOT NULL DEFAULT 'INTERMEDIATE',
  age INTEGER NOT NULL DEFAULT 25,
  height_cm REAL NOT NULL DEFAULT 175.0,
  weight_kg REAL NOT NULL DEFAULT 75.0,
  training_preferences TEXT NOT NULL DEFAULT '{}',
  global_level INTEGER NOT NULL DEFAULT 1,
  total_xp INTEGER NOT NULL DEFAULT 0,
  rank_tier TEXT NOT NULL DEFAULT 'E',
  rank_division INTEGER NOT NULL DEFAULT 4,
  attributes TEXT NOT NULL, -- JSON string: {strength, endurance, agility, consistency, stamina, discipline, vitality}
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  streak_freeze_tokens INTEGER NOT NULL DEFAULT 1,
  last_workout_date TEXT,
  is_guest INTEGER NOT NULL DEFAULT 1,
  onboarding_completed INTEGER NOT NULL DEFAULT 0,
  leaderboard_opt_in INTEGER NOT NULL DEFAULT 0,
  auth_id TEXT,
  friend_code TEXT UNIQUE,
  active_title TEXT,
  active_title_id TEXT,
  avatar_config TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profiles_friend_code ON profiles (friend_code);

CREATE TABLE IF NOT EXISTS user_titles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE,
  UNIQUE(user_id, title_id)
);

CREATE INDEX IF NOT EXISTS idx_user_titles_user ON user_titles (user_id);

CREATE TABLE IF NOT EXISTS user_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  preferred_unit TEXT NOT NULL DEFAULT 'kg',
  sound_enabled INTEGER NOT NULL DEFAULT 1,
  haptics_enabled INTEGER NOT NULL DEFAULT 1,
  default_rest_seconds INTEGER NOT NULL DEFAULT 90,
  push_notifications_enabled INTEGER NOT NULL DEFAULT 1,
  streak_freeze_auto_use INTEGER NOT NULL DEFAULT 1,
  theme_mode TEXT NOT NULL DEFAULT 'light',
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
  progression_type TEXT NOT NULL DEFAULT 'BARBELL_COMPOUND',
  supports_1rm INTEGER NOT NULL DEFAULT 1,
  supports_relative_strength INTEGER NOT NULL DEFAULT 0,
  is_bodyweight INTEGER NOT NULL DEFAULT 0,
  instructions TEXT,
  video_url TEXT,
  is_custom INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exercise_primary_muscle ON exercise_catalog (primary_muscle);
CREATE INDEX IF NOT EXISTS idx_exercise_equipment ON exercise_catalog (equipment);
CREATE INDEX IF NOT EXISTS idx_exercise_progression_type ON exercise_catalog (progression_type);

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
  superset_id TEXT,
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
  is_skipped INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT NOT NULL,
  distance_meters REAL,
  duration_seconds INTEGER,
  pace_seconds_per_km REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (exercise_log_id) REFERENCES exercise_logs (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_set_logs_exercise_log ON set_logs (exercise_log_id);

CREATE TABLE IF NOT EXISTS exercise_mastery (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  mastery_level INTEGER NOT NULL DEFAULT 1,
  mastery_xp INTEGER NOT NULL DEFAULT 0,
  rank TEXT NOT NULL DEFAULT 'E',
  estimated_1rm_kg REAL NOT NULL DEFAULT 0.0,
  best_weight_kg REAL NOT NULL DEFAULT 0.0,
  best_reps INTEGER NOT NULL DEFAULT 0,
  best_volume_kg REAL NOT NULL DEFAULT 0.0,
  relative_strength REAL,
  total_sessions INTEGER NOT NULL DEFAULT 0,
  total_sets INTEGER NOT NULL DEFAULT 0,
  total_reps INTEGER NOT NULL DEFAULT 0,
  total_volume_kg REAL NOT NULL DEFAULT 0.0,
  personal_records_count INTEGER NOT NULL DEFAULT 0,
  milestones_unlocked_count INTEGER NOT NULL DEFAULT 0,
  recent_performance TEXT NOT NULL DEFAULT '[]',
  last_trained_at TEXT,
  trend TEXT NOT NULL DEFAULT 'NEW',
  xp_to_next_level INTEGER NOT NULL DEFAULT 100,
  best_distance_meters REAL DEFAULT 0.0,
  best_duration_seconds INTEGER DEFAULT 0,
  best_pace_seconds_per_km REAL DEFAULT 0.0,
  total_distance_meters REAL DEFAULT 0.0,
  total_duration_seconds INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (exercise_id) REFERENCES exercise_catalog (id) ON DELETE CASCADE,
  UNIQUE(user_id, exercise_id)
);

CREATE INDEX IF NOT EXISTS idx_exercise_mastery_user_ex ON exercise_mastery (user_id, exercise_id);

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

CREATE TABLE IF NOT EXISTS exercise_milestones (
  id TEXT PRIMARY KEY,
  exercise_id TEXT NOT NULL,
  metric TEXT NOT NULL, -- BEST_E1RM, BEST_WEIGHT, TOTAL_VOLUME, SESSION_COUNT
  threshold REAL NOT NULL,
  reward_xp INTEGER NOT NULL DEFAULT 100,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (exercise_id) REFERENCES exercise_catalog (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_exercise_milestones_ex ON exercise_milestones (exercise_id);

CREATE TABLE IF NOT EXISTS user_exercise_milestones (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  milestone_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (milestone_id) REFERENCES exercise_milestones (id) ON DELETE CASCADE,
  UNIQUE(user_id, milestone_id)
);

CREATE INDEX IF NOT EXISTS idx_user_exercise_milestones_user ON user_exercise_milestones (user_id, exercise_id);

CREATE TABLE IF NOT EXISTS xp_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exercise_id TEXT,
  xp_type TEXT NOT NULL DEFAULT 'PLAYER',
  source_type TEXT NOT NULL,
  source_id TEXT,
  amount INTEGER NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, source_type, source_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_transactions_unique 
  ON xp_transactions (user_id, source_type, source_id);

CREATE TABLE IF NOT EXISTS local_sync_queue (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT NOT NULL,
  client_timestamp INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at INTEGER,
  last_error TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status_ts 
  ON local_sync_queue (status, client_timestamp ASC);

CREATE INDEX IF NOT EXISTS idx_sync_queue_retry 
  ON local_sync_queue (status, next_retry_at);

CREATE TABLE IF NOT EXISTS quests (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  target_value REAL NOT NULL,
  unit TEXT NOT NULL,
  xp_reward INTEGER NOT NULL,
  badge_variant TEXT NOT NULL DEFAULT 'cyan',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_quests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  current_progress REAL NOT NULL DEFAULT 0.0,
  target_value REAL NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  last_reset_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (quest_id) REFERENCES quests (id) ON DELETE CASCADE,
  UNIQUE(user_id, quest_id)
);

CREATE INDEX IF NOT EXISTS idx_user_quests_user ON user_quests (user_id);

CREATE TABLE IF NOT EXISTS user_achievements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements (user_id);

CREATE TABLE IF NOT EXISTS nutrition_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL, -- YYYY-MM-DD
  calories INTEGER DEFAULT 0,
  protein_g REAL DEFAULT 0.0,
  carbs_g REAL DEFAULT 0.0,
  fat_g REAL DEFAULT 0.0,
  water_ml INTEGER DEFAULT 0,
  bodyweight_kg REAL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_nutrition_logs_user_date ON nutrition_logs (user_id, date DESC);

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

CREATE INDEX IF NOT EXISTS idx_workout_templates_user ON workout_templates (user_id);

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
  created_at TEXT NOT NULL,
  FOREIGN KEY (template_id) REFERENCES workout_templates (id) ON DELETE CASCADE,
  FOREIGN KEY (exercise_id) REFERENCES exercise_catalog (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_workout_template_ex_template ON workout_template_exercises (template_id, order_index);

CREATE TABLE IF NOT EXISTS friendships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE,
  FOREIGN KEY (friend_id) REFERENCES profiles (id) ON DELETE CASCADE,
  UNIQUE(user_id, friend_id),
  CHECK (user_id != friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships (user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships (friend_id);

CREATE TABLE IF NOT EXISTS friend_requests (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (sender_id) REFERENCES profiles (id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES profiles (id) ON DELETE CASCADE,
  CHECK (sender_id != receiver_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver ON friend_requests (receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender ON friend_requests (sender_id, status);

CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY,
  blocker_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (blocker_id) REFERENCES profiles (id) ON DELETE CASCADE,
  FOREIGN KEY (blocked_id) REFERENCES profiles (id) ON DELETE CASCADE,
  UNIQUE(blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON blocks (blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks (blocked_id);

CREATE TABLE IF NOT EXISTS activity_feed (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  visibility TEXT NOT NULL DEFAULT 'FRIENDS',
  likes_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_activity_feed_user ON activity_feed (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_feed_visibility ON activity_feed (visibility, created_at DESC);

CREATE TABLE IF NOT EXISTS activity_reactions (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reaction_type TEXT NOT NULL DEFAULT 'LIKE',
  created_at TEXT NOT NULL,
  FOREIGN KEY (activity_id) REFERENCES activity_feed (id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE,
  UNIQUE(activity_id, user_id, reaction_type)
);

CREATE INDEX IF NOT EXISTS idx_activity_reactions_activity ON activity_reactions (activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_reactions_user ON activity_reactions (user_id);

CREATE TABLE IF NOT EXISTS privacy_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  profile_visibility TEXT NOT NULL DEFAULT 'FRIENDS',
  feed_visibility_default TEXT NOT NULL DEFAULT 'FRIENDS',
  show_workouts_in_feed INTEGER NOT NULL DEFAULT 1,
  show_prs_in_feed INTEGER NOT NULL DEFAULT 1,
  show_level_ups_in_feed INTEGER NOT NULL DEFAULT 1,
  show_rank_ups_in_feed INTEGER NOT NULL DEFAULT 1,
  show_achievements_in_feed INTEGER NOT NULL DEFAULT 1,
  show_challenges_in_feed INTEGER NOT NULL DEFAULT 1,
  show_evolution_in_feed INTEGER NOT NULL DEFAULT 1,
  allow_friend_requests INTEGER NOT NULL DEFAULT 1,
  show_mastery_on_profile INTEGER NOT NULL DEFAULT 1,
  show_achievements_on_profile INTEGER NOT NULL DEFAULT 1,
  show_streak_on_profile INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL,
  metric TEXT NOT NULL,
  target REAL NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'PUBLIC',
  created_by TEXT NOT NULL DEFAULT 'SYSTEM',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  config TEXT NOT NULL DEFAULT '{}',
  reward_xp INTEGER NOT NULL DEFAULT 250,
  reward_title_id TEXT,
  reward_title_name TEXT,
  reward_badge TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_challenges_status_window ON challenges (status, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_challenges_visibility ON challenges (visibility, created_by);

CREATE TABLE IF NOT EXISTS challenge_participants (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  progress REAL NOT NULL DEFAULT 0.0,
  rank INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  joined_at TEXT NOT NULL,
  completed_at TEXT,
  last_updated_at TEXT NOT NULL,
  FOREIGN KEY (challenge_id) REFERENCES challenges (id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE,
  UNIQUE(challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_challenge_participants_challenge ON challenge_participants (challenge_id, status, progress DESC);
CREATE INDEX IF NOT EXISTS idx_challenge_participants_user ON challenge_participants (user_id, status);

CREATE TABLE IF NOT EXISTS challenge_events (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  contribution_value REAL NOT NULL,
  processed_at TEXT NOT NULL,
  FOREIGN KEY (challenge_id) REFERENCES challenges (id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE,
  UNIQUE(challenge_id, user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_challenge_events_dedup ON challenge_events (challenge_id, user_id, event_id);

CREATE TABLE IF NOT EXISTS health_records (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  source_client TEXT NOT NULL,
  external_id TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  is_deduplicated INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_health_records_user_type ON health_records (user_id, record_type, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_health_records_external ON health_records (user_id, external_id);

CREATE TABLE IF NOT EXISTS health_sync_state (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL UNIQUE,
  is_connected INTEGER NOT NULL DEFAULT 0,
  granted_permissions TEXT NOT NULL DEFAULT '[]',
  last_sync_time TEXT,
  sync_cursor TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_health_sync_state_user ON health_sync_state (user_id);

CREATE TABLE IF NOT EXISTS daily_step_summaries (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  today_steps INTEGER NOT NULL DEFAULT 0,
  step_goal INTEGER NOT NULL DEFAULT 10000,
  last_sensor_value REAL NOT NULL DEFAULT 0,
  baseline REAL NOT NULL DEFAULT 0,
  last_updated_at TEXT NOT NULL,
  synced_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE,
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_step_summaries_user_date ON daily_step_summaries (user_id, date);
`;


