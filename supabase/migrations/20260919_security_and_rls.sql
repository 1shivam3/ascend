-- ==============================================================================
-- ASCEND SECURITY & ROW LEVEL SECURITY (RLS) POLICIES
-- Multi-user isolation, zero health data leakage, opt-in leaderboard projection.
-- ==============================================================================

-- 1. Profiles Table Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid()::text = auth_id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid()::text = auth_id)
  WITH CHECK (auth.uid()::text = auth_id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid()::text = auth_id);

-- 2. Workouts Table Security (Strictly Private)
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only view own workouts"
  ON workouts FOR SELECT
  USING (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = workouts.user_id));

CREATE POLICY "Users can only insert own workouts"
  ON workouts FOR INSERT
  WITH CHECK (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = workouts.user_id));

CREATE POLICY "Users can only update own workouts"
  ON workouts FOR UPDATE
  USING (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = workouts.user_id));

-- 3. Exercise Logs & Set Logs Security (Strictly Private)
ALTER TABLE exercise_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only view own exercise logs"
  ON exercise_logs FOR SELECT
  USING (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = exercise_logs.user_id));

ALTER TABLE set_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only view own set logs"
  ON set_logs FOR SELECT
  USING (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = set_logs.user_id));

-- 4. Nutrition Logs Security (Strictly Private - ZERO public access)
ALTER TABLE nutrition_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only view own nutrition logs"
  ON nutrition_logs FOR SELECT
  USING (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = nutrition_logs.user_id));

CREATE POLICY "Users can only insert own nutrition logs"
  ON nutrition_logs FOR INSERT
  WITH CHECK (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = nutrition_logs.user_id));

CREATE POLICY "Users can only update own nutrition logs"
  ON nutrition_logs FOR UPDATE
  USING (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = nutrition_logs.user_id));

-- 5. User Achievements & Quests (Strictly Private)
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only view own achievements"
  ON user_achievements FOR SELECT
  USING (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = user_achievements.user_id));

ALTER TABLE user_quests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only view own quests"
  ON user_quests FOR SELECT
  USING (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = user_quests.user_id));

-- 6. Workout Plans (Strictly Private)
ALTER TABLE workout_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only view own workout plans"
  ON workout_plans FOR SELECT
  USING (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = workout_plans.user_id));

-- ==============================================================================
-- 7. MINIMAL PUBLIC LEADERBOARD VIEW
-- Exposes ONLY opt-in users with minimal non-sensitive identifiers.
-- Strictly excludes: age, height, weight, notes, medical restrictions, set logs.
-- ==============================================================================

CREATE OR REPLACE VIEW public_leaderboard WITH (security_barrier = true) AS
SELECT
  p.id,
  p.display_name,
  p.avatar_url,
  p.global_level,
  p.rank_tier,
  p.rank_division,
  COALESCE(
    (
      SELECT SUM(xt.amount)
      FROM xp_transactions xt
      WHERE xt.user_id = p.id
        AND xt.created_at >= date_trunc('week', NOW())
    ),
    0
  )::integer AS weekly_xp
FROM profiles p
WHERE p.leaderboard_opt_in = 1;

-- Grant read access on public_leaderboard to authenticated users
GRANT SELECT ON public_leaderboard TO authenticated;
