-- ==============================================================================
-- ASCEND SYNC, IDEMPOTENCY & MULTI-USER ISOLATION POLICIES
-- ==============================================================================

-- 1. Idempotency Constraint on XP Transactions
CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_transactions_unique 
  ON xp_transactions (user_id, source_type, source_id);

-- 2. Personal Records Security & High-Water Mark
ALTER TABLE personal_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only view own personal records"
  ON personal_records FOR SELECT
  USING (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = personal_records.user_id));

CREATE POLICY "Users can only insert own personal records"
  ON personal_records FOR INSERT
  WITH CHECK (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = personal_records.user_id));

CREATE POLICY "Users can only update own personal records"
  ON personal_records FOR UPDATE
  USING (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = personal_records.user_id));

-- 3. Exercise Mastery Security
ALTER TABLE exercise_mastery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only view own exercise mastery"
  ON exercise_mastery FOR SELECT
  USING (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = exercise_mastery.user_id));

CREATE POLICY "Users can only insert own exercise mastery"
  ON exercise_mastery FOR INSERT
  WITH CHECK (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = exercise_mastery.user_id));

CREATE POLICY "Users can only update own exercise mastery"
  ON exercise_mastery FOR UPDATE
  USING (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = exercise_mastery.user_id));

-- 4. XP Transactions Security
ALTER TABLE xp_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only view own xp transactions"
  ON xp_transactions FOR SELECT
  USING (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = xp_transactions.user_id));

CREATE POLICY "Users can only insert own xp transactions"
  ON xp_transactions FOR INSERT
  WITH CHECK (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = xp_transactions.user_id));
