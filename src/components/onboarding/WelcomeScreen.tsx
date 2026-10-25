'use client';

import React from 'react';
import { RotateCcw } from 'lucide-react';
import LanguagePicker from '@/components/ui/LanguagePicker';
import { useTranslation } from '@/lib/i18n';

interface WelcomeScreenProps {
  onGetStarted: () => void;
  onLogin: () => void;
  onContinueAsGuest: () => void;
  backupFound?: boolean;
  onRestoreBackup?: () => void;
}

export default function WelcomeScreen({
  onGetStarted,
  onLogin,
  onContinueAsGuest,
  backupFound,
  onRestoreBackup,
}: WelcomeScreenProps) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen w-full bg-bg-primary text-text-primary flex flex-col justify-between p-6 sm:p-8 animate-fade-in">
      {/* Top spacer / subtle branding */}
      <div className="w-full max-w-md mx-auto pt-6 flex flex-col items-center gap-4">
        <span className="text-sm font-bold tracking-widest text-text-primary uppercase font-sans">
          ASCEND
        </span>
        {/* Language choice — first screen, optional, English by default */}
        <div className="w-52">
          <span className="block text-center text-2xs font-semibold text-text-muted mb-1.5">
            {t('onboarding.language')} · भाषा
          </span>
          <LanguagePicker variant="light" />
        </div>
      </div>

      {/* Hero Content */}
      <div className="w-full max-w-md mx-auto my-auto text-center py-8">
        <h1 className="display-title leading-tight">
          {t('onboarding.welcomeTitle')}
        </h1>
        <p className="mt-4 text-base text-text-muted leading-relaxed max-w-sm mx-auto font-normal">
          {t('onboarding.welcomeSubtitle')}
        </p>

        {/* Previous local backup banner if detected */}
        {backupFound && (
          <div className="mt-6 p-4 rounded-2xl bg-bg-card border border-border shadow-2xs text-left flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0 mt-0.5">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-text-primary">
                Previous training history found on this device
              </p>
              <p className="text-2xs text-text-muted mt-0.5">
                Restore your previous logs, split, and strength PRs instantly.
              </p>
              <button
                type="button"
                onClick={onRestoreBackup}
                className="mt-2 text-xs font-semibold text-accent hover:underline cursor-pointer"
              >
                Restore Saved Data &rarr;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="w-full max-w-md mx-auto pb-6 space-y-3">
        <button
          type="button"
          onClick={onGetStarted}
          className="w-full py-4 px-6 rounded-xl bg-accent hover:bg-accent-dim active:scale-[0.99] text-accent-on font-semibold text-base transition-all shadow-md cursor-pointer text-center"
        >
          {t('onboarding.getStarted')}
        </button>

        <button
          type="button"
          onClick={onLogin}
          className="w-full py-3.5 px-6 rounded-xl bg-bg-card hover:bg-bg-primary/60 active:scale-[0.99] text-text-primary border border-text-primary/20 font-semibold text-base transition-all shadow-2xs cursor-pointer text-center"
        >
          {t('onboarding.haveAccount')}
        </button>

        {/* Guest path: a labeled, first-class button — not a discreet link. */}
        <button
          type="button"
          onClick={onContinueAsGuest}
          className="w-full py-3.5 px-6 rounded-xl bg-bg-card hover:bg-bg-primary/60 active:scale-[0.99] text-text-primary border border-text-primary/20 font-semibold text-base transition-all shadow-2xs cursor-pointer text-center"
        >
          {t('onboarding.continueAsGuest')}
        </button>
        <p className="text-2xs text-text-muted text-center">{t('onboarding.guestNote')}</p>
      </div>
    </div>
  );
}
