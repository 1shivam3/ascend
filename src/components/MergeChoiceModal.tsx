'use client';

import React, { useRef, useState } from 'react';
import { AlertCircle, Cloud, Loader2 } from 'lucide-react';
import { useSupabaseSync } from '@/lib/supabase/useSupabaseSync';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { useTranslation } from '@/lib/i18n';
import { useModalA11y } from '@/lib/use-modal-a11y';

/**
 * S4 (sync convergence): app-level host for the sync engine's
 * pending merge choice.
 *
 * Phase 1 (Task 1.4) gave the email/password login this choice
 * inside AuthModal, but Google OAuth and email OTP/magic-link
 * sign-ins complete OUTSIDE AuthModal (OAuth redirect →
 * onAuthStateChange; OTP verify) and used to sync unconditionally —
 * silently merging this device's guest data into the account. Those
 * flows now pause in the engine (no pull, no push) and this modal
 * presents the SAME choice, with the same strings and semantics as
 * AuthModal's merge view:
 *  - 'merge'  → sync runs; the engine folds this device's data in.
 *  - 'archive' → this device's data is archived first (restorable in
 *    Settings → Data & Account), then the account's data syncs down.
 *    If the archive write fails, sync does NOT run.
 *
 * Self-gating: renders only while the engine reports a pending
 * choice for a signed-in user. There is deliberately no dismiss —
 * closing without choosing would leave sync paused with no visible
 * reason; both choices resolve and unpause. Mounted next to
 * TabGuardBanner in every page.tsx return, like SyncErrorBanner's
 * always-present posture.
 */
export default function MergeChoiceModal() {
  const { user, pendingMergeChoice, resolveMergeChoice } = useSupabaseSync();
  const { t } = useTranslation();
  const toast = useToast();
  const modalRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const open = Boolean(user && pendingMergeChoice);
  // Non-dismissible by design (see the header comment): the close
  // handler is a no-op so Escape/backdrop cannot strand the pause.
  const { dialogProps } = useModalA11y(modalRef, open, () => {});

  if (!open) return null;

  const handleChoice = async (choice: 'merge' | 'archive') => {
    setLoading(true);
    setFormError(null);
    const res = await resolveMergeChoice(choice);
    setLoading(false);
    if (res.error) {
      // Archive failed inside the engine and sync was NOT run —
      // stay open on the choice so the user can retry.
      setFormError(t('auth.signInFailed'));
      return;
    }
    toast.success(
      t(choice === 'merge' ? 'auth.mergeDone' : 'auth.archiveDone'),
      t('auth.loggedIn')
    );
  };

  return (
    <div ref={modalRef} {...dialogProps} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm rounded-2xl bg-bg-card border border-border p-5 shadow-2xl space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-border/70">
          <div className="w-8 h-8 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
            <Cloud className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-text-primary tracking-tight font-sans">
              {t('auth.linkAccount')}
            </h2>
            <p className="text-2xs text-text-muted font-mono">{t('auth.neverLose')}</p>
          </div>
        </div>

        <div className="space-y-3.5 py-1">
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-text-primary">{t('auth.mergeTitle')}</p>
            <p className="text-2xs text-text-secondary leading-relaxed">{t('auth.mergeBody')}</p>
          </div>
          {formError && (
            <p className="flex items-center gap-1.5 text-2xs text-danger font-semibold">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {formError}
            </p>
          )}
          <Button fullWidth disabled={loading} onClick={() => void handleChoice('merge')}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('auth.mergeDeviceBtn')}
          </Button>
          <Button variant="secondary" fullWidth disabled={loading} onClick={() => void handleChoice('archive')}>
            {t('auth.keepAccountBtn')}
          </Button>
        </div>
      </div>
    </div>
  );
}
