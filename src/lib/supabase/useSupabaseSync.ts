'use client';

import { useState, useEffect } from 'react';
import { syncEngine, SyncStatus, AuthUser } from './sync';

export function useSupabaseSync() {
  const [state, setState] = useState<{
    status: SyncStatus;
    lastSyncedAt: string | null;
    error: string | null;
    user: AuthUser | null;
  }>(syncEngine.getStatus());

  useEffect(() => {
    syncEngine.init();
    const unsubscribe = syncEngine.subscribe((status, lastSyncedAt, error, user) => {
      setState({ status, lastSyncedAt, error, user });
    });
    return () => unsubscribe();
  }, []);

  return {
    ...state,
    syncNow: () => syncEngine.triggerSyncNow(),
    signInWithGoogle: () => syncEngine.signInWithGoogle(),
    sendEmailOtp: (email: string) => syncEngine.sendEmailOtp(email),
    verifyEmailOtp: (email: string, token: string) => syncEngine.verifyEmailOtp(email, token),
    signOut: () => syncEngine.signOut(),
  };
}
