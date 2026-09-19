import { create } from 'zustand';
import { UserSettings } from '../types/domain.types';
import { ProfileRepository } from '../database/repositories/ProfileRepository';
import { DEFAULT_USER_ID } from '../database/migrations/init';

interface SettingsState {
  settings: UserSettings;
  isLoading: boolean;
  loadSettings: (userId?: string) => Promise<void>;
  setUnit: (unit: 'kg' | 'lbs') => Promise<void>;
  toggleSound: () => void;
  toggleHaptics: () => void;
  setDefaultRestSeconds: (seconds: number) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {
    userId: DEFAULT_USER_ID,
    preferredUnit: 'kg',
    soundEnabled: true,
    hapticsEnabled: true,
    defaultRestSeconds: 90,
    pushNotificationsEnabled: true,
    streakFreezeAutoUse: true,
  },
  isLoading: false,

  loadSettings: async (userId: string = DEFAULT_USER_ID) => {
    set({ isLoading: true });
    try {
      const stored = await ProfileRepository.getSettings(userId);
      if (stored) {
        set({ settings: stored, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  setUnit: async (unit: 'kg' | 'lbs') => {
    const { settings } = get();
    const updated = { ...settings, preferredUnit: unit };
    set({ settings: updated });
    await ProfileRepository.updateUnit(settings.userId, unit);
  },

  toggleSound: () => {
    const { settings } = get();
    set({ settings: { ...settings, soundEnabled: !settings.soundEnabled } });
  },

  toggleHaptics: () => {
    const { settings } = get();
    set({ settings: { ...settings, hapticsEnabled: !settings.hapticsEnabled } });
  },

  setDefaultRestSeconds: (seconds: number) => {
    const { settings } = get();
    set({ settings: { ...settings, defaultRestSeconds: seconds } });
  },
}));
