'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { syncEngine } from '@/lib/supabase/sync';
import { useToast } from '@/components/ui/Toast';
import { useTranslation } from '@/lib/i18n';

export function GoogleIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
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
  );
}

interface SocialAuthButtonsProps {
  onSuccess?: () => void;
}

export default function SocialAuthButtons({ onSuccess: _onSuccess }: SocialAuthButtonsProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [loadingProvider, setLoadingProvider] = useState<'google' | null>(null);

  const handleGoogle = async () => {
    setLoadingProvider('google');
    try {
      const res = await syncEngine.signInWithGoogle();
      if (res.error) {
        toast.error(t('auth.googleSignInIncomplete'), t('auth.googleFailed'));
        setLoadingProvider(null);
      }
    } catch {
      toast.error(t('auth.googleConnectFail'), t('auth.signInError'));
      setLoadingProvider(null);
    }
  };

  return (
    <div className="space-y-4 w-full">
      {/* Divider */}
      <div className="relative my-4 flex items-center justify-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative bg-bg-card px-3 text-xs text-text-muted">
          {t('auth.orContinue')}
        </div>
      </div>

      {/* Social button */}
      <div className="w-full">
        {/* Google */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={loadingProvider !== null}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-bg-card hover:bg-bg-primary active:scale-[0.98] border border-border text-xs font-semibold text-text-primary transition shadow-2xs cursor-pointer disabled:opacity-50"
        >
          {loadingProvider === 'google' ? (
            <Loader2 className="w-4 h-4 animate-spin text-text-primary" />
          ) : (
            <GoogleIcon className="w-4 h-4 shrink-0" />
          )}
          <span>{t('auth.continueGoogle')}</span>
        </button>
      </div>
    </div>
  );
}
