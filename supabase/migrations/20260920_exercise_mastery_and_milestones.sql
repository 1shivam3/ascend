-- ==============================================================================
-- ASCEND EXERCISE MASTERY, LIFT PROGRESSION & MILESTONES SCHEMA & RLS POLICIES
-- ==============================================================================

-- 1. Exercise Catalog Enhancements
ALTER TABLE exercise_catalog 
  ADD COLUMN IF NOT EXISTS progression_type TEXT NOT NULL DEFAULT 'BARBELL_COMPOUND',
  ADD COLUMN IF NOT EXISTS supports_1rm BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS supports_relative_strength BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_bodyweight BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_exercise_progression_type ON exercise_catalog (progression_type);

-- 2. Exercise Mastery Enhancements
ALTER TABLE exercise_mastery 
  ADD COLUMN IF NOT EXISTS rank TEXT NOT NULL DEFAULT 'E',
  ADD COLUMN IF NOT EXISTS relative_strength NUMERIC,
  ADD COLUMN IF NOT EXISTS personal_records_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS milestones_unlocked_count INTEGER NOT NULL DEFAULT 0;

-- 3. XP Transactions Separation (PLAYER vs EXERCISE)
ALTER TABLE xp_transactions 
  ADD COLUMN IF NOT EXISTS exercise_id TEXT,
  ADD COLUMN IF NOT EXISTS xp_type TEXT NOT NULL DEFAULT 'PLAYER';

-- 4. Exercise Milestones Definition Table
CREATE TABLE IF NOT EXISTS exercise_milestones (
  id TEXT PRIMARY KEY,
  exercise_id TEXT NOT NULL REFERENCES exercise_catalog(id) ON DELETE CASCADE,
  metric TEXT NOT NULL, -- BEST_E1RM, BEST_WEIGHT, TOTAL_VOLUME, SESSION_COUNT
  threshold NUMERIC NOT NULL,
  reward_xp INTEGER NOT NULL DEFAULT 100,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exercise_milestones_ex ON exercise_milestones (exercise_id);

ALTER TABLE exercise_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to exercise milestones"
  ON exercise_milestones FOR SELECT
  TO authenticated, anon
  USING (true);

-- 5. User Exercise Milestones (Unlocked Achievements)
CREATE TABLE IF NOT EXISTS user_exercise_milestones (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  milestone_id TEXT NOT NULL REFERENCES exercise_milestones(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercise_catalog(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, milestone_id)
);

CREATE INDEX IF NOT EXISTS idx_user_exercise_milestones_user ON user_exercise_milestones (user_id, exercise_id);

ALTER TABLE user_exercise_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only view own unlocked milestones"
  ON user_exercise_milestones FOR SELECT
  USING (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = user_exercise_milestones.user_id));

CREATE POLICY "Users can only insert own unlocked milestones"
  ON user_exercise_milestones FOR INSERT
  WITH CHECK (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = user_exercise_milestones.user_id));

CREATE POLICY "Users can only update own unlocked milestones"
  ON user_exercise_milestones FOR UPDATE
  USING (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = user_exercise_milestones.user_id));
