import { create } from 'zustand';
import { UserProfile } from '../types/domain.types';
import { ProfileRepository } from '../database/repositories/ProfileRepository';
import { DEFAULT_USER_ID } from '../database/migrations/init';

interface AuthState {
  userId: string;
  profile: UserProfile | null;
  isLoading: boolean;
  loadProfile: (userId?: string) => Promise<UserProfile | null>;
  setProfile: (profile: UserProfile) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  userId: DEFAULT_USER_ID,
  profile: null,
  isLoading: false,

  loadProfile: async (userId: string = DEFAULT_USER_ID) => {
    set({ isLoading: true, userId });
    try {
      const profile = await ProfileRepository.getProfile(userId);
      set({ profile, isLoading: false });
      return profile;
    } catch {
      set({ isLoading: false });
      return null;
    }
  },

  setProfile: (profile: UserProfile) => {
    set({ profile, userId: profile.id });
  },
}));
