'use client';

import { useState, useEffect } from 'react';
import { syncEngine, SyncStatus, AuthUser } from './sync';

export function useSupabaseSync() {
  const [state, setState] = useState<{
    status: SyncStatus;
    lastSyncedAt: string | null;
    error: string | null;
    user: AuthUser | null;
    /** Phase 2: true when coach_blocks/weekly_reviews do not exist yet
     *  (migration not run) — surfaced to the UI as "coach sync pending
     *  setup", never as a whole-sync error. */
    coachSyncPendingSetup: boolean;
  }>(syncEngine.getStatus());

  useEffect(() => {
    syncEngine.init();
    const unsubscribe = syncEngine.subscribe((status, lastSyncedAt, error, user) => {
      setState({
        status,
        lastSyncedAt,
        error,
        user,
        coachSyncPendingSetup: syncEngine.getStatus().coachSyncPendingSetup,
      });
    });
    return () => unsubscribe();
  }, []);

  return {
    ...state,
    syncNow: () => syncEngine.triggerSyncNow(),
    signInWithGoogle: () => syncEngine.signInWithGoogle(),
    signInWithApple: () => syncEngine.signInWithApple(),
    signUpWithPassword: (email: string, password: string, fullName?: string) =>
      syncEngine.signUpWithPassword(email, password, fullName),
    signInWithPassword: (email: string, password: string) =>
      syncEngine.signInWithPassword(email, password),
    resetPasswordForEmail: (email: string) =>
      syncEngine.resetPasswordForEmail(email),
    sendEmailOtp: (email: string) => syncEngine.sendEmailOtp(email),
    verifyEmailOtp: (email: string, token: string) => syncEngine.verifyEmailOtp(email, token),
    signOut: (options?: { clearLocalData?: boolean }) => syncEngine.signOut(options),
    deleteAccount: () => syncEngine.deleteAccount(),
  };
}
