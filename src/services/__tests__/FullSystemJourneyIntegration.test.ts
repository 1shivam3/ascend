import { describe, it, expect, vi, beforeAll } from 'vitest';
import { ProfileRepository } from '../../database/repositories/ProfileRepository';
import { DeterministicWorkoutGenerator } from '../ai/DeterministicWorkoutGenerator';
import { MasteryEngine } from '../progression/MasteryEngine';
import { PREngine } from '../workout/PREngine';
import { XpEngine } from '../progression/XpEngine';
import { StreakEngine } from '../progression/StreakEngine';
import { AchievementEngine } from '../progression/AchievementEngine';
import { FriendService } from '../social/FriendService';
import { FriendProfileService } from '../social/FriendProfileService';
import { SocialFeedService } from '../social/SocialFeedService';
import { ChallengeEngine } from '../challenges/ChallengeEngine';
import { ChallengeRepository } from '../../database/repositories/ChallengeRepository';
import { LeaderboardService } from '../leaderboard/LeaderboardService';
import { StepCounterService } from '../step/StepCounterService';
import { MockStepCounterAdapter } from '../step/StepCounterAdapter';
import { StepRepository } from '../../database/repositories/StepRepository';
import { HealthQuestBridge } from '../health/HealthQuestBridge';
import { ActivityFeedRepository } from '../../database/repositories/ActivityFeedRepository';
import { PrivacyRepository } from '../../database/repositories/PrivacyRepository';
import { XpRepository } from '../../database/repositories/XpRepository';
import { SyncQueueRepository } from '../../database/repositories/SyncQueueRepository';
import { Exercise, SetLog, UserProfile } from '../../types/domain.types';
import { Challenge } from '../../types/challenge.types';

// In-Memory Database Emulation for Full-System Journey Testing
const { mockDb, tables } = vi.hoisted(() => {
  const state = {
    profiles: [] as any[],
    user_settings: [] as any[],
    workout_plans: [] as any[],
    workouts: [] as any[],
    exercise_logs: [] as any[],
    set_logs: [] as any[],
    exercise_mastery: [] as any[],
    personal_records: [] as any[],
    xp_transactions: [] as any[],
    workout_templates: [] as any[],
    user_achievements: [] as any[],
    user_quests: [] as any[],
    user_milestones: [] as any[],
    nutrition_logs: [] as any[],
    friendships: [] as any[],
    friend_requests: [] as any[],
    blocks: [] as any[],
    activity_feed: [] as any[],
    activity_reactions: [] as any[],
    privacy_settings: [] as any[],
    challenges: [] as any[],
    challenge_participants: [] as any[],
    challenge_events: [] as any[],
    health_records: [] as any[],
    health_sync_state: [] as any[],
    sync_queue: [] as any[],
    daily_step_summaries: [] as any[],
  };

  const db = {
    runAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();

      // Profiles
      if (s.startsWith('INSERT OR REPLACE INTO profiles') || s.startsWith('INSERT INTO profiles')) {
        const [
          id, username, display_name, avatar_url, goal, primary_goal, secondary_goals, experience,
          age, height_cm, weight_kg, training_preferences, global_level, total_xp, rank_tier, rank_division,
          attributes, current_streak, longest_streak, streak_freeze_tokens, last_workout_date,
          is_guest, onboarding_completed, auth_id, friend_code, created_at, updated_at
        ] = params;

        const idx = state.profiles.findIndex(p => p.id === id);
        const record = {
          id, username, display_name, avatar_url, goal, primary_goal, secondary_goals, experience,
          age, height_cm, weight_kg, training_preferences, global_level, total_xp, rank_tier, rank_division,
          attributes, current_streak, longest_streak, streak_freeze_tokens, last_workout_date,
          is_guest, onboarding_completed, auth_id, friend_code, created_at, updated_at,
          leaderboard_opt_in: 0,
        };
        if (idx >= 0) state.profiles[idx] = record;
        else state.profiles.push(record);
        return { changes: 1 };
      }

      if (s.startsWith('UPDATE profiles SET total_xp = total_xp +')) {
        const [amount, updated_at, id] = params;
        const p = state.profiles.find(x => x.id === id);
        if (p) {
          p.total_xp += amount;
          p.updated_at = updated_at;
          return { changes: 1 };
        }
        return { changes: 0 };
      }

      if (s.startsWith('UPDATE profiles SET leaderboard_opt_in =')) {
        const [optIn, updated_at, id] = params;
        const p = state.profiles.find(x => x.id === id);
        if (p) {
          p.leaderboard_opt_in = optIn;
          p.updated_at = updated_at;
          return { changes: 1 };
        }
        return { changes: 0 };
      }

      if (s.startsWith('UPDATE profiles SET weight_kg =')) {
        const [weight, updated_at, id] = params;
        const p = state.profiles.find(x => x.id === id);
        if (p) {
          p.weight_kg = weight;
          p.updated_at = updated_at;
          return { changes: 1 };
        }
        return { changes: 0 };
      }

      if (s.startsWith('UPDATE profiles SET global_level =')) {
        const [lvl, xp, tier, div, attr, streak, longest, tokens, lastDate, updated, id] = params;
        const p = state.profiles.find(x => x.id === id);
        if (p) {
          p.global_level = lvl;
          p.total_xp = xp;
          p.rank_tier = tier;
          p.rank_division = div;
          p.attributes = attr;
          p.current_streak = streak;
          p.longest_streak = longest;
          p.streak_freeze_tokens = tokens;
          p.last_workout_date = lastDate;
          p.updated_at = updated;
          return { changes: 1 };
        }
        return { changes: 0 };
      }

      // XP Transactions
      if (s.startsWith('INSERT OR IGNORE INTO xp_transactions')) {
        const [id, user_id, source_type, source_id, amount, description, xp_type, exercise_id, created_at] = params;
        if (!state.xp_transactions.some(x => x.user_id === user_id && x.source_type === source_type && x.source_id === source_id)) {
          state.xp_transactions.push({ id, user_id, source_type, source_id, amount, description, xp_type, exercise_id, created_at });
          return { changes: 1 };
        }
        return { changes: 0 };
      }

      // Achievements
      if (s.startsWith('INSERT INTO user_achievements') || s.startsWith('INSERT OR IGNORE INTO user_achievements')) {
        const [id, user_id, achievement_id, xp_awarded, unlocked_at] = params;
        if (!state.user_achievements.some(a => a.user_id === user_id && a.achievement_id === achievement_id)) {
          state.user_achievements.push({ id, user_id, achievement_id, xp_awarded, unlocked_at });
          return { changes: 1 };
        }
        return { changes: 0 };
      }

      // Activity Feed
      if (s.startsWith('INSERT INTO activity_feed')) {
        const [id, user_id, event_type, title, summary, metadata, visibility, likes_count, created_at] = params;
        state.activity_feed.push({ id, user_id, event_type, title, summary, metadata, visibility, likes_count, created_at });
        return { changes: 1 };
      }

      // Activity Reactions
      if (s.startsWith('INSERT INTO activity_reactions') || s.startsWith('INSERT OR IGNORE INTO activity_reactions')) {
        const [id, activity_id, user_id, reaction_type, created_at] = params;
        state.activity_reactions.push({ id, activity_id, user_id, reaction_type, created_at });
        return { changes: 1 };
      }

      if (s.startsWith('DELETE FROM activity_reactions')) {
        const [activity_id, user_id, reaction_type] = params;
        state.activity_reactions = state.activity_reactions.filter(
          r => !(r.activity_id === activity_id && r.user_id === user_id && r.reaction_type === reaction_type)
        );
        return { changes: 1 };
      }

      // Friendships & Requests
      if (s.startsWith('INSERT INTO friendships') || s.startsWith('INSERT OR IGNORE INTO friendships')) {
        const [id, user_id, friend_id, created_at] = params;
        if (!state.friendships.some(f => f.user_id === user_id && f.friend_id === friend_id)) {
          state.friendships.push({ id, user_id, friend_id, created_at });
          return { changes: 1 };
        }
        return { changes: 0 };
      }

      if (s.startsWith('INSERT INTO friend_requests') || s.startsWith('INSERT OR IGNORE INTO friend_requests')) {
        const [id, sender_id, receiver_id, created_at, updated_at] = params;
        state.friend_requests.push({ id, sender_id, receiver_id, status: 'PENDING', created_at, updated_at });
        return { changes: 1 };
      }

      if (s.startsWith('UPDATE friend_requests SET status =')) {
        const match = s.match(/SET status\s*=\s*'([^']+)'/i);
        const status = match ? match[1] : 'ACCEPTED';
        const updated_at = params[0];
        const id = params[1];
        const r = state.friend_requests.find(x => x.id === id);
        if (r) {
          r.status = status;
          r.updated_at = updated_at;
          return { changes: 1 };
        }
        return { changes: 0 };
      }

      // Blocks
      if (s.startsWith('INSERT INTO blocks') || s.startsWith('INSERT OR IGNORE INTO blocks')) {
        const [id, blocker_id, blocked_id, created_at] = params;
        state.blocks.push({ id, blocker_id, blocked_id, created_at });
        return { changes: 1 };
      }

      if (s.startsWith('DELETE FROM blocks')) {
        const [blocker_id, blocked_id] = params;
        state.blocks = state.blocks.filter(b => !(b.blocker_id === blocker_id && b.blocked_id === blocked_id));
        return { changes: 1 };
      }

      if (s.startsWith('DELETE FROM friendships')) {
        const [u1, f1, u2, f2] = params;
        state.friendships = state.friendships.filter(
          f => !((f.user_id === u1 && f.friend_id === f1) || (f.user_id === u2 && f.friend_id === f2))
        );
        return { changes: 1 };
      }

      if (s.startsWith('DELETE FROM friend_requests')) {
        const [u1, u2, u3, u4] = params;
        state.friend_requests = state.friend_requests.filter(
          fr => !((fr.sender_id === u1 && fr.receiver_id === u2) || (fr.sender_id === u3 && fr.receiver_id === u4))
        );
        return { changes: 1 };
      }

      // Privacy Settings
      if (s.startsWith('INSERT OR REPLACE INTO privacy_settings') || s.startsWith('INSERT INTO privacy_settings')) {
        const [
          id, user_id, profile_visibility, feed_visibility_default,
          show_workouts, show_prs, show_levels, show_ranks, show_achievements,
          show_challenges, show_evolution, allow_friends, show_mastery, show_ach_profile, show_streak,
          created_at, updated_at
        ] = params;
        const idx = state.privacy_settings.findIndex(p => p.user_id === user_id);
        const record = {
          id, user_id, profile_visibility, feed_visibility_default,
          show_workouts_in_feed: show_workouts, show_prs_in_feed: show_prs,
          show_level_ups_in_feed: show_levels, show_rank_ups_in_feed: show_ranks,
          show_achievements_in_feed: show_achievements, show_challenges_in_feed: show_challenges,
          show_evolution_in_feed: show_evolution, allow_friend_requests: allow_friends,
          show_mastery_on_profile: show_mastery, show_achievements_on_profile: show_ach_profile,
          show_streak_on_profile: show_streak, created_at, updated_at
        };
        if (idx >= 0) state.privacy_settings[idx] = record;
        else state.privacy_settings.push(record);
        return { changes: 1 };
      }

      // Challenges
      if (s.startsWith('INSERT INTO challenges')) {
        const [id, title, desc, type, metric, target, start, end, vis, created_by, status, config, reward, created, updated] = params;
        state.challenges.push({ id, title, description: desc, type, metric, target, start_at: start, end_at: end, visibility: vis, created_by, status, config, reward_xp: reward, created_at: created, updated_at: updated });
        return { changes: 1 };
      }

      if (s.startsWith('INSERT INTO challenge_participants')) {
        const [id, challenge_id, user_id, joined_at, last_updated_at] = params;
        state.challenge_participants.push({ id, challenge_id, user_id, progress: 0, rank: 1, status: 'ACTIVE', joined_at, completed_at: null, last_updated_at });
        return { changes: 1 };
      }

      if (s.startsWith('INSERT INTO challenge_events')) {
        const [id, challenge_id, user_id, event_id, event_type, contribution_value, processed_at] = params;
        state.challenge_events.push({ id, challenge_id, user_id, event_id, event_type, contribution_value, processed_at });
        return { changes: 1 };
      }

      if (s.startsWith('UPDATE challenge_participants SET progress =')) {
        const [progress, status, completed_at, last_updated_at, challenge_id, user_id] = params;
        const p = state.challenge_participants.find(cp => cp.challenge_id === challenge_id && cp.user_id === user_id);
        if (p) {
          p.progress = progress;
          p.status = status;
          p.completed_at = completed_at;
          p.last_updated_at = last_updated_at;
          return { changes: 1 };
        }
        return { changes: 0 };
      }

      // Health Records
      if (s.startsWith('INSERT OR IGNORE INTO health_records')) {
        const [id, user_id, record_type, source_client, external_id, start_time, end_time, value_num, unit, metadata, is_deduplicated, created_at] = params;
        state.health_records.push({ id, user_id, record_type, source_client, external_id, start_time, end_time, value: value_num, unit, metadata, is_deduplicated, created_at });
        return { changes: 1 };
      }

      if (s.startsWith('INSERT OR REPLACE INTO health_sync_state') || s.startsWith('INSERT INTO health_sync_state')) {
        const [id, user_id, is_connected, granted_permissions, last_sync_time, sync_cursor, created_at, updated_at] = params;
        const idx = state.health_sync_state.findIndex(h => h.user_id === user_id);
        const record = { id, user_id, is_connected, granted_permissions, last_sync_time, sync_cursor, created_at, updated_at };
        if (idx >= 0) state.health_sync_state[idx] = record;
        else state.health_sync_state.push(record);
        return { changes: 1 };
      }

      // Local Sync Queue
      if (s.startsWith('INSERT INTO local_sync_queue')) {
        const [id, idempotency_key, entity_type, entity_id, operation, payload, client_timestamp, attempts, status] = params;
        state.sync_queue.push({ id, idempotency_key, entity_type, entity_id, operation, payload, client_timestamp, attempts, status });
        return { changes: 1 };
      }

      if (s.startsWith('UPDATE local_sync_queue SET')) {
        const [payload, client_timestamp, id] = params;
        const q = state.sync_queue.find(x => x.id === id);
        if (q) {
          q.payload = payload;
          q.client_timestamp = client_timestamp;
          q.status = 'PENDING';
          return { changes: 1 };
        }
        return { changes: 0 };
      }

      // Daily Step Summaries
      if (s.startsWith('INSERT INTO daily_step_summaries')) {
        const [id, user_id, date, today_steps, step_goal, last_sensor_value, baseline, last_updated_at, synced_at, created_at] = params;
        const idx = state.daily_step_summaries.findIndex(row => row.user_id === user_id && row.date === date);
        const record = { id, user_id, date, today_steps, step_goal, last_sensor_value, baseline, last_updated_at, synced_at, created_at };
        if (idx >= 0) state.daily_step_summaries[idx] = record;
        else state.daily_step_summaries.push(record);
        return { changes: 1 };
      }

      if (s.startsWith('UPDATE daily_step_summaries SET step_goal =')) {
        const [step_goal, user_id, date] = params;
        const row = state.daily_step_summaries.find(r => r.user_id === user_id && r.date === date);
        if (row) {
          row.step_goal = step_goal;
          return { changes: 1 };
        }
        return { changes: 0 };
      }

      // Generic UPDATE migrations for guest migration
      if (s.startsWith('UPDATE') && s.includes('user_id = ?')) {
        const [newId, oldId] = params;
        const targetTable = s.split(' ')[1];
        if ((state as any)[targetTable]) {
          (state as any)[targetTable].forEach((row: any) => {
            if (row.user_id === oldId) row.user_id = newId;
          });
        }
        return { changes: 1 };
      }

      return { changes: 0 };
    }),

    getFirstAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();

      if (s.includes('FROM profiles') && (s.includes('friend_code =') || s.includes('friend_code) =') || s.includes('UPPER(friend_code)'))) {
        const [code] = params;
        return state.profiles.find(p => p.friend_code?.toUpperCase() === code?.toString()?.toUpperCase()) || null;
      }
      if (s.includes('FROM profiles') && s.includes('WHERE id = ?')) {
        const [id] = params;
        return state.profiles.find(p => p.id === id) || null;
      }
      if (s.includes('FROM blocks')) {
        const [u1, u2, u3, u4] = params;
        return state.blocks.find(
          b => (b.blocker_id === u1 && b.blocked_id === u2) || (b.blocker_id === u3 && b.blocked_id === u4)
        ) || null;
      }
      if (s.includes('FROM friendships') && s.includes('WHERE user_id = ? AND friend_id = ?')) {
        const [u1, u2] = params;
        return state.friendships.find(f => f.user_id === u1 && f.friend_id === u2) || null;
      }
      if (s.includes('FROM friend_requests')) {
        if (s.includes('WHERE id = ? AND receiver_id = ?')) {
          const [id, rId] = params;
          return state.friend_requests.find(fr => fr.id === id && fr.receiver_id === rId && fr.status === 'PENDING') || null;
        }
        if (s.includes('WHERE sender_id = ? AND receiver_id = ?')) {
          const [sId, rId] = params;
          return state.friend_requests.find(fr => fr.sender_id === sId && fr.receiver_id === rId && fr.status === 'PENDING') || null;
        }
        if (s.includes('WHERE id = ?')) {
          const [id] = params;
          return state.friend_requests.find(fr => fr.id === id) || null;
        }
      }
      if (s.includes('FROM privacy_settings WHERE user_id = ?')) {
        const [userId] = params;
        return state.privacy_settings.find(p => p.user_id === userId) || null;
      }
      if (s.includes('FROM activity_reactions WHERE activity_id = ? AND user_id = ?')) {
        const [actId, uid, rType] = params;
        return state.activity_reactions.find(
          ar => ar.activity_id === actId && ar.user_id === uid && (!rType || ar.reaction_type === rType)
        ) || null;
      }
      if (s.startsWith('SELECT id FROM challenges WHERE id = ?')) {
        const [id] = params;
        return state.challenges.find(c => c.id === id) || null;
      }
      if (s.startsWith('SELECT * FROM challenges WHERE id = ?')) {
        const [id] = params;
        return state.challenges.find(c => c.id === id) || null;
      }
      if (s.startsWith('SELECT * FROM challenge_participants WHERE challenge_id = ? AND user_id = ?')) {
        const [cid, uid] = params;
        return state.challenge_participants.find(cp => cp.challenge_id === cid && cp.user_id === uid) || null;
      }
      if (s.startsWith('SELECT id FROM challenge_events WHERE challenge_id = ? AND user_id = ? AND event_id = ?')) {
        const [cid, uid, eid] = params;
        return state.challenge_events.find(ce => ce.challenge_id === cid && ce.user_id === uid && ce.event_id === eid) || null;
      }
      if (s.startsWith('SELECT * FROM health_sync_state WHERE user_id = ?')) {
        const [uid] = params;
        return state.health_sync_state.find(h => h.user_id === uid) || null;
      }
      if (s.startsWith('SELECT leaderboard_opt_in FROM profiles WHERE id = ?')) {
        const [uid] = params;
        const p = state.profiles.find(x => x.id === uid);
        return p ? { leaderboard_opt_in: p.leaderboard_opt_in } : null;
      }
      if (s.startsWith('SELECT * FROM daily_step_summaries WHERE user_id = ? AND date = ?')) {
        const [uid, dt] = params;
        return state.daily_step_summaries.find(r => r.user_id === uid && r.date === dt) || null;
      }
      if (s.startsWith('SELECT id, status FROM local_sync_queue WHERE idempotency_key = ?')) {
        const [key] = params;
        return state.sync_queue.find(q => q.idempotency_key === key) || null;
      }
      return null;
    }),

    getAllAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();

      if (s.includes('FROM challenge_participants cp') && s.includes('JOIN challenges c')) {
        const [userId] = params;
        const joined = state.challenge_participants.filter(cp => cp.user_id === userId);
        return joined.map(cp => {
          const c = state.challenges.find(x => x.id === cp.challenge_id);
          return {
            id: c?.id,
            p_id: cp.id,
            challenge_id: cp.challenge_id,
            user_id: cp.user_id,
            progress: cp.progress,
            rank: cp.rank,
            p_status: cp.status,
            joined_at: cp.joined_at,
            completed_at: cp.completed_at,
            last_updated_at: cp.last_updated_at,
            title: c?.title,
            description: c?.description,
            type: c?.type,
            metric: c?.metric,
            target: c?.target,
            start_at: c?.start_at,
            end_at: c?.end_at,
            visibility: c?.visibility,
            created_by: c?.created_by,
            status: c?.status || 'ACTIVE',
            config: typeof c?.config === 'string' ? c?.config : JSON.stringify(c?.config || {}),
            reward_xp: c?.reward_xp,
            created_at: c?.created_at,
            updated_at: c?.updated_at,
          };
        });
      }

      if (s.includes('FROM friendships') && s.includes('JOIN profiles')) {
        const [userId] = params;
        const friends = state.friendships.filter(f => f.user_id === userId);
        return friends.map(f => {
          const p = state.profiles.find(x => x.id === f.friend_id);
          return {
            id: p?.id || f.friend_id,
            username: p?.username || 'Unknown',
            display_name: p?.display_name || 'Operative',
            avatar_url: p?.avatar_url || '👤',
            friend_code: p?.friend_code || 'ASC-0000',
            global_level: p?.global_level || 1,
            rank_tier: p?.rank_tier || 'E',
            rank_division: p?.rank_division || 'IV',
            current_streak: p?.current_streak || 0,
          };
        });
      }

      if (s.startsWith('SELECT * FROM friendships WHERE user_id = ?')) {
        const [uid] = params;
        return state.friendships.filter(f => f.user_id === uid);
      }

      if (s.includes('FROM user_achievements')) {
        const [userId] = params;
        return state.user_achievements.filter(a => a.user_id === userId);
      }

      if (s.includes('FROM profiles p') && s.includes('p.leaderboard_opt_in = 1')) {
        let optedIn = state.profiles.filter(p => p.leaderboard_opt_in === 1);
        if (s.includes('FROM friendships WHERE user_id = ?')) {
          const currentUserId = params[1];
          const friendIds = new Set(
            state.friendships
              .filter(f => f.user_id === currentUserId)
              .map(f => f.friend_id)
          );
          friendIds.add(currentUserId);
          optedIn = optedIn.filter(p => friendIds.has(p.id));
        }
        return optedIn.map(p => {
          const userXp = state.xp_transactions
            .filter(x => x.user_id === p.id)
            .reduce((sum, x) => sum + x.amount, 0);
          return {
            id: p.id,
            display_name: p.display_name,
            avatar_url: p.avatar_url,
            global_level: p.global_level,
            rank_tier: p.rank_tier,
            rank_division: p.rank_division,
            weekly_xp: userXp,
          };
        });
      }

      return [];
    }),
  };

  return { mockDb: db, tables: state };
});

vi.mock('../../database/sqlite', () => ({
  getDatabase: vi.fn().mockResolvedValue(mockDb),
}));

import { calculateEstimated1RM } from '../../utils/1rm';

describe('Full-System Journey Integration & Post-Expansion Audit', () => {
  const userA = 'user-alpha-101';
  const userB = 'user-bravo-202';
  const userC = 'user-charlie-303';
  let profileAInstance: UserProfile;

  beforeAll(() => {
    vi.clearAllMocks();
    Object.keys(tables).forEach(k => {
      (tables as any)[k] = [];
    });
  });

  it('Phase 1: New User Onboarding & Goal Selection (GET_STRONGER)', async () => {
    profileAInstance = await ProfileRepository.completeOnboarding(userA, {
      username: 'ShadowOperative',
      displayName: 'Commander Shadow',
      avatarUrl: '⚔️',
      goal: 'STRENGTH',
      primaryGoal: 'GET_STRONGER',
      secondaryGoals: ['ATHLETIC_PERFORMANCE'],
      experience: 'ADVANCED',
      age: 28,
      heightCm: 182,
      weightKg: 85,
      trainingPreferences: { daysPerWeek: 4, equipmentTier: 'FULL_GYM' },
      attributes: {
        strength: 15,
        endurance: 10,
        agility: 10,
        consistency: 10,
        stamina: 10,
        discipline: 10,
        vitality: 10,
      },
    });

    expect(profileAInstance.primaryGoal).toBe('GET_STRONGER');
    expect(profileAInstance.globalLevel).toBe(1);
    expect(profileAInstance.totalXp).toBe(150); // Starting XP bonus
    expect(profileAInstance.friendCode).toMatch(/^ASC-[A-Z0-9-]+$/);

    // Initial privacy settings
    const privacy = await PrivacyRepository.getSettings(userA);
    expect(privacy.profileVisibility).toBe('FRIENDS');
    expect(privacy.showWorkoutsInFeed).toBe(true);
  });

  it('Phase 2: Goal-Specific Deterministic Plan Generation', async () => {
    const plan = DeterministicWorkoutGenerator.generate({
      goal: 'STRENGTH',
      primary_goal: 'GET_STRONGER',
      experience: 'ADVANCED',
      days_per_week: 4,
      equipment: ['BARBELL', 'DUMBBELL', 'BENCH', 'RACK'],
      excluded_exercises: [],
      preferred_exercises: [],
      age: 28,
      height: 182,
      weight: 85,
      session_duration: 60,
      training_location: 'COMMERCIAL_GYM',
      limitations: [],
    });

    expect(plan.name).toContain('GET STRONGER');
    expect(plan.days).toHaveLength(4);
    // Heavy barbell compound prescription with 3-5 rep scheme for strength
    const firstExercise = plan.days[0].exercises[0];
    expect(firstExercise.target_reps).toBe('3-5');
    expect(firstExercise.sets).toBeGreaterThanOrEqual(3);
  });

  it('Phase 3: Active Workout Execution, Set Logging & PR Detection', () => {
    const mockBenchPress: Exercise = {
      id: 'ex-bench-1',
      name: 'Barbell Bench Press',
      slug: 'barbell-bench-press',
      primaryMuscle: 'CHEST',
      secondaryMuscles: ['TRICEPS', 'FRONT_DELTS'],
      equipment: 'BARBELL',
      movementPattern: 'PUSH_HORIZONTAL',
      tier: 'COMPOUND_PRIMARY',
      progressionType: 'BARBELL_COMPOUND',
      supports1Rm: true,
      supportsRelativeStrength: true,
      isBodyweight: false,
      isCustom: false,
    };

    const set1: SetLog = {
      id: 'set-1',
      exerciseLogId: 'el-bench-1',
      userId: userA,
      setNumber: 1,
      weightKg: 100,
      reps: 5,
      rpe: 8.5,
      estimated1RmKg: 116.7,
      isPr: false,
      completed: true,
      isSkipped: false,
      completedAt: new Date().toISOString(),
      setType: 'NORMAL',
    };

    // Calculate 1RM (Epley formula: 100 * (1 + 5/30) = 116.7)
    const calculated1Rm = calculateEstimated1RM(set1.weightKg, set1.reps);
    expect(calculated1Rm).toBe(116.7);

    // Detect PR (no prior PR)
    const detectedPRs = PREngine.evaluateSetForPRs(
      set1,
      mockBenchPress.id,
      mockBenchPress.name,
      {}
    );

    expect(detectedPRs.length).toBeGreaterThan(0);
    const weightPR = detectedPRs.find(p => p.prType === 'MAX_WEIGHT');
    expect(weightPR?.newValue).toBe(100);
  });

  it('Phase 4: Progression Calculation, XP Ledger, Evolution, and Achievement Unlocking', async () => {
    // Mint 400 workout XP through idempotent ledger
    const txResult = await XpRepository.recordTransaction(
      userA,
      'WORKOUT',
      'w-session-001',
      400,
      'Heavy Strength Protocol'
    );
    expect(txResult.awarded).toBe(true);

    // Duplicate attempt is rejected (Idempotency)
    const dupTx = await XpRepository.recordTransaction(
      userA,
      'WORKOUT',
      'w-session-001',
      400,
      'Heavy Strength Protocol'
    );
    expect(dupTx.awarded).toBe(false);

    // Evaluate Streak
    const streak = StreakEngine.evaluateStreak(null, '2026-09-20', 0, 0, 1);
    expect(streak.currentStreak).toBe(1);

    // Evaluate Achievements
    const achResult = await AchievementEngine.evaluateAndUnlock(userA, {
      totalWorkouts: 1,
      totalVolumeKg: 2500,
      currentStreak: 1,
      longestStreak: 1,
      completedQuestsCount: 1,
      personalRecordsCount: 1,
      maxMasteryLevel: 2,
    });

    expect(achResult.newlyUnlocked.length).toBeGreaterThan(0);
    const firstQuestAch = achResult.newlyUnlocked.find(a => a.code === 'FIRST_QUEST');
    expect(firstQuestAch).toBeDefined();

    // Broadcast social events to Activity Feed
    const feedItem = await SocialFeedService.publishEvent(userA, {
      eventType: 'WORKOUT_COMPLETED',
      title: 'Heavy Strength Protocol Completed',
      summary: 'Logged 45m • 2,500 kg total volume',
      metadata: {
        workoutId: 'w-session-001',
        durationMinutes: 45,
        totalVolumeKg: 2500,
      },
    });

    expect(feedItem).not.toBeNull();
    expect(feedItem?.title).toContain('Heavy Strength Protocol');
  });

  it('Phase 5: Challenge Engine Integration, Exercise Sub-Event Filtering & Same-Day Dedup', async () => {
    const challenge = await ChallengeRepository.createChallenge({
      id: 'c-climb-1',
      title: 'THE CLIMB',
      description: 'Complete 4 workouts this week',
      type: 'COMMUNITY',
      metric: 'WORKOUTS',
      target: 4,
      startAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      endAt: new Date(Date.now() + 86400 * 7 * 1000).toISOString(),
      visibility: 'PUBLIC',
      createdBy: userA,
      status: 'ACTIVE',
      rewardXp: 500,
    });

    const consistencyChallenge = await ChallengeRepository.createChallenge({
      id: 'c-consistency-1',
      title: 'IRON CONSISTENCY',
      description: 'Train on 5 separate days',
      type: 'COMMUNITY',
      metric: 'DAYS_ACTIVE',
      target: 5,
      startAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      endAt: new Date(Date.now() + 86400 * 7 * 1000).toISOString(),
      visibility: 'PUBLIC',
      createdBy: userA,
      status: 'ACTIVE',
      rewardXp: 500,
    });

    await ChallengeEngine.joinChallenge(userA, challenge.id);
    await ChallengeEngine.joinChallenge(userA, consistencyChallenge.id);

    // 1. Process main workout event
    const updates = await ChallengeEngine.processEvent(userA, {
      eventId: 'workout-session-1',
      eventType: 'WORKOUT',
      timestamp: new Date().toISOString(),
      volumeKg: 2500,
    });

    expect(updates.length).toBe(2);
    const climbUpdate = updates.find(u => u.challengeId === challenge.id);
    expect(climbUpdate?.contribution).toBe(1);
    expect(climbUpdate?.newProgress).toBe(1);

    // 2. Exercise sub-events MUST NOT contribute to WORKOUTS or DAYS_ACTIVE
    const subEventUpdates = await ChallengeEngine.processEvent(userA, {
      eventId: 'workout-session-1-bench',
      eventType: 'WORKOUT',
      timestamp: new Date().toISOString(),
      exerciseId: 'ex-bench-1',
      exerciseVolumeKg: 1200,
    });

    // Zero contributions from exercise sub-events
    expect(subEventUpdates).toHaveLength(0);

    // 3. Second workout on the SAME DAY must NOT advance DAYS_ACTIVE
    const sameDaySecondWorkout = await ChallengeEngine.processEvent(userA, {
      eventId: 'workout-session-2',
      eventType: 'WORKOUT',
      timestamp: new Date().toISOString(),
      volumeKg: 1800,
    });

    // 'THE CLIMB' (WORKOUTS metric) increments to 2
    const climbSecondUpdate = sameDaySecondWorkout.find(u => u.challengeId === challenge.id);
    expect(climbSecondUpdate?.newProgress).toBe(2);

    // 'IRON CONSISTENCY' (DAYS_ACTIVE metric) is skipped because day already contributed!
    const consistencySecondUpdate = sameDaySecondWorkout.find(u => u.challengeId === consistencyChallenge.id);
    expect(consistencySecondUpdate).toBeUndefined();
  });

  it('Phase 6: Multi-User Social Lifecycle, Mutual Privacy & Dossier Inspection', async () => {
    // Setup User B
    const profileB = await ProfileRepository.completeOnboarding(userB, {
      username: 'ValkyriePrime',
      displayName: 'Captain Valkyrie',
      avatarUrl: '🛡️',
      goal: 'HYPERTROPHY',
      experience: 'INTERMEDIATE',
      age: 26,
      heightCm: 170,
      weightKg: 64,
      trainingPreferences: { daysPerWeek: 5 },
      attributes: {
        strength: 12, endurance: 14, agility: 12, consistency: 12, stamina: 12, discipline: 12, vitality: 12,
      },
    });

    // User B searches User A by friend code
    const foundUserA = await FriendService.lookupByFriendCode(profileAInstance.friendCode!);
    expect(foundUserA).toBeDefined();
    expect(foundUserA?.id).toBe(userA);

    // User B sends friend request to User A
    const req = await FriendService.sendFriendRequest(userB, userA);
    expect(req.status).toBe('PENDING');

    // User A accepts friend request
    await FriendService.acceptFriendRequest(userA, req.id);

    // Mutual friendship established
    const friendsA = await FriendService.getFriends(userA);
    expect(friendsA.some(f => f.id === userB)).toBe(true);

    // User B inspects User A's dossier
    const dossierA = await FriendProfileService.getPublicProfile(userB, userA);
    expect(dossierA).not.toBeNull();
    expect(dossierA?.relationship).toBe('FRIEND');
    expect(dossierA?.username).toBe('ShadowOperative');
    expect(dossierA?.rankTier).toBe('E');

    // PRIVACY VERIFICATION: Private telemetry is NOT exposed
    expect((dossierA as any).weightKg).toBeUndefined();
    expect((dossierA as any).heightCm).toBeUndefined();
    expect((dossierA as any).age).toBeUndefined();
    expect((dossierA as any).notes).toBeUndefined();

    // User B reacts to User A's activity in social feed
    const userAFeedItem = tables.activity_feed[0];
    if (userAFeedItem) {
      await SocialFeedService.reactToActivity(userB, userAFeedItem.id, 'FIRE');
      const reaction = tables.activity_reactions.find(
        r => r.activity_id === userAFeedItem.id && r.user_id === userB
      );
      expect(reaction?.reaction_type).toBe('FIRE');
    }
  });

  it('Phase 7: Weekly Leaderboard Pipeline with Global and Friends Scopes', async () => {
    // Both users opt in to leaderboard
    await LeaderboardService.setOptIn(userA, true);
    await LeaderboardService.setOptIn(userB, true);

    const isAOpted = await LeaderboardService.getOptInStatus(userA);
    expect(isAOpted).toBe(true);

    // Global Leaderboard returns opted-in operatives
    const globalBoard = await LeaderboardService.getWeeklyLeaderboard(userA, 'GLOBAL');
    expect(globalBoard.length).toBeGreaterThanOrEqual(1);

    // Friends Leaderboard returns mutual friends + current user
    const friendsBoard = await LeaderboardService.getWeeklyLeaderboard(userA, 'FRIENDS');
    expect(friendsBoard.length).toBeGreaterThanOrEqual(1);
    expect(friendsBoard.some(e => e.id === userA)).toBe(true);
  });

  it('Phase 8: Native Step Counter Activity, Hardware Baseline Calibration & Strict Gym XP Quarantine', async () => {
    const mockAdapter = new MockStepCounterAdapter(true, true);
    mockAdapter.setRawSensorValue(10000);
    StepCounterService.setAdapter(mockAdapter);

    // Initial calibration: Sensor has 10,000 steps since boot
    const initState = await StepCounterService.initialize(userA);
    expect(initState.status).toBe('READY');
    expect(initState.todaySteps).toBe(0);
    expect(initState.baseline).toBe(10000);
    expect(initState.lastSensorValue).toBe(10000);

    // User walks 6,500 steps throughout the day (hardware sensor advances from 10,000 to 16,500)
    mockAdapter.emitSensorEvent(16500);

    // Allow async event handler to complete
    await new Promise((r) => setTimeout(r, 50));

    const currentState = StepCounterService.getState(userA);
    expect(currentState?.todaySteps).toBe(6500);
    expect(currentState?.lastSensorValue).toBe(16500);

    // Verify local SQLite persistence
    const savedSummary = await StepRepository.getTodaySummary(userA);
    expect(savedSummary).toBeDefined();
    expect(savedSummary?.todaySteps).toBe(6500);

    // STRICT GUARD: Zero gym workout XP or strength mastery awarded for steps
    const gymXpTxs = tables.xp_transactions.filter(
      t => t.user_id === userA && t.source_type === 'WORKOUT' && t.description?.toLowerCase().includes('step')
    );
    expect(gymXpTxs).toHaveLength(0);

    // PRIVACY: Zero health telemetry published to public social feed
    const healthFeedItems = tables.activity_feed.filter(
      a => a.user_id === userA && (a.title.includes('Health') || a.title.includes('bpm') || a.title.includes('Step'))
    );
    expect(healthFeedItems).toHaveLength(0);

    StepCounterService.cleanup();
  });

  it('Phase 9: Guest User Migration Cascade Across Expansion Tables', async () => {
    const guestId = 'guest-operative-999';
    const authId = 'auth-supabase-888';

    // Seed guest rows across expansion tables
    tables.profiles.push({
      id: guestId,
      username: 'GuestRecon',
      display_name: 'Guest Operative',
      goal: 'STRENGTH',
      global_level: 3,
      total_xp: 850,
      is_guest: 1,
      friend_code: 'ASC-G999',
    });

    tables.activity_feed.push({ id: 'af-guest-1', user_id: guestId, event_type: 'WORKOUT_COMPLETED', title: 'Guest Workout' });
    tables.friendships.push({ id: 'f-guest-1', user_id: guestId, friend_id: userB });
    tables.health_records.push({ id: 'hr-guest-1', user_id: guestId, record_type: 'STEPS', value: 4000 });
    tables.daily_step_summaries.push({ id: 'step-guest-1', user_id: guestId, date: '2026-09-22', today_steps: 4200, step_goal: 10000 });
    tables.challenges.push({ id: 'c-guest-1', created_by: guestId, title: 'Guest Cup' });
    tables.challenge_participants.push({ id: 'cp-guest-1', challenge_id: 'c-guest-1', user_id: guestId, progress: 2 });

    // Migrate guest user to authId
    await ProfileRepository.migrateGuestUser(guestId, authId);

    // Verify all expansion tables successfully re-keyed to authId
    const feed = tables.activity_feed.find(a => a.id === 'af-guest-1');
    expect(feed?.user_id).toBe(authId);

    const friendship = tables.friendships.find(f => f.id === 'f-guest-1');
    expect(friendship?.user_id).toBe(authId);

    const health = tables.health_records.find(h => h.id === 'hr-guest-1');
    expect(health?.user_id).toBe(authId);

    const stepSummary = tables.daily_step_summaries.find(s => s.id === 'step-guest-1');
    expect(stepSummary?.user_id).toBe(authId);
  });

  it('Phase 10: Offline Ingestion & Sync Idempotency', async () => {
    // Enqueue an offline mutation
    const key = `workout:w-offline-01:complete`;
    await SyncQueueRepository.enqueue(
      'workout',
      'w-offline-01',
      'UPDATE',
      { id: 'w-offline-01', status: 'COMPLETED', xpEarned: 250 },
      key
    );

    // Re-enqueueing identical key replaces safely without duplication
    await SyncQueueRepository.enqueue(
      'workout',
      'w-offline-01',
      'UPDATE',
      { id: 'w-offline-01', status: 'COMPLETED', xpEarned: 250 },
      key
    );

    const queueItems = tables.sync_queue.filter(q => q.idempotency_key === key);
    expect(queueItems.length).toBe(1);
  });
});
