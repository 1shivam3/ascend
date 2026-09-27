import { create } from 'zustand';
import { StepSensorStatus } from '../services/step/types';
import { StepCounterService } from '../services/step/StepCounterService';
import { useAuthStore } from './useAuthStore';

interface StepStoreState {
  todaySteps: number;
  stepGoal: number;
  sensorStatus: StepSensorStatus;
  lastUpdatedAt: string | null;
  progressPercent: number;

  initialize: (userId: string) => Promise<void>;
  refreshSteps: (userId?: string) => Promise<void>;
  requestPermission: (userId?: string) => Promise<boolean>;
  setStepGoal: (goal: number, userId?: string) => Promise<void>;
}

export const useStepStore = create<StepStoreState>((set, get) => ({
  todaySteps: 0,
  stepGoal: 10000,
  sensorStatus: 'INITIALIZING',
  lastUpdatedAt: null,
  progressPercent: 0,

  initialize: async (userId: string) => {
    try {
      const state = await StepCounterService.initialize(userId);
      const progressPercent = Math.min(
        100,
        Math.round((state.todaySteps / Math.max(1, state.stepGoal)) * 100)
      );

      set({
        todaySteps: state.todaySteps,
        stepGoal: state.stepGoal,
        sensorStatus: state.status,
        lastUpdatedAt: state.lastUpdatedAt,
        progressPercent,
      });
    } catch (err) {
      console.warn('[useStepStore] Failed to initialize step counter:', err);
      set({ sensorStatus: 'UNAVAILABLE' });
    }
  },

  refreshSteps: async (overrideUserId?: string) => {
    const userId = overrideUserId || useAuthStore.getState().userId;
    if (!userId) return;

    try {
      const state = await StepCounterService.refreshSteps(userId);
      const progressPercent = Math.min(
        100,
        Math.round((state.todaySteps / Math.max(1, state.stepGoal)) * 100)
      );

      set({
        todaySteps: state.todaySteps,
        stepGoal: state.stepGoal,
        sensorStatus: state.status,
        lastUpdatedAt: state.lastUpdatedAt,
        progressPercent,
      });
    } catch (err) {
      console.warn('[useStepStore] Failed to refresh steps:', err);
    }
  },

  requestPermission: async (overrideUserId?: string) => {
    const userId = overrideUserId || useAuthStore.getState().userId;
    if (!userId) return false;

    try {
      const granted = await StepCounterService.requestPermission(userId);
      await get().refreshSteps(userId);
      return granted;
    } catch (err) {
      console.warn('[useStepStore] Failed to request permission:', err);
      return false;
    }
  },

  setStepGoal: async (goal: number, overrideUserId?: string) => {
    const userId = overrideUserId || useAuthStore.getState().userId;
    if (!userId) return;

    const { todaySteps } = get();
    const progressPercent = Math.min(
      100,
      Math.round((todaySteps / Math.max(1, goal)) * 100)
    );

    set({ stepGoal: goal, progressPercent });
    await StepCounterService.updateStepGoal(userId, goal);
  },
}));
