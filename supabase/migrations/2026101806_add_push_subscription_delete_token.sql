-- ==============================================================================
-- QA4-009: per-subscription delete token for /api/notifications/subscribe
--
-- The subscribe route issues a random delete token when a push subscription
-- is created and stores only its SHA-256 hash here. DELETE must present the
-- token (or a verified session matching user_id) before a row is removed,
-- so an unauthenticated stranger can no longer delete arbitrary
-- subscriptions by endpoint alone. Legacy rows keep NULL here and are
-- issued a token on their next subscribe POST.
-- ==============================================================================
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS delete_token_hash TEXT;
