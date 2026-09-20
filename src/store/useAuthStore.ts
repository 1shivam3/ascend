import { create } from 'zustand';
import { UserProfile, CharacterAttributes, EquipmentTier } from '../types/domain.types';
import { ProfileRepository } from '../database/repositories/ProfileRepository';
import { DEFAULT_USER_ID } from '../database/migrations/init';
import { OnboardingData, normalizeGoal } from '../utils/validation/onboardingSchema';
import { AuthService } from '../services/auth/AuthService';
import { getDatabase } from '../database/sqlite';

interface AuthState {
  userId: string;
  profile: UserProfile | null;
  isGuest: boolean;
  isLoading: boolean;
  onboardingDraft: Partial<OnboardingData>;
  updateOnboardingDraft: (partial: Partial<OnboardingData>) => void;
  loadProfile: (userId?: string) => Promise<UserProfile | null>;
  setProfile: (profile: UserProfile) => void;
  completeOnboarding: (data: OnboardingData) => Promise<UserProfile>;
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
  } else if (normalized === 'ENDURANCE') {
    stamina += 7;
    agility += 3;
  } else if (normalized === 'LOSE_FAT') {
    stamina += 4;
    discipline += 4;
  } else if (normalized === 'CALISTHENICS') {
    agility += 7;
    strength += 4;
  } else if (normalized === 'SPORT_PERFORMANCE') {
    agility += 5;
    stamina += 5;
    strength += 3;
  } else if (normalized === 'GENERAL_FITNESS') {
    strength += 3;
    stamina += 3;
    agility += 3;
    vitality += 3;
  } else if (normalized === 'CUSTOM') {
    strength += 3;
    stamina += 3;
    agility += 3;
    discipline += 3;
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
    agility: Math.min(100, agility),
    consistency: Math.min(100, discipline),
    stamina: Math.min(100, stamina),
    discipline: Math.min(100, discipline),
    vitality: Math.min(100, vitality),
  };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  userId: DEFAULT_USER_ID,
  profile: null,
  isGuest: true,
  isLoading: false,
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

  loadProfile: async (userId: string = DEFAULT_USER_ID) => {
    set({ isLoading: true, userId });
    try {
      const profile = await ProfileRepository.getProfile(userId);
      set({
        profile,
        isGuest: profile ? profile.isGuest : true,
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
      isGuest: true,
      onboardingDraft: {},
    });

    return profile;
  },

  linkAuthenticatedAccount: async (authId: string, email: string): Promise<void> => {
    const { userId } = get();
    await AuthService.migrateGuestData(userId, { id: authId, email });
    const updated = await ProfileRepository.getProfile(authId);
    if (updated) {
      set({
        userId: authId,
        profile: updated,
        isGuest: false,
      });
    }
  },

  signOut: async () => {
    await AuthService.signOut();
    // After sign out, load default profile
    const profile = await ProfileRepository.getProfile(DEFAULT_USER_ID);
    set({
      userId: DEFAULT_USER_ID,
      profile,
      isGuest: true,
    });
  },

  resetOnboardingForTesting: async () => {
    const { userId } = get();
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE profiles SET onboarding_completed = 0 WHERE id = ?;`,
      [userId]
    );
    const profile = await ProfileRepository.getProfile(userId);
    set({ profile });
  },
}));
