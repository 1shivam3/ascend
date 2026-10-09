'use client';

import { useState, useEffect } from 'react';
import { syncEngine, SyncStatus } from './sync';

export function useSupabaseSync() {
  const [state, setState] = useState<{
    status: SyncStatus;
    lastSyncedAt: string | null;
    error: string | null;
  }>(syncEngine.getStatus());

  useEffect(() => {
    syncEngine.init();
    const unsubscribe = syncEngine.subscribe((status, lastSyncedAt, error) => {
      setState({ status, lastSyncedAt, error });
    });
    return () => unsubscribe();
  }, []);

  return {
    ...state,
    syncNow: () => syncEngine.triggerSyncNow(),
  };
}
