-- ==============================================================================
-- ASCEND REUSABLE CHALLENGE ENGINE MIGRATION
-- Multi-metric challenges, deterministic scoring, deduplication & leaderboards.
-- ==============================================================================

-- 1. Challenges Table
CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL,
  metric TEXT NOT NULL,
  target NUMERIC NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'PUBLIC',
  created_by TEXT NOT NULL DEFAULT 'SYSTEM',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  reward_xp INTEGER NOT NULL DEFAULT 250,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_challenges_status_window ON challenges (status, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_challenges_visibility ON challenges (visibility, created_by);

ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;

-- Visibility policy:
-- 1. PUBLIC challenges are visible to all authenticated users.
-- 2. FRIENDS challenges are visible to friends of created_by (or created_by self).
-- 3. PRIVATE/GROUP challenges are visible to participants or creator.
CREATE POLICY "Users can view authorized challenges"
  ON challenges FOR SELECT
  USING (
    visibility = 'PUBLIC'
    OR created_by = 'SYSTEM'
    OR created_by IN (SELECT id FROM profiles WHERE auth_id = auth.uid()::text)
    OR (
      visibility = 'FRIENDS'
      AND created_by IN (
        SELECT friend_id FROM friendships 
        WHERE user_id IN (SELECT id FROM profiles WHERE auth_id = auth.uid()::text)
      )
    )
    OR (
      id IN (
        SELECT challenge_id FROM challenge_participants 
        WHERE user_id IN (SELECT id FROM profiles WHERE auth_id = auth.uid()::text)
          AND status != 'LEFT'
      )
    )
  );

CREATE POLICY "Users can create challenges"
  ON challenges FOR INSERT
  WITH CHECK (
    created_by IN (SELECT id FROM profiles WHERE auth_id = auth.uid()::text)
  );

CREATE POLICY "Creators can update their own challenges"
  ON challenges FOR UPDATE
  USING (
    created_by IN (SELECT id FROM profiles WHERE auth_id = auth.uid()::text)
  );

-- 2. Challenge Participants Table
CREATE TABLE IF NOT EXISTS challenge_participants (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  progress NUMERIC NOT NULL DEFAULT 0.0,
  rank INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_challenge_participants_challenge ON challenge_participants (challenge_id, status, progress DESC);
CREATE INDEX IF NOT EXISTS idx_challenge_participants_user ON challenge_participants (user_id, status);

ALTER TABLE challenge_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view participants of visible challenges"
  ON challenge_participants FOR SELECT
  USING (
    challenge_id IN (SELECT id FROM challenges)
  );

CREATE POLICY "Users can join challenges for themselves"
  ON challenge_participants FOR INSERT
  WITH CHECK (
    user_id IN (SELECT id FROM profiles WHERE auth_id = auth.uid()::text)
  );

CREATE POLICY "Users can update their own participation status"
  ON challenge_participants FOR UPDATE
  USING (
    user_id IN (SELECT id FROM profiles WHERE auth_id = auth.uid()::text)
  );

CREATE POLICY "Users can delete their own participation"
  ON challenge_participants FOR DELETE
  USING (
    user_id IN (SELECT id FROM profiles WHERE auth_id = auth.uid()::text)
  );

-- 3. Challenge Events Deduplication & Audit Table
CREATE TABLE IF NOT EXISTS challenge_events (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  contribution_value NUMERIC NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(challenge_id, user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_challenge_events_dedup ON challenge_events (challenge_id, user_id, event_id);

ALTER TABLE challenge_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own challenge events"
  ON challenge_events FOR SELECT
  USING (
    user_id IN (SELECT id FROM profiles WHERE auth_id = auth.uid()::text)
  );

CREATE POLICY "Users can insert their own challenge events"
  ON challenge_events FOR INSERT
  WITH CHECK (
    user_id IN (SELECT id FROM profiles WHERE auth_id = auth.uid()::text)
  );

-- 4. Privacy-Guarded Challenge Leaderboard View (Security Barrier)
-- Exposes ONLY public athletic telemetry (callsign, avatar, level, rank, progress).
-- Never exposes bodyweight, age, notes, or raw set logs.
CREATE OR REPLACE VIEW challenge_leaderboard_view WITH (security_barrier = true) AS
SELECT
  cp.id AS participant_id,
  cp.challenge_id,
  cp.user_id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.friend_code,
  p.global_level,
  p.rank_tier,
  p.rank_division,
  cp.progress,
  cp.rank,
  cp.status,
  cp.joined_at,
  cp.completed_at,
  cp.last_updated_at
FROM challenge_participants cp
JOIN profiles p ON cp.user_id = p.id
WHERE cp.status != 'LEFT'
  AND p.id NOT IN (
    -- Block filtering
    SELECT blocked_id FROM blocks WHERE blocker_id = cp.user_id
    UNION
    SELECT blocker_id FROM blocks WHERE blocked_id = cp.user_id
  );
