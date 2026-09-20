-- ==============================================================================
-- ASCEND SOCIAL LAYER & PRIVACY ARCHITECTURE MIGRATION
-- Multi-user isolation, zero health data leakage, athletic-centered social.
-- ==============================================================================

-- 1. Profiles Enhancements: Friend Code
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS friend_code TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_profiles_friend_code ON profiles (friend_code);

-- 2. Friendships Table (Bilateral Mutual Connections)
CREATE TABLE IF NOT EXISTS friendships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  friend_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, friend_id),
  CHECK (user_id != friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships (user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships (friend_id);

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own friendships"
  ON friendships FOR SELECT
  USING (
    auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = friendships.user_id)
    OR auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = friendships.friend_id)
  );

CREATE POLICY "Users can insert their own friendships"
  ON friendships FOR INSERT
  WITH CHECK (
    auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = friendships.user_id)
  );

CREATE POLICY "Users can remove their own friendships"
  ON friendships FOR DELETE
  USING (
    auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = friendships.user_id)
    OR auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = friendships.friend_id)
  );

-- 3. Friend Requests Table (Handshake Protocol)
CREATE TABLE IF NOT EXISTS friend_requests (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (sender_id != receiver_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver ON friend_requests (receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender ON friend_requests (sender_id, status);

ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view requests they sent or received"
  ON friend_requests FOR SELECT
  USING (
    auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = friend_requests.sender_id)
    OR auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = friend_requests.receiver_id)
  );

CREATE POLICY "Users can send friend requests"
  ON friend_requests FOR INSERT
  WITH CHECK (
    auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = friend_requests.sender_id)
    AND NOT EXISTS (
      SELECT 1 FROM blocks 
      WHERE (blocker_id = friend_requests.receiver_id AND blocked_id = friend_requests.sender_id)
         OR (blocker_id = friend_requests.sender_id AND blocked_id = friend_requests.receiver_id)
    )
  );

CREATE POLICY "Users can update their received or sent requests"
  ON friend_requests FOR UPDATE
  USING (
    auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = friend_requests.receiver_id)
    OR auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = friend_requests.sender_id)
  );

CREATE POLICY "Users can delete their requests"
  ON friend_requests FOR DELETE
  USING (
    auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = friend_requests.sender_id)
    OR auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = friend_requests.receiver_id)
  );

-- 4. Blocks Table (Tactical Moderation)
CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY,
  blocker_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON blocks (blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks (blocked_id);

ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own block list"
  ON blocks FOR SELECT
  USING (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = blocks.blocker_id));

CREATE POLICY "Users can block other users"
  ON blocks FOR INSERT
  WITH CHECK (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = blocks.blocker_id));

CREATE POLICY "Users can unblock users"
  ON blocks FOR DELETE
  USING (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = blocks.blocker_id));

-- 5. Activity Feed Table (Athletic Event Log)
CREATE TABLE IF NOT EXISTS activity_feed (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- WORKOUT_COMPLETED, PR_ACHIEVED, LEVEL_UP, RANK_UP, ACHIEVEMENT_UNLOCKED, CHALLENGE_COMPLETED, CHARACTER_EVOLUTION
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  visibility TEXT NOT NULL DEFAULT 'FRIENDS', -- PUBLIC, FRIENDS, PRIVATE
  likes_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_feed_user ON activity_feed (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_feed_visibility ON activity_feed (visibility, created_at DESC);

ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view permissible activity feed items"
  ON activity_feed FOR SELECT
  USING (
    -- Author can always view own items
    auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = activity_feed.user_id)
    OR (
      -- Not blocked by either party
      NOT EXISTS (
        SELECT 1 FROM blocks 
        WHERE (blocker_id = activity_feed.user_id AND blocked_id = (SELECT id FROM profiles WHERE auth_id = auth.uid()::text))
           OR (blocker_id = (SELECT id FROM profiles WHERE auth_id = auth.uid()::text) AND blocked_id = activity_feed.user_id)
      )
      AND (
        -- Public post
        activity_feed.visibility = 'PUBLIC'
        OR (
          -- Friends post and mutual friendship exists
          activity_feed.visibility = 'FRIENDS'
          AND EXISTS (
            SELECT 1 FROM friendships
            WHERE user_id = activity_feed.user_id
              AND friend_id = (SELECT id FROM profiles WHERE auth_id = auth.uid()::text)
          )
        )
      )
    )
  );

CREATE POLICY "Users can insert their own feed activities"
  ON activity_feed FOR INSERT
  WITH CHECK (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = activity_feed.user_id));

CREATE POLICY "Users can update their own feed activities"
  ON activity_feed FOR UPDATE
  USING (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = activity_feed.user_id));

CREATE POLICY "Users can delete their own feed activities"
  ON activity_feed FOR DELETE
  USING (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = activity_feed.user_id));

-- 6. Activity Reactions Table (Lightweight Athletic Kudos)
CREATE TABLE IF NOT EXISTS activity_reactions (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES activity_feed(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL DEFAULT 'LIKE', -- LIKE, FIRE, RESPECT, WARRIOR, LIGHTNING, STRENGTH
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(activity_id, user_id, reaction_type)
);

CREATE INDEX IF NOT EXISTS idx_activity_reactions_activity ON activity_reactions (activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_reactions_user ON activity_reactions (user_id);

ALTER TABLE activity_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reactions on accessible activities"
  ON activity_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM activity_feed af
      WHERE af.id = activity_reactions.activity_id
    )
  );

CREATE POLICY "Users can react to accessible activities"
  ON activity_reactions FOR INSERT
  WITH CHECK (
    auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = activity_reactions.user_id)
    AND NOT EXISTS (
      SELECT 1 FROM activity_feed af
      JOIN blocks b ON (
        (b.blocker_id = af.user_id AND b.blocked_id = activity_reactions.user_id)
        OR (b.blocker_id = activity_reactions.user_id AND b.blocked_id = af.user_id)
      )
      WHERE af.id = activity_reactions.activity_id
    )
  );

CREATE POLICY "Users can remove their own reactions"
  ON activity_reactions FOR DELETE
  USING (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = activity_reactions.user_id));

-- 7. Privacy Settings Table (Granular Broadcast Controls)
ALTER TABLE privacy_settings
  ALTER COLUMN show_workouts_in_feed DROP DEFAULT,
  ALTER COLUMN show_prs_in_feed DROP DEFAULT,
  ALTER COLUMN show_level_ups_in_feed DROP DEFAULT,
  ALTER COLUMN show_rank_ups_in_feed DROP DEFAULT,
  ALTER COLUMN show_achievements_in_feed DROP DEFAULT,
  ALTER COLUMN show_challenges_in_feed DROP DEFAULT,
  ALTER COLUMN show_evolution_in_feed DROP DEFAULT,
  ALTER COLUMN allow_friend_requests DROP DEFAULT,
  ALTER COLUMN show_mastery_on_profile DROP DEFAULT,
  ALTER COLUMN show_achievements_on_profile DROP DEFAULT,
  ALTER COLUMN show_streak_on_profile DROP DEFAULT;

ALTER TABLE privacy_settings
  ALTER COLUMN show_workouts_in_feed TYPE BOOLEAN USING (show_workouts_in_feed != 0),
  ALTER COLUMN show_prs_in_feed TYPE BOOLEAN USING (show_prs_in_feed != 0),
  ALTER COLUMN show_level_ups_in_feed TYPE BOOLEAN USING (show_level_ups_in_feed != 0),
  ALTER COLUMN show_rank_ups_in_feed TYPE BOOLEAN USING (show_rank_ups_in_feed != 0),
  ALTER COLUMN show_achievements_in_feed TYPE BOOLEAN USING (show_achievements_in_feed != 0),
  ALTER COLUMN show_challenges_in_feed TYPE BOOLEAN USING (show_challenges_in_feed != 0),
  ALTER COLUMN show_evolution_in_feed TYPE BOOLEAN USING (show_evolution_in_feed != 0),
  ALTER COLUMN allow_friend_requests TYPE BOOLEAN USING (allow_friend_requests != 0),
  ALTER COLUMN show_mastery_on_profile TYPE BOOLEAN USING (show_mastery_on_profile != 0),
  ALTER COLUMN show_achievements_on_profile TYPE BOOLEAN USING (show_achievements_on_profile != 0),
  ALTER COLUMN show_streak_on_profile TYPE BOOLEAN USING (show_streak_on_profile != 0);

ALTER TABLE privacy_settings
  ALTER COLUMN show_workouts_in_feed SET DEFAULT TRUE,
  ALTER COLUMN show_prs_in_feed SET DEFAULT TRUE,
  ALTER COLUMN show_level_ups_in_feed SET DEFAULT TRUE,
  ALTER COLUMN show_rank_ups_in_feed SET DEFAULT TRUE,
  ALTER COLUMN show_achievements_in_feed SET DEFAULT TRUE,
  ALTER COLUMN show_challenges_in_feed SET DEFAULT TRUE,
  ALTER COLUMN show_evolution_in_feed SET DEFAULT TRUE,
  ALTER COLUMN allow_friend_requests SET DEFAULT TRUE,
  ALTER COLUMN show_mastery_on_profile SET DEFAULT TRUE,
  ALTER COLUMN show_achievements_on_profile SET DEFAULT TRUE,
  ALTER COLUMN show_streak_on_profile SET DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS privacy_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  profile_visibility TEXT NOT NULL DEFAULT 'FRIENDS', -- PUBLIC, FRIENDS, PRIVATE
  feed_visibility_default TEXT NOT NULL DEFAULT 'FRIENDS', -- PUBLIC, FRIENDS, PRIVATE
  show_workouts_in_feed BOOLEAN NOT NULL DEFAULT TRUE,
  show_prs_in_feed BOOLEAN NOT NULL DEFAULT TRUE,
  show_level_ups_in_feed BOOLEAN NOT NULL DEFAULT TRUE,
  show_rank_ups_in_feed BOOLEAN NOT NULL DEFAULT TRUE,
  show_achievements_in_feed BOOLEAN NOT NULL DEFAULT TRUE,
  show_challenges_in_feed BOOLEAN NOT NULL DEFAULT TRUE,
  show_evolution_in_feed BOOLEAN NOT NULL DEFAULT TRUE,
  allow_friend_requests BOOLEAN NOT NULL DEFAULT TRUE,
  show_mastery_on_profile BOOLEAN NOT NULL DEFAULT TRUE,
  show_achievements_on_profile BOOLEAN NOT NULL DEFAULT TRUE,
  show_streak_on_profile BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE privacy_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own privacy settings"
  ON privacy_settings FOR SELECT
  USING (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = privacy_settings.user_id));

CREATE POLICY "Users can insert own privacy settings"
  ON privacy_settings FOR INSERT
  WITH CHECK (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = privacy_settings.user_id));

CREATE POLICY "Users can update own privacy settings"
  ON privacy_settings FOR UPDATE
  USING (auth.uid()::text = (SELECT auth_id FROM profiles WHERE id = privacy_settings.user_id));

-- 8. Public Operative Profile Projection (Zero Biometric Leakage View)
CREATE OR REPLACE VIEW public_profiles WITH (security_barrier = true) AS
SELECT
  p.id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.friend_code,
  p.global_level,
  p.rank_tier,
  p.rank_division,
  p.current_streak,
  p.created_at
FROM profiles p;

GRANT SELECT ON public_profiles TO authenticated;
