-- ==============================================================================
-- ASCEND ANDROID HEALTH CONNECT INTEGRATION MIGRATION
-- Offline-first health telemetry, deterministic deduplication & strict privacy.
-- ==============================================================================

-- 1. Health Records Table (Raw external metrics: steps, distance, cardio, weight, HR)
ALTER TABLE health_records ALTER COLUMN is_deduplicated DROP DEFAULT;
ALTER TABLE health_records ALTER COLUMN is_deduplicated TYPE BOOLEAN USING (is_deduplicated != 0);
ALTER TABLE health_records ALTER COLUMN is_deduplicated SET DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS health_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL,
  source_client TEXT NOT NULL,
  external_id TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  value NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_deduplicated BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_records_user_type_time 
  ON health_records (user_id, record_type, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_health_records_external 
  ON health_records (user_id, external_id);

ALTER TABLE health_records ENABLE ROW LEVEL SECURITY;

-- Strict User Isolation: ONLY the owner can read/write their health data.
-- Zero public or friend access is permitted under any circumstances.
CREATE POLICY "Users can only select their own health records"
  ON health_records FOR SELECT
  USING (
    user_id IN (SELECT id FROM profiles WHERE auth_id = auth.uid()::text)
  );

CREATE POLICY "Users can insert their own health records"
  ON health_records FOR INSERT
  WITH CHECK (
    user_id IN (SELECT id FROM profiles WHERE auth_id = auth.uid()::text)
  );

CREATE POLICY "Users can update their own health records"
  ON health_records FOR UPDATE
  USING (
    user_id IN (SELECT id FROM profiles WHERE auth_id = auth.uid()::text)
  );

CREATE POLICY "Users can delete their own health records"
  ON health_records FOR DELETE
  USING (
    user_id IN (SELECT id FROM profiles WHERE auth_id = auth.uid()::text)
  );


-- 2. Health Sync State Table (Per-user connection and permissions metadata)
ALTER TABLE health_sync_state ALTER COLUMN is_connected DROP DEFAULT;
ALTER TABLE health_sync_state ALTER COLUMN is_connected TYPE BOOLEAN USING (is_connected != 0);
ALTER TABLE health_sync_state ALTER COLUMN is_connected SET DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS health_sync_state (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  is_connected BOOLEAN NOT NULL DEFAULT FALSE,
  granted_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_sync_time TIMESTAMPTZ,
  sync_cursor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_sync_state_user ON health_sync_state (user_id);

ALTER TABLE health_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own health sync state"
  ON health_sync_state FOR SELECT
  USING (
    user_id IN (SELECT id FROM profiles WHERE auth_id = auth.uid()::text)
  );

CREATE POLICY "Users can insert their own health sync state"
  ON health_sync_state FOR INSERT
  WITH CHECK (
    user_id IN (SELECT id FROM profiles WHERE auth_id = auth.uid()::text)
  );

CREATE POLICY "Users can update their own health sync state"
  ON health_sync_state FOR UPDATE
  USING (
    user_id IN (SELECT id FROM profiles WHERE auth_id = auth.uid()::text)
  );
