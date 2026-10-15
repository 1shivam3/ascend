-- ==============================================================================
-- ASCEND STRENGTH & NUTRITION TRACKER - SUPABASE DATABASE SCHEMA
-- ==============================================================================
-- Paste this entire SQL into your Supabase Dashboard -> SQL Editor and tap RUN.
-- This sets up all tables, indexes, and Row Level Security (RLS).

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. User Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT 'male',
  bodyweight_kg NUMERIC(6, 2),
  bodyweight_lbs NUMERIC(6, 2),
  height_cm NUMERIC(5, 1),
  unit TEXT NOT NULL DEFAULT 'kg',
  goals TEXT[] DEFAULT ARRAY['build_muscle']::TEXT[],
  diet_preference TEXT DEFAULT 'non_vegetarian',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Personal Records (PRs) Table
CREATE TABLE IF NOT EXISTS public.personal_records (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise TEXT NOT NULL,
  weight_kg NUMERIC(6, 2) NOT NULL,
  weight_lbs NUMERIC(6, 2) NOT NULL,
  reps INTEGER NOT NULL,
  one_rep_max NUMERIC(6, 2) NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Workouts Table
CREATE TABLE IF NOT EXISTS public.workouts (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  date DATE NOT NULL,
  duration_minutes INTEGER,
  notes TEXT,
  exercises JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Meals Table
CREATE TABLE IF NOT EXISTS public.meals (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  foods JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Body Metrics (Weigh-ins & Measurements) Table
CREATE TABLE IF NOT EXISTS public.body_metrics (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  weight_kg NUMERIC(6, 2) NOT NULL,
  height_cm NUMERIC(5, 1),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Daily Habits (Water, Creatine, Gym attendance) Table
CREATE TABLE IF NOT EXISTS public.daily_habits (
  id TEXT PRIMARY KEY, -- formatted as {user_id}_{date}
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  water_ml INTEGER DEFAULT 0,
  creatine_taken BOOLEAN DEFAULT false,
  creatine_grams NUMERIC(4, 1) DEFAULT 0,
  gym_attended BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Planned Workouts (Workout Routines & Templates) Table
CREATE TABLE IF NOT EXISTS public.planned_workouts (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  exercises JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Custom Barcodes Table
CREATE TABLE IF NOT EXISTS public.custom_barcodes (
  id TEXT PRIMARY KEY, -- clean numeric barcode string
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- INDEXES FOR HIGH-SPEED TIME-SERIES QUERIES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_prs_user_exercise ON public.personal_records(user_id, exercise);
CREATE INDEX IF NOT EXISTS idx_prs_user_date ON public.personal_records(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_workouts_user_date ON public.workouts(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_meals_user_date ON public.meals(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_body_metrics_user_date ON public.body_metrics(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_habits_user_date ON public.daily_habits(user_id, date);
CREATE INDEX IF NOT EXISTS idx_planned_workouts_user ON public.planned_workouts(user_id);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
-- Athletes can ONLY read, insert, update, and delete their own data.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planned_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_barcodes ENABLE ROW LEVEL SECURITY;

-- Profiles Policy
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own profile" ON public.profiles;
  CREATE POLICY "Users can manage own profile" ON public.profiles
    FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
END $$;

-- Personal Records Policy
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own PRs" ON public.personal_records;
  CREATE POLICY "Users can manage own PRs" ON public.personal_records
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

-- Workouts Policy
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own workouts" ON public.workouts;
  CREATE POLICY "Users can manage own workouts" ON public.workouts
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

-- Meals Policy
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own meals" ON public.meals;
  CREATE POLICY "Users can manage own meals" ON public.meals
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

-- Body Metrics Policy
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own body metrics" ON public.body_metrics;
  CREATE POLICY "Users can manage own body metrics" ON public.body_metrics
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

-- Daily Habits Policy
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own daily habits" ON public.daily_habits;
  CREATE POLICY "Users can manage own daily habits" ON public.daily_habits
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

-- Planned Workouts Policy
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own planned workouts" ON public.planned_workouts;
  CREATE POLICY "Users can manage own planned workouts" ON public.planned_workouts
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

-- Custom Barcodes Policy
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own custom barcodes" ON public.custom_barcodes;
  CREATE POLICY "Users can manage own custom barcodes" ON public.custom_barcodes
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

-- 10. Private User Feedback & Bug Reports Table
CREATE TABLE IF NOT EXISTS public.user_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL CHECK (category IN ('bug', 'feature', 'review', 'general')),
  rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  title TEXT,
  message TEXT NOT NULL,
  user_name TEXT,
  user_email TEXT,
  diagnostics JSONB DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'in_progress', 'resolved', 'closed')),
  email_delivered BOOLEAN DEFAULT false,
  email_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Allow public feedback submissions" ON public.user_feedback;
  CREATE POLICY "Allow public feedback submissions" ON public.user_feedback
    FOR INSERT TO anon, authenticated WITH CHECK (true);
END $$;


-- 11. Push Subscriptions Table (Web Push Infrastructure)
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

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_updated ON public.push_subscriptions(updated_at DESC);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Allow athletes and guests to manage push subscriptions" ON public.push_subscriptions;
  CREATE POLICY "Allow athletes and guests to manage push subscriptions" ON public.push_subscriptions
    FOR ALL TO anon, authenticated
    USING (user_id IS NULL OR auth.uid() = user_id)
    WITH CHECK (user_id IS NULL OR auth.uid() = user_id);
END $$;

-- 12. Notification Preferences Table (Reminder Center Settings)
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Athletes can manage own notification preferences" ON public.notification_preferences;
  CREATE POLICY "Athletes can manage own notification preferences" ON public.notification_preferences
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
END $$;


-- ==============================================================================
-- SECURITY HARDENING & LINTER RESOLUTIONS
-- ==============================================================================
-- Revoke execution of any administrative SECURITY DEFINER functions from anon/authenticated
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rls_auto_enable' AND pronamespace = 'public'::regnamespace) THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
