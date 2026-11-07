'use client';

import React, { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { syncEngine } from '@/lib/supabase/sync';
import { useToast } from '@/components/ui/Toast';
import SocialAuthButtons from './SocialAuthButtons';
import ForgotPasswordModal from './ForgotPasswordModal';
import { useTranslation } from '@/lib/i18n';
import { validateAuthField, type AuthFormField } from '@/lib/auth-flow';

interface LoginScreenProps {
  onBack: () => void;
  onSuccess: () => void;
  onNavigateToSignup: () => void;
}

export default function LoginScreen({
  onBack,
  onSuccess,
  onNavigateToSignup,
}: LoginScreenProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  // QA-hardening R16: inline per-field validation (blur + submit)
  // replaces the native browser bubbles — the form is noValidate and
  // errors render under each field with role="alert". The top banner
  // remains for generic server failures only (F-10).
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<AuthFormField, string>>
  >({});

  const checkField = (field: AuthFormField): boolean => {
    const key = validateAuthField('login', field, {
      name: '',
      email,
      password,
    });
    setFieldErrors((prev) => ({ ...prev, [field]: key ? t(key) : undefined }));
    return !key;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    // Validate every field at once so all inline errors show together.
    const emailOk = checkField('email');
    const passwordOk = checkField('password');
    if (!emailOk || !passwordOk) {
      return;
    }

    setLoading(true);
    try {
      const res = await syncEngine.signInWithPassword(trimmedEmail, password);
      setLoading(false);

      if (res.error) {
        // F-10 (audit): never display the raw provider error — it
        // leaks whether the account exists (user enumeration). The
        // Google path was already neutralised; the password paths were
        // not. Generic copy, same as the catch block below.
        setError(t('auth.signInFailed'));
        toast.error(t('auth.signInFailed'), t('auth.loginFailed'));
      } else {
        toast.success(t('auth.welcomeBackMsg'), t('auth.loggedIn'));
        onSuccess();
      }
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || t('auth.signInFailed'));
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
        {/* Audit phase 5, task 5.1(l): the approved ASCEND logo mark
            (owner's orange icon, PR #55) sits above the form — the
            sign-in screen previously carried only the text wordmark. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/ascend-logo.png"
          alt="ASCEND"
          className="w-16 h-16 mx-auto mb-5 rounded-2xl shadow-sm"
        />
        <div className="bg-bg-card rounded-2xl p-6 sm:p-8 border border-border shadow-xs space-y-6">
          {/* Header */}
          <div className="text-left space-y-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
              {t('auth.welcomeBack')}
            </h1>
            <p className="text-sm text-text-muted">
              {t('auth.loginSubtitle')}
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          {/* Form — noValidate (R16): inline errors, never native bubbles. */}
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="login-email" className="block text-xs font-semibold text-text-primary mb-1.5">
                {t('auth.email')}
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => checkField('email')}
                placeholder="you@email.com"
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
                className="w-full px-4 py-3 rounded-xl bg-bg-card border border-border focus:border-accent focus:ring-1 focus:ring-accent text-sm text-text-primary placeholder:text-text-muted/60 outline-none transition"
              />
              {fieldErrors.email && (
                <p id="login-email-error" role="alert" className="mt-1.5 text-xs text-red-600">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="block text-xs font-semibold text-text-primary">
                  {t('auth.password')}
                </label>
                <button
                  type="button"
                  onClick={() => setIsForgotOpen(true)}
                  className="text-xs font-semibold text-accent-text hover:underline cursor-pointer"
                >
                  {t('auth.forgot')}
                </button>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => checkField('password')}
                  placeholder={t('auth.passwordPlaceholder')}
                  aria-invalid={fieldErrors.password ? true : undefined}
                  aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
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
              {fieldErrors.password && (
                <p id="login-password-error" role="alert" className="mt-1.5 text-xs text-red-600">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {/* Primary Action Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3.5 px-6 rounded-xl bg-accent hover:bg-accent-dim active:scale-[0.99] text-accent-on font-semibold text-sm transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:bg-bg-secondary disabled:text-text-muted disabled:border-border disabled:shadow-none disabled:opacity-100"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>{t('auth.loggingIn')}</span>
                </>
              ) : (
                t('auth.logIn')
              )}
            </button>
          </form>

          {/* Social Auth (Google) */}
          <SocialAuthButtons />

          {/* Footer Link */}
          <div className="pt-2 text-center">
            <p className="text-xs text-text-muted">
              {t('auth.noAccount')}{' '}
              <button
                type="button"
                onClick={onNavigateToSignup}
                className="font-semibold text-accent hover:underline cursor-pointer"
              >
                {t('auth.signUp')}
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* Forgot Password Sheet/Modal */}
      <ForgotPasswordModal
        isOpen={isForgotOpen}
        onClose={() => setIsForgotOpen(false)}
        initialEmail={email}
      />

      {/* Bottom spacer for balance */}
      <div className="w-full max-w-md mx-auto pb-2" aria-hidden="true" />
    </div>
  );
}
