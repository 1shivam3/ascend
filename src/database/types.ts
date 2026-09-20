export interface SqliteExerciseRow {
  id: string;
  name: string;
  slug: string;
  primary_muscle: string;
  secondary_muscles: string;
  equipment: string;
  movement_pattern: string;
  tier: string;
  progression_type?: string | null;
  supports_1rm?: number | null;
  supports_relative_strength?: number | null;
  is_bodyweight?: number | null;
  instructions: string | null;
  video_url: string | null;
  is_custom: number;
  created_at: string;
  updated_at: string;
}

export interface SqliteWorkoutRow {
  id: string;
  user_id: string;
  plan_id: string | null;
  title: string;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number;
  total_volume_kg: number;
  total_reps: number;
  total_sets: number;
  status: string;
  xp_earned: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SqliteExerciseLogRow {
  id: string;
  workout_id: string;
  exercise_id: string;
  user_id: string;
  order_index: number;
  notes: string | null;
  superset_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SqliteSetLogRow {
  id: string;
  exercise_log_id: string;
  user_id: string;
  set_number: number;
  set_type: string;
  weight_kg: number;
  reps: number;
  rpe: number | null;
  estimated_1rm_kg: number;
  is_pr: number;
  completed: number;
  is_skipped: number;
  completed_at: string;
  distance_meters?: number | null;
  duration_seconds?: number | null;
  pace_seconds_per_km?: number | null;
  created_at: string;
  updated_at: string;
}

export interface SqliteMasteryRow {
  id: string;
  user_id: string;
  exercise_id: string;
  mastery_level: number;
  mastery_xp: number;
  rank?: string | null;
  estimated_1rm_kg: number;
  best_weight_kg: number;
  best_reps: number;
  best_volume_kg: number;
  relative_strength?: number | null;
  total_sessions: number;
  total_sets: number;
  total_reps: number;
  total_volume_kg: number;
  personal_records_count?: number | null;
  milestones_unlocked_count?: number | null;
  recent_performance: string;
  last_trained_at: string | null;
  trend?: string | null;
  xp_to_next_level?: number | null;
  best_distance_meters?: number | null;
  best_duration_seconds?: number | null;
  best_pace_seconds_per_km?: number | null;
  total_distance_meters?: number | null;
  total_duration_seconds?: number | null;
  created_at: string;
  updated_at: string;
}

export interface SqliteProfileRow {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  goal: string;
  primary_goal?: string | null;
  secondary_goals?: string | null;
  experience: string;
  age: number;
  height_cm: number;
  weight_kg: number;
  training_preferences: string;
  global_level: number;
  total_xp: number;
  rank_tier: string;
  rank_division: number;
  attributes: string;
  current_streak: number;
  longest_streak: number;
  streak_freeze_tokens: number;
  last_workout_date: string | null;
  is_guest: number;
  onboarding_completed: number;
  auth_id: string | null;
  friend_code?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SqliteUserSettingsRow {
  id: string;
  user_id: string;
  preferred_unit: string;
  sound_enabled: number;
  haptics_enabled: number;
  default_rest_seconds: number;
  push_notifications_enabled: number;
  streak_freeze_auto_use: number;
  created_at: string;
  updated_at: string;
}

export interface SqlitePersonalRecordRow {
  id: string;
  user_id: string;
  exercise_id: string;
  pr_type: string;
  value: number;
  set_log_id: string | null;
  achieved_at: string;
  created_at: string;
  updated_at: string;
}

export interface SqliteSyncQueueRow {
  id: string;
  idempotency_key?: string | null;
  entity_type: string;
  entity_id: string;
  operation: string;
  payload: string;
  client_timestamp: number;
  attempts: number;
  next_retry_at?: number | null;
  last_error: string | null;
  status: string;
}

export interface SqliteQuestRow {
  id: string;
  title: string;
  description: string;
  type: string;
  category: string;
  target_value: number;
  unit: string;
  xp_reward: number;
  badge_variant: string;
  created_at: string;
}

export interface SqliteUserQuestRow {
  id: string;
  user_id: string;
  quest_id: string;
  current_progress: number;
  target_value: number;
  completed: number;
  completed_at: string | null;
  last_reset_date: string;
  created_at: string;
  updated_at: string;
}

export interface SqliteXpTransactionRow {
  id: string;
  user_id: string;
  exercise_id?: string | null;
  xp_type?: string | null;
  source_type: string;
  source_id: string | null;
  amount: number;
  description: string;
  created_at: string;
}

export interface SqliteMilestoneRow {
  id: string;
  exercise_id: string;
  metric: string;
  threshold: number;
  reward_xp: number;
  title: string;
  description: string;
  created_at: string;
}

export interface SqliteUserMilestoneRow {
  id: string;
  user_id: string;
  milestone_id: string;
  exercise_id: string;
  unlocked_at: string;
  xp_awarded: number;
  created_at: string;
}

export interface SqliteWorkoutTemplateRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  split_type: string;
  folder: string | null;
  is_preset: number;
  estimated_duration_min: number;
  created_at: string;
  updated_at: string;
}

export interface SqliteWorkoutTemplateExerciseRow {
  id: string;
  template_id: string;
  exercise_id: string;
  order_index: number;
  target_sets: number;
  target_reps: string;
  target_weight_kg: number | null;
  target_rpe: number | null;
  rest_seconds: number;
  superset_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface SqliteFriendshipRow {
  id: string;
  user_id: string;
  friend_id: string;
  created_at: string;
}

export interface SqliteFriendRequestRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SqliteBlockRow {
  id: string;
  blocker_id: string;
  blocked_id: string;
  created_at: string;
}

export interface SqliteActivityFeedRow {
  id: string;
  user_id: string;
  event_type: string;
  title: string;
  summary: string;
  metadata: string;
  visibility: string;
  likes_count: number;
  created_at: string;
}

export interface SqliteActivityReactionRow {
  id: string;
  activity_id: string;
  user_id: string;
  reaction_type: string;
  created_at: string;
}

export interface SqlitePrivacySettingsRow {
  id: string;
  user_id: string;
  profile_visibility: string;
  feed_visibility_default: string;
  show_workouts_in_feed: number;
  show_prs_in_feed: number;
  show_level_ups_in_feed: number;
  show_rank_ups_in_feed: number;
  show_achievements_in_feed: number;
  show_challenges_in_feed: number;
  show_evolution_in_feed: number;
  allow_friend_requests: number;
  show_mastery_on_profile: number;
  show_achievements_on_profile: number;
  show_streak_on_profile: number;
  created_at: string;
  updated_at: string;
}

export interface SqliteChallengeRow {
  id: string;
  title: string;
  description: string;
  type: string;
  metric: string;
  target: number;
  start_at: string;
  end_at: string;
  visibility: string;
  created_by: string;
  status: string;
  config: string;
  reward_xp: number;
  created_at: string;
  updated_at: string;
}

export interface SqliteChallengeParticipantRow {
  id: string;
  challenge_id: string;
  user_id: string;
  progress: number;
  rank: number;
  status: string;
  joined_at: string;
  completed_at: string | null;
  last_updated_at: string;
}

export interface SqliteChallengeEventRow {
  id: string;
  challenge_id: string;
  user_id: string;
  event_id: string;
  event_type: string;
  contribution_value: number;
  processed_at: string;
}

export interface SqliteHealthRecordRow {
  id: string;
  user_id: string;
  record_type: string;
  source_client: string;
  external_id: string | null;
  start_time: string;
  end_time: string;
  value: number;
  unit: string;
  metadata: string;
  is_deduplicated: number;
  synced_at: string;
  created_at: string;
}

export interface SqliteHealthSyncStateRow {
  id: string;
  user_id: string;
  is_connected: number;
  granted_permissions: string;
  last_sync_time: string | null;
  sync_cursor: string | null;
  created_at: string;
  updated_at: string;
}

