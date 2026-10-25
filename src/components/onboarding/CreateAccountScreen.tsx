'use client';

import React, { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { syncEngine } from '@/lib/supabase/sync';
import { useToast } from '@/components/ui/Toast';
import SocialAuthButtons from './SocialAuthButtons';
import { useTranslation } from '@/lib/i18n';

interface CreateAccountScreenProps {
  onBack: () => void;
  onSuccess: (name: string, email: string) => void;
  onNavigateToLogin: () => void;
}

export default function CreateAccountScreen({
  onBack,
  onSuccess,
  onNavigateToLogin,
}: CreateAccountScreenProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setError(t('auth.nameRequired'));
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError(t('auth.validEmail'));
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long. Use a mix of letters and numbers to make it harder to guess.');
      return;
    }

    setLoading(true);
    try {
      const res = await syncEngine.signUpWithPassword(trimmedEmail, password, trimmedName);
      setLoading(false);

      if (res.error) {
        setError(res.error);
        toast.error(res.error, t('auth.signUpFailed'));
      } else {
        if (res.requiresEmailVerification) {
          toast.info(
            t('auth.verifyMsg'),
            t('auth.verifyTitle')
          );
        } else {
          toast.success(t('auth.createdMsg'), t('auth.welcomeTitle'));
        }
        onSuccess(trimmedName, trimmedEmail);
      }
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || t('auth.createFailed'));
    }
  };

  return (
    <div className="min-h-screen w-full bg-bg-primary text-text-primary flex flex-col justify-between p-6 sm:p-8 animate-fade-in">
      {/* Top Navigation Row */}
      <div className="w-full max-w-md mx-auto pt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          aria-label={t('auth.goBack')}
          className="w-10 h-10 min-w-[44px] min-h-[44px] rounded-full bg-bg-card border border-border flex items-center justify-center text-text-primary hover:bg-bg-primary active:scale-95 transition-all shadow-2xs cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5 text-text-primary" />
        </button>
        <span className="text-xs font-semibold tracking-wider text-text-muted uppercase">
          ASCEND
        </span>
        <div className="w-10 h-10" aria-hidden="true" />
      </div>

      {/* Main Elevated Form Card */}
      <div className="w-full max-w-md mx-auto my-auto py-4">
        <div className="bg-bg-card rounded-2xl p-6 sm:p-8 border border-border shadow-xs space-y-6">
          {/* Header */}
          <div className="text-left space-y-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
              {t('auth.createTitle')}
            </h1>
            <p className="text-sm text-text-muted">
              {t('auth.createSubtitle')}
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name */}
            <div>
              <label htmlFor="create-full-name" className="block text-xs font-semibold text-text-primary mb-1.5">
                {t('auth.fullName')}
              </label>
              <input
                id="create-full-name"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t('auth.namePlaceholder')}
                required
                className="w-full px-4 py-3 rounded-xl bg-bg-card border border-border focus:border-accent focus:ring-1 focus:ring-accent text-sm text-text-primary placeholder:text-text-muted/60 outline-none transition"
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="create-email" className="block text-xs font-semibold text-text-primary mb-1.5">
                {t('auth.email')}
              </label>
              <input
                id="create-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex@example.com"
                required
                className="w-full px-4 py-3 rounded-xl bg-bg-card border border-border focus:border-accent focus:ring-1 focus:ring-accent text-sm text-text-primary placeholder:text-text-muted/60 outline-none transition"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="create-password" className="block text-xs font-semibold text-text-primary mb-1.5">
                {t('auth.password')}
              </label>
              <div className="relative">
                <input
                  id="create-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  className="w-full pl-4 pr-11 py-3 rounded-xl bg-bg-card border border-border focus:border-accent focus:ring-1 focus:ring-accent text-sm text-text-primary placeholder:text-text-muted/60 outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-text-muted hover:text-text-primary p-1 cursor-pointer transition"
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {/* Password rule shown before submit, not only after failure. */}
              <p className="mt-1.5 text-2xs text-text-muted">{t('auth.passwordLength')}</p>
            </div>

            {/* Primary Action Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3.5 px-6 rounded-xl bg-accent hover:bg-accent-dim active:scale-[0.99] text-accent-on font-semibold text-sm transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>{t('auth.creating')}</span>
                </>
              ) : (
                t('auth.createTitle')
              )}
            </button>
          </form>

          {/* Social Auth (Google) */}
          <SocialAuthButtons />

          {/* Footer Link */}
          <div className="pt-2 text-center">
            <p className="text-xs text-text-muted">
              {t('auth.alreadyHave')}{' '}
              <button
                type="button"
                onClick={onNavigateToLogin}
                className="font-semibold text-accent hover:underline cursor-pointer"
              >
                {t('auth.logIn')}
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* Bottom spacer for balance */}
      <div className="w-full max-w-md mx-auto pb-2" aria-hidden="true" />
    </div>
  );
}
