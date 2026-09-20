import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FriendProfileService } from '../FriendProfileService';
import { SocialFeedService } from '../SocialFeedService';
import { PrivacyService } from '../PrivacyService';
import { ActivityFeedMetadata } from '../../../types/social.types';

// In-memory mock database state
const { mockDb, tables } = vi.hoisted(() => {
  const state = {
    profiles: [] as any[],
    friendships: [] as any[],
    blocks: [] as any[],
    privacy_settings: [] as any[],
    activity_feed: [] as any[],
    activity_reactions: [] as any[],
    user_achievements: [] as any[],
    user_quests: [] as any[],
    exercise_mastery: [] as any[],
  };

  const db = {
    runAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s.startsWith('INSERT INTO activity_feed')) {
        const [id, user_id, event_type, title, summary, metadata, visibility, created_at] = params;
        state.activity_feed.push({
          id,
          user_id,
          event_type,
          title,
          summary,
          metadata,
          visibility,
          likes_count: 0,
          created_at,
        });
        return { changes: 1 };
      }
      if (s.startsWith('INSERT OR IGNORE INTO privacy_settings')) {
        const [
          id, user_id, profile_visibility, feed_visibility_default,
          show_workouts_in_feed, show_prs_in_feed, show_level_ups_in_feed,
          show_rank_ups_in_feed, show_achievements_in_feed, show_challenges_in_feed,
          show_evolution_in_feed, allow_friend_requests, show_mastery_on_profile,
          show_achievements_on_profile, show_streak_on_profile, created_at, updated_at
        ] = params;
        state.privacy_settings.push({
          id, user_id, profile_visibility, feed_visibility_default,
          show_workouts_in_feed, show_prs_in_feed, show_level_ups_in_feed,
          show_rank_ups_in_feed, show_achievements_in_feed, show_challenges_in_feed,
          show_evolution_in_feed, allow_friend_requests, show_mastery_on_profile,
          show_achievements_on_profile, show_streak_on_profile, created_at, updated_at
        });
        return { changes: 1 };
      }
      if (s.startsWith('UPDATE privacy_settings SET')) {
        const userId = params[params.length - 1];
        const existing = state.privacy_settings.find(p => p.user_id === userId);
        if (existing) {
          existing.updated_at = params[params.length - 2];
        }
        return { changes: 1 };
      }
      return { changes: 1 };
    }),

    getFirstAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s.includes('FROM blocks')) {
        const [p1, p2, p3, p4] = params;
        return state.blocks.find(
          b => (b.blocker_id === p1 && b.blocked_id === p2) || (b.blocker_id === p3 && b.blocked_id === p4)
        ) || null;
      }
      if (s.includes('FROM friendships WHERE user_id = ? AND friend_id = ?')) {
        const [u, f] = params;
        return state.friendships.find(fr => fr.user_id === u && fr.friend_id === f) || null;
      }
      if (s.includes('FROM privacy_settings WHERE user_id = ?')) {
        const [userId] = params;
        return state.privacy_settings.find(ps => ps.user_id === userId) || null;
      }
      if (s.includes('FROM profiles WHERE id = ?')) {
        const [id] = params;
        return state.profiles.find(p => p.id === id) || null;
      }
      if (s.includes('FROM user_quests WHERE user_id = ? AND completed = 1')) {
        const [userId] = params;
        const count = state.user_quests.filter(q => q.user_id === userId && q.completed === 1).length;
        return { count };
      }
      return null;
    }),

    getAllAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s.includes('FROM user_achievements WHERE user_id = ?')) {
        const [userId] = params;
        return state.user_achievements.filter(a => a.user_id === userId);
      }
      if (s.includes('FROM exercise_mastery WHERE user_id = ?')) {
        const [userId] = params;
        return state.exercise_mastery.filter(m => m.user_id === userId);
      }
      return [];
    }),
  };

  return { mockDb: db, tables: state };
});

vi.mock('../../../database/sqlite', () => ({
  getDatabase: vi.fn().mockResolvedValue(mockDb),
}));

// Mock repositories that FriendProfileService calls
vi.mock('../../../database/repositories/MasteryRepository', () => ({
  MasteryRepository: {
    getTopMasteries: vi.fn().mockResolvedValue([
      {
        exerciseId: 'ex-squat',
        masteryLevel: 42,
        estimated1RmKg: 180,
        bestWeightKg: 165,
        relativeStrength: 2.1,
        rank: 'A',
      },
    ]),
  },
}));

vi.mock('../../../database/repositories/ExerciseRepository', () => ({
  ExerciseRepository: {
    getAll: vi.fn().mockResolvedValue([
      { id: 'ex-squat', name: 'Barbell Back Squat' },
    ]),
  },
}));

vi.mock('../../../database/repositories/WorkoutRepository', () => ({
  WorkoutRepository: {
    getLifetimeStats: vi.fn().mockResolvedValue({
      totalVolumeKg: 45000,
      totalWorkouts: 84,
    }),
  },
}));

describe('Privacy and Data Isolation Verification', () => {
  const userAId = 'user-alpha';
  const userBId = 'user-bravo';

  const rawUserProfileB = {
    id: userBId,
    auth_id: 'secret-auth-uuid-9999',
    username: 'iron_sentinel',
    display_name: 'Iron Sentinel',
    avatar_url: '🛡️',
    friend_code: 'ASC-IRON-0002',
    global_level: 30,
    rank_tier: 'A',
    rank_division: 1,
    current_streak: 15,
    // Sensitive health & physical metrics in raw profile
    weight_kg: 82.5,
    height_cm: 180,
    age: 28,
    training_preferences: 'Hypertrophy and Powerbuilding',
    limitations: 'Lower back disc herniation L5-S1',
    notes: 'Medical notes: avoid direct heavy spinal compression',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    tables.profiles = [{ ...rawUserProfileB }];
    tables.friendships = [
      { id: 'fr-1', user_id: userAId, friend_id: userBId },
      { id: 'fr-2', user_id: userBId, friend_id: userAId },
    ];
    tables.blocks = [];
    tables.privacy_settings = [
      {
        id: `ps-${userBId}`,
        user_id: userBId,
        profile_visibility: 'FRIENDS',
        feed_visibility_default: 'FRIENDS',
        show_workouts_in_feed: 1,
        show_prs_in_feed: 1,
        show_level_ups_in_feed: 1,
        show_rank_ups_in_feed: 1,
        show_achievements_in_feed: 1,
        show_challenges_in_feed: 1,
        show_evolution_in_feed: 1,
        allow_friend_requests: 1,
        show_mastery_on_profile: 1,
        show_achievements_on_profile: 1,
        show_streak_on_profile: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    tables.activity_feed = [];
    tables.activity_reactions = [];
    tables.user_achievements = [
      { user_id: userBId, achievement_id: 'ach-first-blood', unlocked_at: new Date().toISOString() },
    ];
    tables.user_quests = [
      { user_id: userBId, completed: 1 },
      { user_id: userBId, completed: 1 },
    ];
  });

  describe('1. Public Dossier Data Isolation Guarantees', () => {
    it('User A viewing User B dossier receives public athletic data but ZERO private health biometrics', async () => {
      const dossier = await FriendProfileService.getPublicProfile(userAId, userBId);

      expect(dossier).not.toBeNull();

      // 1. Allowed Public Athletic Fields Present
      expect(dossier?.id).toBe(userBId);
      expect(dossier?.username).toBe('iron_sentinel');
      expect(dossier?.displayName).toBe('Iron Sentinel');
      expect(dossier?.avatarUrl).toBe('🛡️');
      expect(dossier?.friendCode).toBe('ASC-IRON-0002');
      expect(dossier?.globalLevel).toBe(30);
      expect(dossier?.rankTier).toBe('A');
      expect(dossier?.rankDivision).toBe(1);
      expect(dossier?.currentStreak).toBe(15);
      expect(dossier?.relationship).toBe('FRIEND');
      expect(dossier?.evolutionStage?.title).toBe('VANGUARD');
      expect(dossier?.lifetimeTonnageKg).toBe(45000);
      expect(dossier?.totalWorkoutsCompleted).toBe(84);
      expect(dossier?.challengesCompletedCount).toBe(2);
      expect(dossier?.selectedMastery).toHaveLength(1);
      expect(dossier?.selectedMastery?.[0]?.exerciseName).toBe('Barbell Back Squat');

      // 2. STRICT PRIVACY: Private / Health / Biometric fields MUST be completely undefined
      const anyDossier = dossier as any;
      expect(anyDossier.weightKg).toBeUndefined();
      expect(anyDossier.weight_kg).toBeUndefined();
      expect(anyDossier.heightCm).toBeUndefined();
      expect(anyDossier.height_cm).toBeUndefined();
      expect(anyDossier.age).toBeUndefined();
      expect(anyDossier.trainingPreferences).toBeUndefined();
      expect(anyDossier.training_preferences).toBeUndefined();
      expect(anyDossier.limitations).toBeUndefined();
      expect(anyDossier.notes).toBeUndefined();
      expect(anyDossier.medicalNotes).toBeUndefined();
      expect(anyDossier.setLogs).toBeUndefined();
      expect(anyDossier.rawLogs).toBeUndefined();
      expect(anyDossier.nutritionLogs).toBeUndefined();
      expect(anyDossier.authId).toBeUndefined();
      expect(anyDossier.auth_id).toBeUndefined();
    });

    it('Non-friend viewing FRIENDS-only profile receives restricted teaser without mastery or achievements', async () => {
      const strangerId = 'stranger-user';
      const dossier = await FriendProfileService.getPublicProfile(strangerId, userBId);

      expect(dossier).not.toBeNull();
      expect(dossier?.id).toBe(userBId);
      expect(dossier?.relationship).toBe('NONE');
      // Restricted view hides deep athletic stats
      expect(dossier?.selectedMastery).toHaveLength(0);
      expect(dossier?.selectedAchievements).toHaveLength(0);
      expect(dossier?.challengesCompletedCount).toBe(0);
    });

    it('Hiding specific profile components via privacy toggles hides them from dossier', async () => {
      // User B disables mastery and streak on profile
      tables.privacy_settings[0].show_mastery_on_profile = 0;
      tables.privacy_settings[0].show_streak_on_profile = 0;

      const dossier = await FriendProfileService.getPublicProfile(userAId, userBId);
      expect(dossier).not.toBeNull();
      expect(dossier?.selectedMastery).toHaveLength(0);
      expect(dossier?.currentStreak).toBeUndefined();
      expect(dossier?.selectedAchievements.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('2. Metadata Sanitizer: Zero Health Leakage into Social Feed', () => {
    it('strips all sensitive biometrics, heart rate, notes, injuries, and raw logs from metadata', () => {
      const dirtyMetadata: ActivityFeedMetadata & Record<string, any> = {
        // Allowed public fields
        durationMinutes: 52,
        totalVolumeKg: 8500,
        exerciseCount: 5,
        primaryExercises: ['Deadlift', 'Overhead Press', 'Pullups'],
        prExerciseName: 'Deadlift',
        prType: 'MAX_WEIGHT',
        prValue: 210,
        // Sensitive private health/biometrics fields
        heartRate: 172,
        restingHeartRate: 58,
        caloriesBurned: 480,
        bodyweight: 81.2,
        injuryNotes: 'Aggravated rotator cuff on last set',
        privateNotes: 'Felt tired, didn’t sleep well',
        rawSetLogs: [
          { set: 1, weight: 140, reps: 5, rpe: 8 },
          { set: 2, weight: 180, reps: 3, rpe: 9 },
        ],
        bloodPressure: '120/80',
        supplementation: 'Creatine 5g, Preworkout 200mg caffeine',
      };

      const clean = SocialFeedService.sanitizeMetadata(dirtyMetadata);

      // Public athletic telemetry is preserved
      expect(clean.durationMinutes).toBe(52);
      expect(clean.totalVolumeKg).toBe(8500);
      expect(clean.exerciseCount).toBe(5);
      expect(clean.primaryExercises).toEqual(['Deadlift', 'Overhead Press', 'Pullups']);
      expect(clean.prExerciseName).toBe('Deadlift');
      expect(clean.prValue).toBe(210);

      // Sensitive fields are completely purged
      const anyClean = clean as any;
      expect(anyClean.heartRate).toBeUndefined();
      expect(anyClean.restingHeartRate).toBeUndefined();
      expect(anyClean.caloriesBurned).toBeUndefined();
      expect(anyClean.bodyweight).toBeUndefined();
      expect(anyClean.injuryNotes).toBeUndefined();
      expect(anyClean.privateNotes).toBeUndefined();
      expect(anyClean.rawSetLogs).toBeUndefined();
      expect(anyClean.bloodPressure).toBeUndefined();
      expect(anyClean.supplementation).toBeUndefined();
    });
  });

  describe('3. Event Publication Privacy Gating', () => {
    it('honors showWorkoutsInFeed toggle (when false, event is suppressed)', async () => {
      // When enabled:
      tables.privacy_settings[0].show_workouts_in_feed = 1;
      const allowedItem = await SocialFeedService.publishEvent(userBId, {
        eventType: 'WORKOUT_COMPLETED',
        title: 'Morning Push Session Completed',
        summary: 'Crushed 5 exercises with 8,500 kg total volume',
        metadata: { durationMinutes: 45, totalVolumeKg: 8500, exerciseCount: 5 },
      });
      expect(allowedItem).not.toBeNull();
      expect(allowedItem?.eventType).toBe('WORKOUT_COMPLETED');

      // When disabled:
      tables.privacy_settings[0].show_workouts_in_feed = 0;
      const suppressedItem = await SocialFeedService.publishEvent(userBId, {
        eventType: 'WORKOUT_COMPLETED',
        title: 'Evening Pull Session Completed',
        summary: 'Crushed 6 exercises',
        metadata: { durationMinutes: 50 },
      });
      expect(suppressedItem).toBeNull();
    });

    it('honors showPrsInFeed toggle', async () => {
      tables.privacy_settings[0].show_prs_in_feed = 0;
      const prItem = await SocialFeedService.publishEvent(userBId, {
        eventType: 'PR_ACHIEVED',
        title: 'NEW PR: Barbell Back Squat',
        summary: 'Hit 180 kg',
        metadata: { prExerciseName: 'Barbell Back Squat', prValue: 180 },
      });
      expect(prItem).toBeNull();
    });

    it('honors showAchievementsInFeed toggle', async () => {
      tables.privacy_settings[0].show_achievements_in_feed = 0;
      const achItem = await SocialFeedService.publishEvent(userBId, {
        eventType: 'ACHIEVEMENT_UNLOCKED',
        title: 'Achievement Unlocked: Iron Vanguard',
        summary: 'Completed 50 workouts',
        metadata: { achievementTitle: 'Iron Vanguard' },
      });
      expect(achItem).toBeNull();
    });

    it('honors showLevelUpsInFeed toggle for LEVEL_UP and RANK_UP', async () => {
      tables.privacy_settings[0].show_level_ups_in_feed = 0;
      const lvlItem = await SocialFeedService.publishEvent(userBId, {
        eventType: 'LEVEL_UP',
        title: 'Level Up: Level 31',
        summary: 'Reached level 31',
        metadata: { oldLevel: 30, newLevel: 31 },
      });
      expect(lvlItem).toBeNull();
    });

    it('honors showChallengesInFeed and showEvolutionInFeed toggles', async () => {
      tables.privacy_settings[0].show_challenges_in_feed = 0;
      const challengeItem = await SocialFeedService.publishEvent(userBId, {
        eventType: 'CHALLENGE_COMPLETED',
        title: 'Challenge Completed: Heavy Artillery',
        summary: 'Logged 10,000kg in bench press',
      });
      expect(challengeItem).toBeNull();

      tables.privacy_settings[0].show_evolution_in_feed = 0;
      const evoItem = await SocialFeedService.publishEvent(userBId, {
        eventType: 'CHARACTER_EVOLUTION',
        title: 'Operative Evolved: WARLORD',
        summary: 'Ascended to Stage 4',
      });
      expect(evoItem).toBeNull();
    });
  });
});
