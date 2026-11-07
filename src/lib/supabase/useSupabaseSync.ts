'use client';

import { useState, useEffect } from 'react';
import { syncEngine, SyncStatus, AuthUser } from './sync';

export function useSupabaseSync() {
  const [state, setState] = useState<{
    status: SyncStatus;
    lastSyncedAt: string | null;
    error: string | null;
    user: AuthUser | null;
    // S4: a merge choice is waiting on the user (MergeChoiceModal).
    pendingMergeChoice: boolean;
    // QA-hardening R6: classified sync failure (offline/auth/server).
    errorKind: 'offline' | 'auth' | 'server' | null;
  }>(syncEngine.getStatus());

  useEffect(() => {
    syncEngine.init();
    const unsubscribe = syncEngine.subscribe((status, lastSyncedAt, error, user) => {
      // pendingMergeChoice rides along via getStatus(): the listener
      // signature predates S4 and other subscribers rely on it.
      setState({
        status,
        lastSyncedAt,
        error,
        user,
        pendingMergeChoice: syncEngine.getStatus().pendingMergeChoice,
        errorKind: syncEngine.getStatus().errorKind,
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
    signInWithPassword: (email: string, password: string, opts?: { deferSync?: boolean }) =>
      syncEngine.signInWithPassword(email, password, opts),
    accountHasCloudData: (userId: string) => syncEngine.accountHasCloudData(userId),
    // S4: resolve / suppress the OAuth/OTP merge-choice gate.
    resolveMergeChoice: (choice: 'merge' | 'archive') => syncEngine.resolveMergeChoice(choice),
    suppressMergeGateFor: (userId: string) => syncEngine.suppressMergeGateFor(userId),
    resetPasswordForEmail: (email: string) =>
      syncEngine.resetPasswordForEmail(email),
    sendEmailOtp: (email: string) => syncEngine.sendEmailOtp(email),
    verifyEmailOtp: (email: string, token: string) => syncEngine.verifyEmailOtp(email, token),
    signOut: (options?: { clearLocalData?: boolean }) => syncEngine.signOut(options),
    deleteAccount: () => syncEngine.deleteAccount(),
  };
}
