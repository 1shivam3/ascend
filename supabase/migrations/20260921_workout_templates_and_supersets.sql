-- ==============================================================================
-- ASCEND WORKOUT TEMPLATES, PRESETS & SUPERSET SCHEMA & RLS POLICIES
-- ==============================================================================

-- 1. Add superset_id to exercise_logs for interleaved superset tracking
ALTER TABLE exercise_logs
  ADD COLUMN IF NOT EXISTS superset_id TEXT;

CREATE INDEX IF NOT EXISTS idx_exercise_logs_superset ON exercise_logs (superset_id);

-- 2. Workout Templates Table
ALTER TABLE workout_templates ALTER COLUMN is_preset DROP DEFAULT;
ALTER TABLE workout_templates ALTER COLUMN is_preset TYPE BOOLEAN USING (is_preset != 0);
ALTER TABLE workout_templates ALTER COLUMN is_preset SET DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS workout_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  split_type TEXT NOT NULL DEFAULT 'CUSTOM',
  folder TEXT,
  is_preset BOOLEAN NOT NULL DEFAULT FALSE,
  estimated_duration_min INTEGER NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workout_templates_user ON workout_templates (user_id);
CREATE INDEX IF NOT EXISTS idx_workout_templates_preset ON workout_templates (is_preset);

ALTER TABLE workout_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workout_templates
CREATE POLICY "Users can view their own templates and system presets"
  ON workout_templates FOR SELECT
  TO authenticated, anon
  USING (is_preset = true OR auth.uid()::text = user_id);

CREATE POLICY "Users can create their own templates"
  ON workout_templates FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id AND is_preset = false);

CREATE POLICY "Users can update their own templates"
  ON workout_templates FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id AND is_preset = false)
  WITH CHECK (auth.uid()::text = user_id AND is_preset = false);

CREATE POLICY "Users can delete their own templates"
  ON workout_templates FOR DELETE
  TO authenticated
  USING (auth.uid()::text = user_id AND is_preset = false);

-- 3. Workout Template Exercises
CREATE TABLE IF NOT EXISTS workout_template_exercises (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercise_catalog(id) ON DELETE RESTRICT,
  order_index INTEGER NOT NULL DEFAULT 0,
  target_sets INTEGER NOT NULL DEFAULT 3,
  target_reps TEXT NOT NULL DEFAULT '8-12',
  target_weight_kg NUMERIC,
  target_rpe NUMERIC,
  rest_seconds INTEGER NOT NULL DEFAULT 90,
  superset_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workout_template_ex_template ON workout_template_exercises (template_id, order_index);
CREATE INDEX IF NOT EXISTS idx_workout_template_ex_superset ON workout_template_exercises (superset_id);

ALTER TABLE workout_template_exercises ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workout_template_exercises
CREATE POLICY "Users can view exercises of accessible templates"
  ON workout_template_exercises FOR SELECT
  TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM workout_templates wt
      WHERE wt.id = workout_template_exercises.template_id
      AND (wt.is_preset = true OR wt.user_id = auth.uid()::text)
    )
  );

CREATE POLICY "Users can insert exercises into their own templates"
  ON workout_template_exercises FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workout_templates wt
      WHERE wt.id = workout_template_exercises.template_id
      AND wt.user_id = auth.uid()::text
      AND wt.is_preset = false
    )
  );

CREATE POLICY "Users can update exercises in their own templates"
  ON workout_template_exercises FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workout_templates wt
      WHERE wt.id = workout_template_exercises.template_id
      AND wt.user_id = auth.uid()::text
      AND wt.is_preset = false
    )
  );

CREATE POLICY "Users can delete exercises from their own templates"
  ON workout_template_exercises FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workout_templates wt
      WHERE wt.id = workout_template_exercises.template_id
      AND wt.user_id = auth.uid()::text
      AND wt.is_preset = false
    )
  );
