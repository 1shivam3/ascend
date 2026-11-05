'use client';

/**
 * Task 2.4 — guest backup nudge on the Today screen.
 *
 * Guest history lives only in this browser's storage, which the
 * browser can clear. After the first completed workout — and once
 * more when the guest is established (~7 days or 10 workouts) — a
 * dismissible card offers the two ways out: download a backup file
 * or create a free account. Each milestone shows once; downloading
 * a backup marks it handled. Signed-in users never see it (their
 * data syncs). Milestone logic is pure and lives in
 * src/lib/backup-nudge.ts; this component is only wiring + render.
 *
 * The decision is computed in an effect (not during render) so the
 * card can never flash for a signed-in user whose session is still
 * resolving on first paint.
 */
import React, { useEffect, useState } from 'react';
import { Download, ShieldAlert, X } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useSupabaseSync } from '@/lib/supabase/useSupabaseSync';
import { isPermanentAccount } from '@/lib/data-location';
import { useTranslation } from '@/lib/i18n';
import { useToast } from '@/components/ui/Toast';
import { exportFullBackupJSON } from '@/lib/storage';
import { getLocalTodayStr } from '@/lib/formatters';
import {
  decideBackupNudge,
  firstWorkoutTimestamp,
  getBackupNudgeSeen,
  getLastBackupAt,
  markBackupNudgeShown,
  recordBackupExported,
  type BackupNudgeMilestone,
} from '@/lib/backup-nudge';
import AuthModal from './AuthModal';

export default function BackupNudge() {
  const { t } = useTranslation();
  const toast = useToast();
  const workouts = useStore((s) => s.workouts);
  const { user } = useSupabaseSync();
  const [milestone, setMilestone] = useState<BackupNudgeMilestone | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  const isGuest = !isPermanentAccount(user);
  const workoutCount = workouts?.length ?? 0;

  useEffect(() => {
    // Deliberate: the decision is state set from an effect so the
    // card never renders during the first paint (see header note).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMilestone(
      decideBackupNudge({
        isGuest,
        workoutCount,
        firstWorkoutTs: firstWorkoutTimestamp(workouts ?? []),
        lastBackupAt: getLastBackupAt(),
        seen: getBackupNudgeSeen(),
        now: Date.now(),
      })
    );
    // Re-decide when the auth state or workout count changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest, workoutCount]);

  if (!milestone && !authOpen) return null;

  const dismiss = () => {
    if (milestone) markBackupNudgeShown(milestone);
    setMilestone(null);
  };

  const handleDownloadBackup = () => {
    try {
      const jsonStr = exportFullBackupJSON();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ascend-backup-${getLocalTodayStr()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      recordBackupExported();
      toast.success(t('settings.backupSavedMsg'), t('settings.backupSavedTitle'));
    } catch {
      toast.error(t('settings.exportErrorMsg'), t('settings.exportErrorTitle'));
      return;
    }
    dismiss();
  };

  const handleCreateAccount = () => {
    // Opening the account flow counts as acting on this milestone —
    // if they abandon it, the *next* milestone can still remind them.
    if (milestone) markBackupNudgeShown(milestone);
    setMilestone(null);
    setAuthOpen(true);
  };

  return (
    <>
      {milestone && (
        <section
          aria-label={t('backupNudge.title')}
          className="bg-bg-card border border-amber-500/30 rounded-2xl p-4 shadow-xs"
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" aria-hidden />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-text-primary">
                  {t('backupNudge.title')}
                </h3>
                <button
                  type="button"
                  onClick={dismiss}
                  aria-label={t('common.close')}
                  className="p-1 -m-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed mt-1">
                {t(
                  milestone === 'first-workout'
                    ? 'backupNudge.bodyFirst'
                    : 'backupNudge.bodyEstablished'
                )}
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  type="button"
                  onClick={handleDownloadBackup}
                  className="inline-flex items-center gap-1.5 bg-accent hover:bg-accent-dim text-accent-on text-xs font-semibold px-3.5 py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden />
                  {t('vault.downloadBackup')}
                </button>
                <button
                  type="button"
                  onClick={handleCreateAccount}
                  className="inline-flex items-center bg-bg-secondary hover:bg-bg-tertiary text-text-primary text-xs font-semibold px-3.5 py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  {t('auth.createTitle')}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
