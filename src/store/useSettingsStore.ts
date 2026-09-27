import { create } from 'zustand';
import { UserSettings, ThemeMode } from '../types/domain.types';
import { ProfileRepository } from '../database/repositories/ProfileRepository';
import { DEFAULT_USER_ID } from '../database/migrations/init';

interface SettingsState {
  settings: UserSettings;
  isLoading: boolean;
  loadSettings: (userId?: string) => Promise<void>;
  setUnit: (unit: 'kg' | 'lbs') => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  toggleSound: () => void;
  toggleHaptics: () => void;
  setDefaultRestSeconds: (seconds: number) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {
    userId: '',
    preferredUnit: 'kg',
    soundEnabled: true,
    hapticsEnabled: true,
    defaultRestSeconds: 90,
    pushNotificationsEnabled: true,
    streakFreezeAutoUse: true,
    themeMode: 'light',
  },
  isLoading: false,

  loadSettings: async (userId?: string) => {
    const targetUserId = userId || get().settings.userId || DEFAULT_USER_ID;
    if (!targetUserId) return;
    set({ isLoading: true });
    try {
      const stored = await ProfileRepository.getSettings(targetUserId);
      if (stored) {
        set({ settings: stored, isLoading: false });
      } else {
        set((state) => ({
          settings: { ...state.settings, userId: targetUserId },
          isLoading: false,
        }));
      }
    } catch {
      set({ isLoading: false });
    }
  },

  setUnit: async (unit: 'kg' | 'lbs') => {
    const { settings } = get();
    const updated = { ...settings, preferredUnit: unit };
    set({ settings: updated });
    if (settings.userId) {
      await ProfileRepository.updateUnit(settings.userId, unit);
    }
  },

  setThemeMode: async (mode: ThemeMode) => {
    const { settings } = get();
    const updated = { ...settings, themeMode: mode };
    set({ settings: updated });
    if (settings.userId) {
      await ProfileRepository.updateThemeMode(settings.userId, mode);
    }
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
