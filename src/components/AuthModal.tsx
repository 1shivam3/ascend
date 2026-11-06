'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useModalA11y } from '@/lib/use-modal-a11y';
import { X, Shield, Loader2, CheckCircle2, Cloud, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useSupabaseSync } from '@/lib/supabase/useSupabaseSync';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { useAppNavigation } from '@/lib/navigation';
import { useTranslation } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { hasRetainedHistory } from '@/lib/history-fork';
import { shouldOfferMergeChoice, validateAuthForm, type AuthFormMode } from '@/lib/auth-flow';
import ForgotPasswordModal from '@/components/onboarding/ForgotPasswordModal';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const { dialogProps } = useModalA11y(modalRef, isOpen, onClose);
  const { user, signInWithGoogle, signOut, signInWithPassword, signUpWithPassword, accountHasCloudData, syncNow, suppressMergeGateFor } = useSupabaseSync();
  const { t } = useTranslation();
  const toast = useToast();
  const { registerBackHandler } = useAppNavigation();
  const [loading, setLoading] = useState(false);
  // Task 1.4: email/password flows for guests AFTER onboarding
  // (previously these existed only as onboarding screens, so a guest
  // who skipped them could never create or use an email account).
  const profile = useStore((s) => s.profile);
  const startFreshFromRetainedHistory = useStore((s) => s.startFreshFromRetainedHistory);
  const [mode, setMode] = useState<AuthFormMode>('login');
  const [view, setView] = useState<'main' | 'merge'>('main');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setView('main');
      setFormError(null);
      // Prefill the signup name from the guest profile (editable).
      setName((prev) => prev || profile?.name || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    return registerBackHandler(() => {
      onClose();
      return true;
    }, 100);
  }, [isOpen, onClose, registerBackHandler]);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        toast.error(t('auth.googleSignInIncomplete'), t('auth.googleFailed'));
        setLoading(false);
      }
      // On success, browser will redirect to Google's official OAuth consent
    } catch {
      toast.error(t('auth.googleInitFail'), t('auth.signInError'));
      setLoading(false);
    }
  };

  const isPermanentUser = user && !user.isAnonymous && user.email;

  /**
   * Task 1.4 — email/password submit.
   * Login runs with deferSync: the engine must NOT sync yet, because
   * when this device holds guest data AND the account holds cloud
   * data, the user first chooses merge vs archive (see
   * handleMergeChoice). Signup needs no choice — a brand-new account
   * is empty, so the engine's normal sync links the local data.
   * All provider errors render as ONE generic message (F-10).
   */
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const errorKey = validateAuthForm(mode, { name, email, password });
    if (errorKey) {
      setFormError(t(errorKey));
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signup') {
        const res = await signUpWithPassword(email.trim(), password, name.trim());
        setLoading(false);
        if (res.error) {
          setFormError(t('auth.createFailed'));
          toast.error(t('auth.createFailed'), t('auth.signUpFailed'));
          return;
        }
        if (res.requiresEmailVerification) {
          toast.info(t('auth.verifyMsg'), t('auth.verifyTitle'));
        } else {
          toast.success(t('auth.createdMsg'), t('auth.welcomeTitle'));
        }
        onClose();
        return;
      }
      const res = await signInWithPassword(email.trim(), password, { deferSync: true });
      if (res.error || !res.user) {
        setLoading(false);
        setFormError(t('auth.signInFailed'));
        toast.error(t('auth.signInFailed'), t('auth.loginFailed'));
        return;
      }
      const localHasData = hasRetainedHistory(useStore.getState());
      const cloudHasData = await accountHasCloudData(res.user.id);
      setLoading(false);
      if (shouldOfferMergeChoice(localHasData, cloudHasData)) {
        setView('merge');
        return;
      }
      // S4: this flow just made the merge decision itself (one-sided
      // → no choice needed) — record it so a still-fresh OAuth/OTP
      // intent flag cannot re-gate the sync below in the engine.
      suppressMergeGateFor(res.user.id);
      await syncNow();
      toast.success(t('auth.welcomeBackMsg'), t('auth.loggedIn'));
      onClose();
    } catch {
      setLoading(false);
      setFormError(t(mode === 'signup' ? 'auth.createFailed' : 'auth.signInFailed'));
    }
  };

  /**
   * The merge choice (Task 1.4). 'merge' runs the deferred sync —
   * the engine's guest-migration path folds this device's data into
   * the account. 'keep' archives this device's data FIRST via the
   * Start-fresh archive (restorable in Settings → Data & Account),
   * then syncs, so the account's cloud state is what lands locally.
   * If the archive write fails, startFresh returns false and we do
   * NOT sync — syncing anyway would silently merge, the opposite of
   * what the user chose.
   */
  const handleMergeChoice = async (choice: 'merge' | 'keep') => {
    setLoading(true);
    try {
      if (choice === 'keep') {
        const archived = startFreshFromRetainedHistory();
        if (!archived) {
          setLoading(false);
          setFormError(t('auth.signInFailed'));
          return;
        }
      }
      // S4: record this choice as the resolution for the engine's
      // OAuth/OTP gate too — the same decision must not be asked
      // twice (the archive above already reset the device data, so
      // the recorded signature matches the post-choice state).
      if (user?.id) suppressMergeGateFor(user.id);
      await syncNow();
      setLoading(false);
      toast.success(
        t(choice === 'merge' ? 'auth.mergeDone' : 'auth.archiveDone'),
        t('auth.loggedIn')
      );
      onClose();
    } catch {
      setLoading(false);
      setFormError(t('auth.signInFailed'));
    }
  };

  return (
    <div ref={modalRef} {...dialogProps} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm rounded-2xl bg-bg-card border border-border p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-border/70">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-text-primary tracking-tight font-sans">
                {isPermanentUser && view !== 'merge' ? t('auth.cloudAccount') : t('auth.linkAccount')}
              </h2>
              <p className="text-2xs text-text-muted font-mono">
                {isPermanentUser ? t('auth.backupActive') : t('auth.neverLose')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 min-h-[44px] min-w-[44px] rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary flex items-center justify-center transition-colors cursor-pointer"
            aria-label={t('auth.closeAuth')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Task 1.4: the merge choice renders BEFORE the signed-in
            panel — after a deferred login the user object is already
            set, and the choice must not be pre-empted by it. */}
        {view === 'merge' ? (
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
            <Button fullWidth disabled={loading} onClick={() => void handleMergeChoice('merge')}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('auth.mergeDeviceBtn')}
            </Button>
            <Button variant="secondary" fullWidth disabled={loading} onClick={() => void handleMergeChoice('keep')}>
              {t('auth.keepAccountBtn')}
            </Button>
          </div>
        ) : isPermanentUser ? (
          <div className="space-y-3.5 py-1">
            <div className="p-3.5 rounded-xl bg-bg-secondary/70 border border-emerald-500/30 space-y-1.5">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="text-xs font-bold">{t('auth.connected')}</span>
              </div>
              <p className="text-2xs text-text-primary font-mono break-all">
                {user.email}
              </p>
              <p className="text-2xs text-text-muted leading-relaxed">
                {t('auth.syncedBody')}
              </p>
            </div>

            <Button
              variant="danger"
              size="sm"
              fullWidth
              onClick={async () => {
                await signOut();
                toast.info(t('auth.signedOut'));
                onClose();
              }}
            >
              {t('auth.signOut')}
            </Button>
          </div>
        ) : (
          /* Sign-In With Google */
          <div className="space-y-4 pt-1">
            <p className="text-2xs text-text-secondary leading-relaxed">
              {t('auth.linkBody')}
            </p>

            <div className="space-y-2 p-3 rounded-xl bg-bg-secondary/40 border border-border/60 text-2xs text-text-muted">
              <div className="flex items-center gap-2 text-text-primary">
                <CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0" />
                <span>{t('auth.benefitSync')}</span>
              </div>
              <div className="flex items-center gap-2 text-text-primary">
                <CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0" />
                <span>{t('auth.benefitNoLoss')}</span>
              </div>
              <div className="flex items-center gap-2 text-text-primary">
                <CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0" />
                <span>{t('auth.benefitAuto')}</span>
              </div>
            </div>

            {/* Continue with Google Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-white hover:bg-zinc-100 active:scale-98 text-zinc-900 font-semibold text-xs sm:text-sm transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-zinc-900" />
              ) : (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span>{t('auth.continueGoogle')}</span>
            </button>

            <div className="flex items-center justify-center gap-1.5 text-2xs text-text-muted pt-1">
              <Shield className="w-3 h-3 text-emerald-500 shrink-0" />
              <span>{t('auth.rls')}</span>
            </div>

            {/* Task 1.4: email & password — create an account or log
                in without leaving the app (validation mirrors the
                onboarding screens; failures are generic, F-10). */}
            <div className="flex items-center gap-3 pt-1" aria-hidden="true">
              <span className="flex-1 h-px bg-border" />
              <span className="text-2xs text-text-muted font-semibold">{t('auth.orContinue')}</span>
              <span className="flex-1 h-px bg-border" />
            </div>

            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-bg-secondary/60 border border-border/60" role="tablist" aria-label={t('auth.linkAccount')}>
              {(['login', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => { setMode(m); setFormError(null); }}
                  className={`py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${mode === m ? 'bg-bg-card text-text-primary shadow-xs' : 'text-text-muted hover:text-text-primary'}`}
                >
                  {t(m === 'login' ? 'auth.logIn' : 'auth.signUp')}
                </button>
              ))}
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-2.5">
              {mode === 'signup' && (
                <div className="space-y-1">
                  <label htmlFor="auth-name" className="text-2xs font-bold text-text-secondary">{t('auth.fullName')}</label>
                  <input
                    id="auth-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('auth.namePlaceholder')}
                    className="w-full px-3 py-2.5 rounded-xl bg-bg-secondary/60 border border-border text-sm text-text-primary outline-none focus:border-accent"
                    autoComplete="name"
                  />
                </div>
              )}
              <div className="space-y-1">
                <label htmlFor="auth-email" className="text-2xs font-bold text-text-secondary">{t('auth.email')}</label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  className="w-full px-3 py-2.5 rounded-xl bg-bg-secondary/60 border border-border text-sm text-text-primary outline-none focus:border-accent"
                  autoComplete="email"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="auth-password" className="text-2xs font-bold text-text-secondary">{t('auth.password')}</label>
                <div className="relative">
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('auth.passwordPlaceholder')}
                    className="w-full px-3 py-2.5 pr-10 rounded-xl bg-bg-secondary/60 border border-border text-sm text-text-primary outline-none focus:border-accent"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {mode === 'signup' && (
                  <p className="text-2xs text-text-muted">{t('auth.passwordLength')}</p>
                )}
              </div>

              {formError && (
                <p className="flex items-center gap-1.5 text-2xs text-danger font-semibold">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {formError}
                </p>
              )}

              <Button type="submit" fullWidth disabled={loading}>
                {loading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : t(mode === 'login' ? 'auth.logIn' : 'auth.createTitle')}
              </Button>

              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="w-full text-center text-2xs font-bold text-accent-text hover:underline cursor-pointer"
                >
                  {t('auth.forgot')}
                </button>
              )}
            </form>
          </div>
        )}
      </div>
      {/* Reused from onboarding: the same forgot-password modal. */}
      <ForgotPasswordModal
        isOpen={forgotOpen}
        onClose={() => setForgotOpen(false)}
        initialEmail={email}
      />
    </div>
  );
}
