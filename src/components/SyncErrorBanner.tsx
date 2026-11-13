'use client';

import { useState } from 'react';
import { useSupabaseSync } from '@/lib/supabase/useSupabaseSync';
import { useTranslation } from '@/lib/i18n';
import type { SyncErrorKind } from '@/lib/supabase/sync';
import type { SyncState } from '@/lib/supabase/sync-state';

/**
 * Gauntlet R3: persistent sync-failure surface.
 *
 * Sync errors used to appear only as a transient toast (easy to miss)
 * plus a small status chip on Home — a user could train for days
 * believing they were backed up. This banner renders in the app shell
 * on every tab while the engine is in the error state (signed-in
 * users only; guests have nothing to sync), and Retry re-runs sync
 * immediately. It clears itself when the engine leaves the error
 * state. Subscribing here is safe: the hook reads the singleton sync
 * engine, it does not create a second one.
 *
 * QA-hardening R6: the banner now renders IN FLOW at the top of the
 * shell — it reserves layout space instead of overlaying (and
 * covering) the Today header; it names the failure class in plain
 * words (offline / sign-in expired / server), fed by the engine's
 * single classified state (the same state behind the Today caption
 * and Settings); and it can be dismissed for the session per failure
 * class, while the Today caption and Settings keep showing the
 * failure as the small persistent indicator until it resolves.
 */
export function shouldShowSyncError(status: string, hasUser: boolean): boolean {
  return hasUser && status === 'error';
}

/** §2 (Phase 2.1): the banner reads the ONE sync state directly. */
export function shouldShowSyncErrorForState(state: SyncState, hasUser: boolean): boolean {
  return hasUser && state.kind === 'error';
}

/** R6: the banner message key for a classified sync failure. */
export function syncErrorMessageKey(
  kind: SyncErrorKind | null
): 'home.syncErrorOffline' | 'home.syncErrorAuth' | 'home.syncErrorServer' | 'home.syncErrorBanner' {
  switch (kind) {
    case 'offline':
      return 'home.syncErrorOffline';
    case 'auth':
      return 'home.syncErrorAuth';
    case 'server':
      return 'home.syncErrorServer';
    default:
      return 'home.syncErrorBanner';
  }
}

const DISMISS_KEY = 'ascend_sync_banner_dismissed_kind';

export default function SyncErrorBanner() {
  const { syncState, user, errorKind, syncNow } = useSupabaseSync();
  const { t } = useTranslation();
  const [dismissedKind, setDismissedKind] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY);
    } catch {
      return null;
    }
  });

  if (!shouldShowSyncErrorForState(syncState, !!user)) return null;
  if (dismissedKind !== null && dismissedKind === (errorKind ?? 'unknown')) return null;

  const dismiss = () => {
    const kind = errorKind ?? 'unknown';
    setDismissedKind(kind);
    try {
      sessionStorage.setItem(DISMISS_KEY, kind);
    } catch {}
  };

  return (
    <div
      role="alert"
      className="relative z-30 flex w-full items-center justify-center gap-3 bg-red-600 px-4 py-2.5 text-white shadow-lg"
    >
      <span className="text-xs font-semibold sm:text-sm">{t(syncErrorMessageKey(errorKind))}</span>
      <button
        type="button"
        onClick={() => {
          void syncNow();
        }}
        className="shrink-0 cursor-pointer rounded-lg bg-white/20 px-3 py-1.5 text-xs font-bold hover:bg-white/30 sm:text-sm"
      >
        {t('home.syncRetry')}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('home.syncBannerDismiss')}
        className="shrink-0 cursor-pointer rounded-lg px-2 py-1.5 text-sm font-bold text-white/90 hover:bg-white/20"
      >
        ✕
      </button>
    </div>
  );
}
