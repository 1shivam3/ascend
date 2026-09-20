import { create } from 'zustand';
import { SyncQueueStats } from '../database/repositories/SyncQueueRepository';

export type SyncStatus = 'IDLE' | 'SYNCING' | 'OFFLINE' | 'PAUSED' | 'ERROR';

interface SyncStoreState {
  status: SyncStatus;
  pendingCount: number;
  inFlightCount: number;
  failedCount: number;
  lastSyncAt: string | null;
  lastError: string | null;

  // Actions
  setStatus: (status: SyncStatus, error?: string | null) => void;
  updateStats: (stats: SyncQueueStats) => void;
  setLastSyncAt: (timestamp: string) => void;
  reset: () => void;
}

const initialState = {
  status: 'IDLE' as SyncStatus,
  pendingCount: 0,
  inFlightCount: 0,
  failedCount: 0,
  lastSyncAt: null,
  lastError: null,
};

export const useSyncStore = create<SyncStoreState>((set) => ({
  ...initialState,

  setStatus: (status, error = null) => set({ status, lastError: error }),
  updateStats: (stats) =>
    set({
      pendingCount: stats.pending,
      inFlightCount: stats.inFlight,
      failedCount: stats.failed,
    }),
  setLastSyncAt: (timestamp) => set({ lastSyncAt: timestamp }),
  reset: () => set(initialState),
}));
