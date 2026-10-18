-- ==============================================================================
-- ASCEND STRENGTH & NUTRITION — LEAST-PRIVILEGE ROLE PRIVILEGES ENFORCEMENT
-- ==============================================================================
-- Migration: 2026101805_enforce_least_privilege_grants
-- Purpose:
--   1. Strips residual TRUNCATE, REFERENCES, and TRIGGER privileges from service_role
--      and authenticated across all infrastructure tables.
--   2. Grants strictly required CRUD operations demonstrated by server-side routes:
--      - push_subscriptions: SELECT, INSERT, UPDATE, DELETE (for /api/notifications/subscribe, /dispatch)
--      - user_feedback: SELECT, INSERT, UPDATE (for /api/feedback ingestion & email status)
--      - notification_deliveries: SELECT, INSERT, UPDATE (for /api/notifications/dispatch)
--      - api_rate_limits: SELECT, INSERT, UPDATE, DELETE (for rate limit enforcement & cleanup)
--      - consumed_deletion_nonces: SELECT, INSERT, UPDATE, DELETE (for /api/auth/delete-account)
--   3. Confirms that anon has ZERO direct table privileges across all security infrastructure tables.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PUSH SUBSCRIPTIONS
-- ------------------------------------------------------------------------------
-- Web push operations are mediated strictly by the server-side /api/notifications/subscribe
-- and /dispatch endpoints using service_role. Direct client access (anon and authenticated)
-- is revoked entirely to guarantee cross-guest and user isolation.
REVOKE ALL ON TABLE public.push_subscriptions FROM PUBLIC;
REVOKE ALL ON TABLE public.push_subscriptions FROM anon;
REVOKE ALL ON TABLE public.push_subscriptions FROM authenticated;
REVOKE ALL ON TABLE public.push_subscriptions FROM service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_subscriptions TO service_role;


-- ------------------------------------------------------------------------------
-- 2. USER FEEDBACK
-- ------------------------------------------------------------------------------
REVOKE ALL ON TABLE public.user_feedback FROM PUBLIC;
REVOKE ALL ON TABLE public.user_feedback FROM anon;
REVOKE ALL ON TABLE public.user_feedback FROM authenticated;
REVOKE ALL ON TABLE public.user_feedback FROM service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.user_feedback TO service_role;


-- ------------------------------------------------------------------------------
-- 3. NOTIFICATION DELIVERIES
-- ------------------------------------------------------------------------------
-- Delivery records and idempotency claims are internal backend state used by
-- /api/notifications/dispatch and /api/auth/delete-account. Direct client access
-- (anon and authenticated) is revoked entirely.
REVOKE ALL ON TABLE public.notification_deliveries FROM PUBLIC;
REVOKE ALL ON TABLE public.notification_deliveries FROM anon;
REVOKE ALL ON TABLE public.notification_deliveries FROM authenticated;
REVOKE ALL ON TABLE public.notification_deliveries FROM service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_deliveries TO service_role;


-- ------------------------------------------------------------------------------
-- 4. API RATE LIMITS
-- ------------------------------------------------------------------------------
REVOKE ALL ON TABLE public.api_rate_limits FROM PUBLIC;
REVOKE ALL ON TABLE public.api_rate_limits FROM anon;
REVOKE ALL ON TABLE public.api_rate_limits FROM authenticated;
REVOKE ALL ON TABLE public.api_rate_limits FROM service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.api_rate_limits TO service_role;


-- ------------------------------------------------------------------------------
-- 5. CONSUMED DELETION NONCES
-- ------------------------------------------------------------------------------
REVOKE ALL ON TABLE public.consumed_deletion_nonces FROM PUBLIC;
REVOKE ALL ON TABLE public.consumed_deletion_nonces FROM anon;
REVOKE ALL ON TABLE public.consumed_deletion_nonces FROM authenticated;
REVOKE ALL ON TABLE public.consumed_deletion_nonces FROM service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.consumed_deletion_nonces TO service_role;
