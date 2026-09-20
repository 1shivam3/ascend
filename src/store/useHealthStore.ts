import { create } from 'zustand';
import {
  HealthPermission,
  HealthConnectSdkStatus,
  HealthDailySummary,
} from '../types/health.types';
import { HealthIntegrationService } from '../services/health/HealthIntegrationService';
import { HealthRepository } from '../database/repositories/HealthRepository';

interface HealthState {
  isConnected: boolean;
  sdkStatus: HealthConnectSdkStatus;
  grantedPermissions: HealthPermission[];
  isSyncing: boolean;
  lastSyncTime: string | null;
  todaySummary: HealthDailySummary | null;
  isModalVisible: boolean;

  // Actions
  checkStatus: (userId: string) => Promise<void>;
  connect: (userId: string, permissions: HealthPermission[]) => Promise<boolean>;
  disconnect: (userId: string) => Promise<void>;
  sync: (userId: string) => Promise<void>;
  openModal: () => void;
  closeModal: () => void;
}

export const useHealthStore = create<HealthState>((set, get) => ({
  isConnected: false,
  sdkStatus: 'UNAVAILABLE',
  grantedPermissions: [],
  isSyncing: false,
  lastSyncTime: null,
  todaySummary: null,
  isModalVisible: false,

  checkStatus: async (userId: string) => {
    try {
      const sdkStatus = await HealthIntegrationService.checkSdkStatus();
      const syncState = await HealthRepository.getSyncState(userId);

      const isConnected = Boolean(syncState?.isConnected);
      const grantedPermissions = syncState?.grantedPermissions || [];
      const lastSyncTime = syncState?.lastSyncTime || null;

      let todaySummary = null;
      if (isConnected) {
        todaySummary = await HealthIntegrationService.getDailySummary(userId);
      }

      set({
        sdkStatus,
        isConnected,
        grantedPermissions,
        lastSyncTime,
        todaySummary,
      });
    } catch (err) {
      console.warn('[useHealthStore] Failed to check health status:', err);
    }
  },

  connect: async (userId: string, permissions: HealthPermission[]) => {
    try {
      const granted = await HealthIntegrationService.connect(userId, permissions);
      const isConnected = granted.length > 0;
      set({
        isConnected,
        grantedPermissions: granted,
        isModalVisible: false,
      });

      if (isConnected) {
        await get().sync(userId);
      }
      return isConnected;
    } catch (err) {
      console.error('[useHealthStore] Connection failed:', err);
      return false;
    }
  },

  disconnect: async (userId: string) => {
    try {
      await HealthIntegrationService.disconnect(userId);
      set({
        isConnected: false,
        grantedPermissions: [],
        lastSyncTime: null,
        todaySummary: null,
      });
    } catch (err) {
      console.error('[useHealthStore] Disconnect failed:', err);
    }
  },

  sync: async (userId: string) => {
    if (get().isSyncing) return;
    set({ isSyncing: true });

    try {
      await HealthIntegrationService.sync(userId);
      const todaySummary = await HealthIntegrationService.getDailySummary(userId);
      set({
        todaySummary,
        lastSyncTime: new Date().toISOString(),
        isSyncing: false,
      });
    } catch (err) {
      console.warn('[useHealthStore] Health sync warning:', err);
      set({ isSyncing: false });
    }
  },

  openModal: () => set({ isModalVisible: true }),
  closeModal: () => set({ isModalVisible: false }),
}));
