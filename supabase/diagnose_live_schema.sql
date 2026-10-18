-- ==============================================================================
-- ASCEND STRENGTH & NUTRITION TRACKER — READ-ONLY SCHEMA DIAGNOSTIC SCRIPT
-- ==============================================================================
-- Purpose: Safely inspects the target database schema without making ANY modifications.
-- Usage: Run this entire script in the Supabase SQL Editor.
-- Output: Reports existing tables, columns, constraints, RLS status, policies,
--         functions, and role privileges across the 'public' schema.
-- ==============================================================================

-- 1. Check which expected ASCEND tables exist in the public schema
SELECT 
  expected.table_name,
  CASE WHEN t.table_name IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END AS status,
  COALESCE(c.reltuples::bigint, 0) AS estimated_rows
FROM (
  VALUES 
    ('profiles'),
    ('personal_records'),
    ('workouts'),
    ('meals'),
    ('body_metrics'),
    ('daily_habits'),
    ('planned_workouts'),
    ('custom_barcodes'),
    ('user_feedback'),
    ('push_subscriptions'),
    ('notification_preferences'),
    ('notification_deliveries'),
    ('api_rate_limits'),
    ('consumed_deletion_nonces')
) AS expected(table_name)
LEFT JOIN information_schema.tables t 
  ON t.table_schema = 'public' AND t.table_name = expected.table_name
LEFT JOIN pg_class c 
  ON c.relname = expected.table_name AND c.relnamespace = 'public'::regnamespace
ORDER BY expected.table_name;

-- 2. Check for unexpected or legacy tables in the public schema (e.g. from older mobile prototypes)
SELECT 
  table_name,
  table_type
FROM information_schema.tables 
WHERE table_schema = 'public'
  AND table_name NOT IN (
    'profiles', 'personal_records', 'workouts', 'meals', 'body_metrics',
    'daily_habits', 'planned_workouts', 'custom_barcodes', 'user_feedback',
    'push_subscriptions', 'notification_preferences', 'notification_deliveries',
    'api_rate_limits', 'consumed_deletion_nonces', 'schema_migrations'
  )
ORDER BY table_name;

-- 3. Detailed column inspection for all existing ASCEND tables
SELECT 
  table_name,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'profiles', 'personal_records', 'workouts', 'meals', 'body_metrics',
    'daily_habits', 'planned_workouts', 'custom_barcodes', 'user_feedback',
    'push_subscriptions', 'notification_preferences', 'notification_deliveries',
    'api_rate_limits', 'consumed_deletion_nonces'
  )
ORDER BY table_name, ordinal_position;

-- 4. Check Primary Keys and Foreign Key Constraints
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
LEFT JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

-- 5. Row Level Security (RLS) status on all public tables
SELECT 
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;

-- 6. Active Row Level Security (RLS) policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 7. Stored procedures and functions security attributes
SELECT 
  p.proname AS function_name,
  pg_get_userbyid(p.proowner) AS function_owner,
  p.prosecdef AS is_security_definer,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'claim_notification_delivery',
    'ascend_check_rate_limit',
    'cleanup_expired_deletion_nonces'
  )
ORDER BY p.proname;

-- 8. Table-level permissions (Grants) for anon, authenticated, and service_role
SELECT 
  grantee,
  table_name,
  privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
  AND table_name IN (
    'profiles', 'personal_records', 'workouts', 'meals', 'body_metrics',
    'daily_habits', 'planned_workouts', 'custom_barcodes', 'user_feedback',
    'push_subscriptions', 'notification_preferences', 'notification_deliveries',
    'api_rate_limits', 'consumed_deletion_nonces'
  )
ORDER BY table_name, grantee, privilege_type;

-- 9. Function-level execution grants
SELECT 
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
    'claim_notification_delivery',
    'ascend_check_rate_limit',
    'cleanup_expired_deletion_nonces'
  )
ORDER BY routine_name, grantee;

-- 10. Applied Supabase Migrations History
SELECT 
  version, 
  name 
FROM supabase_migrations.schema_migrations 
ORDER BY version;

