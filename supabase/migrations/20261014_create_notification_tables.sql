-- ==============================================================================
-- ASCEND STRENGTH & NUTRITION - NOTIFICATION INFRASTRUCTURE MIGRATION
-- ==============================================================================
-- Migration adding Web Push subscriptions and user notification preferences tables.
-- Used by /api/notifications/subscribe, /preferences, and /dispatch.
-- Protected by Row Level Security (RLS) with cascade deletion on user removal.

-- 1. Push Subscriptions Table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for high-speed queries by user and date
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_updated ON public.push_subscriptions(updated_at DESC);

-- Enable Row Level Security
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Subscriptions RLS Policy
-- Authenticated users can manage their subscriptions; anon users can insert device subscriptions in guest mode
DO $$ BEGIN
  DROP POLICY IF EXISTS "Allow athletes and guests to manage push subscriptions" ON public.push_subscriptions;
  CREATE POLICY "Allow athletes and guests to manage push subscriptions" ON public.push_subscriptions
    FOR ALL TO anon, authenticated
    USING (user_id IS NULL OR auth.uid() = user_id)
    WITH CHECK (user_id IS NULL OR auth.uid() = user_id);
END $$;

-- 2. Notification Preferences Table
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Preferences RLS Policy
DO $$ BEGIN
  DROP POLICY IF EXISTS "Athletes can manage own notification preferences" ON public.notification_preferences;
  CREATE POLICY "Athletes can manage own notification preferences" ON public.notification_preferences
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
END $$;
