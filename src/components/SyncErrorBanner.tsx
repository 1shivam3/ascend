'use client';

import { useSupabaseSync } from '@/lib/supabase/useSupabaseSync';
import { useTranslation } from '@/lib/i18n';

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
 */
export function shouldShowSyncError(status: string, hasUser: boolean): boolean {
  return hasUser && status === 'error';
}

export default function SyncErrorBanner() {
  const { status, user, syncNow } = useSupabaseSync();
  const { t } = useTranslation();

  if (!shouldShowSyncError(status, !!user)) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[70] flex items-center justify-center gap-3 bg-red-600 px-4 py-2.5 text-white shadow-lg"
    >
      <span className="text-xs font-semibold sm:text-sm">{t('home.syncErrorBanner')}</span>
      <button
        type="button"
        onClick={() => {
          void syncNow();
        }}
        className="shrink-0 cursor-pointer rounded-lg bg-white/20 px-3 py-1.5 text-xs font-bold hover:bg-white/30 sm:text-sm"
      >
        {t('home.syncRetry')}
      </button>
    </div>
  );
}
