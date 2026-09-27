import { create } from 'zustand';
import { UserProfile, CharacterAttributes, EquipmentTier } from '../types/domain.types';
import { AvatarConfig } from '../types/avatar.types';
import { ProfileRepository } from '../database/repositories/ProfileRepository';
import { DEFAULT_USER_ID } from '../database/migrations/init';
import { OnboardingData, normalizeGoal } from '../utils/validation/onboardingSchema';
import { AuthService } from '../services/auth/AuthService';
import { getDatabase } from '../database/sqlite';
import { supabase } from '../lib/supabase';

interface AuthState {
  userId: string;
  profile: UserProfile | null;
  session: any | null;
  isAuthenticated: boolean;
  isGuest: boolean;
  isLoading: boolean;
  onboardingDraft: Partial<OnboardingData>;
  updateOnboardingDraft: (partial: Partial<OnboardingData>) => void;
  initializeAuth: () => Promise<void>;
  setSessionUser: (userId: string, email?: string) => Promise<void>;
  loadProfile: (userId?: string) => Promise<UserProfile | null>;
  setProfile: (profile: UserProfile) => void;
  completeOnboarding: (data: OnboardingData) => Promise<UserProfile>;
  updateAvatarConfig: (config: AvatarConfig) => Promise<void>;
  linkAuthenticatedAccount: (authId: string, email: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetOnboardingForTesting: () => Promise<void>;
}

export function calculateStartingAttributes(
  goal: string,
  experience: string,
  daysPerWeek: number,
  weightKg: number
): CharacterAttributes {
  // Balanced realistic baseline (12 - 25 out of 100)
  let strength = 12;
  let stamina = 12;
  let agility = 12;
  let discipline = 12;
  let vitality = 14;
  let mobility = 12;

  const normalized = normalizeGoal(goal);

  // Goal modifiers
  if (normalized === 'GET_STRONGER') {
    strength += 6;
    discipline += 3;
  } else if (normalized === 'BUILD_MUSCLE') {
    strength += 4;
    vitality += 4;
  } else if (normalized === 'ATHLETIC_PERFORMANCE') {
    agility += 6;
    stamina += 4;
    mobility += 4;
  } else if (normalized === 'MOBILITY') {
    mobility += 8;
    vitality += 3;
  } else if (normalized === 'ENDURANCE') {
    stamina += 7;
    agility += 3;
  } else if (normalized === 'LOSE_FAT') {
    stamina += 4;
    discipline += 4;
  } else if (normalized === 'CALISTHENICS') {
    agility += 7;
    strength += 4;
    mobility += 4;
  } else if (normalized === 'SPORT_PERFORMANCE') {
    agility += 5;
    stamina += 5;
    strength += 3;
    mobility += 3;
  } else if (normalized === 'GENERAL_FITNESS') {
    strength += 3;
    stamina += 3;
    agility += 3;
    vitality += 3;
    mobility += 3;
  } else if (normalized === 'CUSTOM') {
    strength += 3;
    stamina += 3;
    agility += 3;
    discipline += 3;
    mobility += 3;
  }

  // Experience modifiers
  if (experience === 'INTERMEDIATE') {
    strength += 3;
    discipline += 3;
    vitality += 2;
  } else if (experience === 'ADVANCED') {
    strength += 6;
    discipline += 6;
    vitality += 4;
  } else if (experience === 'ELITE') {
    strength += 9;
    discipline += 9;
    vitality += 6;
  }

  // Frequency modifiers
  discipline += Math.min(daysPerWeek, 6);

  // Bodyweight modifier (heavier lifters get slightly higher base strength/vitality)
  if (weightKg >= 85) {
    strength += 2;
    vitality += 2;
  }

  return {
    strength: Math.min(100, strength),
    endurance: Math.min(100, stamina),
    mobility: Math.min(100, mobility),
    consistency: Math.min(100, discipline),
    agility: Math.min(100, agility),
    stamina: Math.min(100, stamina),
    discipline: Math.min(100, discipline),
    vitality: Math.min(100, vitality),
  };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  userId: '',
  profile: null,
  session: null,
  isAuthenticated: false,
  isGuest: false,
  isLoading: true,
  onboardingDraft: {
    goal: 'BUILD_STRENGTH',
    age: 25,
    heightCm: 175,
    weightKg: 75,
    experience: 'INTERMEDIATE',
    daysPerWeek: 4,
    sessionDurationMinutes: 60,
    equipment: ['BARBELL', 'DUMBBELL', 'CABLE', 'MACHINE', 'BODYWEIGHT'],
    trainingLocation: 'COMMERCIAL_GYM',
    preferredExerciseIds: [],
    excludedExerciseIds: [],
    limitations: [],
    username: '',
    avatarUrl: '⚔️',
  },

  updateOnboardingDraft: (partial: Partial<OnboardingData>) => {
    set(state => ({
      onboardingDraft: {
        ...state.onboardingDraft,
        ...partial,
      },
    }));
  },

  initializeAuth: async () => {
    set({ isLoading: true });
    try {
      const session = await AuthService.getCurrentSession();
      if (session?.user) {
        const authUserId = session.user.id;
        const email = session.user.email;

        // Check if legacy guest user exists in SQLite and safely migrate it
        try {
          const legacyProfile = await ProfileRepository.getProfile(DEFAULT_USER_ID);
          if (legacyProfile && DEFAULT_USER_ID !== authUserId) {
            await ProfileRepository.migrateGuestUser(DEFAULT_USER_ID, authUserId, email);
          }
        } catch {
          // No legacy profile to migrate
        }

        let profile = await ProfileRepository.getProfile(authUserId);
        if (!profile) {
          profile = await ProfileRepository.createOrUpdateProfile({
            id: authUserId,
            username: email?.split('@')[0] || 'Vanguard_Operative',
            displayName: email?.split('@')[0] || 'Vanguard Operative',
            avatarUrl: '⚔️',
            avatarConfig: null,
            goal: 'GET_STRONGER',
            primaryGoal: 'GET_STRONGER',
            primary_goal: 'GET_STRONGER',
            secondaryGoals: [],
            secondary_goals: [],
            experience: 'INTERMEDIATE',
            age: 25,
            heightCm: 175,
            weightKg: 75,
            trainingPreferences: {
              daysPerWeek: 4,
              sessionDurationMinutes: 60,
              equipment: ['BARBELL', 'DUMBBELL', 'CABLE', 'MACHINE', 'BODYWEIGHT'],
              trainingLocation: 'COMMERCIAL_GYM',
              preferredExerciseIds: [],
              excludedExerciseIds: [],
              limitations: [],
            },
            globalLevel: 1,
            totalXp: 0,
            rankTier: 'E',
            rankDivision: 4,
            attributes: {
              strength: 10,
              endurance: 10,
              agility: 10,
              consistency: 10,
              stamina: 10,
              discipline: 10,
              vitality: 10,
              mobility: 10,
            },
            currentStreak: 0,
            longestStreak: 0,
            streakFreezeTokens: 1,
            lastWorkoutDate: null,
            isGuest: false,
            onboardingCompleted: false,
            authId: authUserId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as UserProfile);
        }

        set({
          userId: authUserId,
          profile,
          session,
          isAuthenticated: true,
          isGuest: false,
          isLoading: false,
        });
      } else {
        set({
          userId: '',
          profile: null,
          session: null,
          isAuthenticated: false,
          isGuest: false,
          isLoading: false,
        });
      }
    } catch (err) {
      console.error('Failed to initialize auth session:', err);
      set({
        userId: '',
        profile: null,
        session: null,
        isAuthenticated: false,
        isGuest: false,
        isLoading: false,
      });
    }
  },

  setSessionUser: async (userId: string, email?: string) => {
    set({ isLoading: true });
    try {
      // Migrate legacy guest if exists
      try {
        const legacyProfile = await ProfileRepository.getProfile(DEFAULT_USER_ID);
        if (legacyProfile && DEFAULT_USER_ID !== userId) {
          await ProfileRepository.migrateGuestUser(DEFAULT_USER_ID, userId, email);
        }
      } catch {
        // Safe to ignore
      }

      let profile = await ProfileRepository.getProfile(userId);
      if (!profile) {
        profile = await ProfileRepository.createOrUpdateProfile({
          id: userId,
          username: email?.split('@')[0] || 'Vanguard_Operative',
          displayName: email?.split('@')[0] || 'Vanguard Operative',
          avatarUrl: '⚔️',
          avatarConfig: null,
          goal: 'GET_STRONGER',
          primaryGoal: 'GET_STRONGER',
          primary_goal: 'GET_STRONGER',
          secondaryGoals: [],
          secondary_goals: [],
          experience: 'INTERMEDIATE',
          age: 25,
          heightCm: 175,
          weightKg: 75,
          trainingPreferences: {
            daysPerWeek: 4,
            sessionDurationMinutes: 60,
            equipment: ['BARBELL', 'DUMBBELL', 'CABLE', 'MACHINE', 'BODYWEIGHT'],
            trainingLocation: 'COMMERCIAL_GYM',
            preferredExerciseIds: [],
            excludedExerciseIds: [],
            limitations: [],
          },
          globalLevel: 1,
          totalXp: 0,
          rankTier: 'E',
          rankDivision: 4,
          attributes: {
            strength: 10,
            endurance: 10,
            agility: 10,
            consistency: 10,
            stamina: 10,
            discipline: 10,
            vitality: 10,
            mobility: 10,
          },
          currentStreak: 0,
          longestStreak: 0,
          streakFreezeTokens: 1,
          lastWorkoutDate: null,
          isGuest: false,
          onboardingCompleted: false,
          authId: userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as UserProfile);
      }

      const session = await AuthService.getCurrentSession();

      set({
        userId,
        profile,
        session,
        isAuthenticated: true,
        isGuest: false,
        isLoading: false,
      });
    } catch (err) {
      console.error('Failed to set session user:', err);
      set({ isLoading: false });
    }
  },

  loadProfile: async (userId?: string) => {
    const targetUserId = userId || get().userId;
    if (!targetUserId) {
      set({ isLoading: false, profile: null, isAuthenticated: false });
      return null;
    }

    set({ isLoading: true, userId: targetUserId });
    try {
      const profile = await ProfileRepository.getProfile(targetUserId);
      set({
        profile,
        isAuthenticated: Boolean(profile),
        isGuest: profile ? profile.isGuest : false,
        isLoading: false,
      });
      return profile;
    } catch {
      set({ isLoading: false });
      return null;
    }
  },

  setProfile: (profile: UserProfile) => {
    set({
      profile,
      userId: profile.id,
      isAuthenticated: true,
      isGuest: profile.isGuest,
    });
  },

  completeOnboarding: async (data: OnboardingData): Promise<UserProfile> => {
    const { userId } = get();
    const attributes = calculateStartingAttributes(
      data.goal,
      data.experience,
      data.daysPerWeek,
      data.weightKg
    );

    const primaryGoal = data.primary_goal || data.primaryGoal || normalizeGoal(data.goal);
    const secondaryGoals = data.secondary_goals || data.secondaryGoals || [];

    const profile = await ProfileRepository.completeOnboarding(userId, {
      username: data.username,
      displayName: data.username,
      avatarUrl: data.avatarUrl || '⚔️',
      avatarConfig: data.avatarConfig,
      goal: data.goal,
      primaryGoal,
      primary_goal: primaryGoal,
      secondaryGoals,
      secondary_goals: secondaryGoals,
      experience: data.experience,
      age: data.age,
      heightCm: data.heightCm,
      weightKg: data.weightKg,
      trainingPreferences: {
        daysPerWeek: data.daysPerWeek,
        sessionDurationMinutes: data.sessionDurationMinutes,
        equipment: data.equipment as EquipmentTier[],
        trainingLocation: data.trainingLocation,
        preferredExerciseIds: data.preferredExerciseIds,
        excludedExerciseIds: data.excludedExerciseIds,
        limitations: data.limitations,
        customGoalDescription: data.customGoalDescription,
        sportName: data.sportName,
      },
      attributes,
    });

    // Create a personalized starter workout plan
    try {
      const db = await getDatabase();
      const now = new Date().toISOString();
      const planId = 'plan-' + Date.now();

      let goalTitle = 'Strength Vanguard';
      if (primaryGoal === 'BUILD_MUSCLE') goalTitle = 'Hypertrophy Forge';
      else if (primaryGoal === 'ATHLETIC_PERFORMANCE') goalTitle = 'Athletic Power Split';
      else if (primaryGoal === 'ENDURANCE') goalTitle = 'Endurance Engine';
      else if (primaryGoal === 'CALISTHENICS') goalTitle = 'Calisthenics Mastery';
      else if (primaryGoal === 'GENERAL_FITNESS') goalTitle = 'Balanced Conditioning';
      else if (primaryGoal === 'SPORT_PERFORMANCE') goalTitle = `${data.sportName || 'Athletic'} Performance`;
      else if (primaryGoal === 'LOSE_FAT') goalTitle = 'Metabolic Conditioning';
      else if (primaryGoal === 'CUSTOM') goalTitle = 'Custom Ascent Split';

      const splitName = `${data.daysPerWeek}-Day ${goalTitle}`;

      await db.runAsync(
        `INSERT OR REPLACE INTO workout_plans (
          id, user_id, name, description, split_type, days_per_week, is_active, schedule_metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?);`,
        [
          planId,
          userId,
          splitName,
          `Customized ${data.daysPerWeek}-day training split generated for ${data.username}`,
          data.daysPerWeek >= 4 ? 'UPPER_LOWER' : 'FULL_BODY',
          data.daysPerWeek,
          JSON.stringify({ goal: primaryGoal, secondaryGoals, durationMin: data.sessionDurationMinutes }),
          now,
          now,
        ]
      );
    } catch (e) {
      console.warn('Could not seed initial workout plan:', e);
    }

    set({
      profile,
      userId: profile.id,
      isAuthenticated: true,
      isGuest: false,
      onboardingDraft: {},
    });

    return profile;
  },

  updateAvatarConfig: async (config: AvatarConfig) => {
    const { userId, profile } = get();
    await ProfileRepository.updateAvatarConfig(userId, config);
    if (profile) {
      set({ profile: { ...profile, avatarConfig: config } });
    }
  },

  linkAuthenticatedAccount: async (authId: string, email: string): Promise<void> => {
    const { userId } = get();
    await AuthService.migrateGuestData(userId, { id: authId, email });
    const updated = await ProfileRepository.getProfile(authId);
    if (updated) {
      set({
        userId: authId,
        profile: updated,
        isAuthenticated: true,
        isGuest: false,
      });
    }
  },

  signOut: async () => {
    set({ isLoading: true });
    try {
      await AuthService.signOut();
    } catch (err) {
      console.warn('Sign-out warning:', err);
    }
    set({
      userId: '',
      profile: null,
      session: null,
      isAuthenticated: false,
      isGuest: false,
      isLoading: false,
    });
  },

  resetOnboardingForTesting: async () => {
    const { userId } = get();
    if (!userId) return;
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE profiles SET onboarding_completed = 0 WHERE id = ?;`,
      [userId]
    );
    const profile = await ProfileRepository.getProfile(userId);
    set({ profile });
  },
}));
