'use client';

import React from 'react';
import { useTranslation } from '@/lib/i18n';

interface SplashScreenProps {
  onContinue?: () => void;
  isHydrating?: boolean;
}

// Clean splash: wordmark only — no photo, no mascot, no logo mark,
// no animation, no auto-advance timer. Tap-only, static.
export default function SplashScreen({ onContinue, isHydrating = false }: SplashScreenProps) {
  const { t } = useTranslation();

  return (
    <div
      onClick={!isHydrating && onContinue ? onContinue : undefined}
      className={`relative min-h-screen w-full bg-brand-graphite text-brand-chalk flex flex-col items-center justify-between p-8 select-none overflow-hidden ${
        !isHydrating && onContinue ? 'cursor-pointer' : ''
      }`}
      role="banner"
      aria-label={t('auth.splashAria')}
    >
      {/* Top spacer */}
      <div className="relative z-10 w-full flex justify-end pt-4" aria-hidden="true" />

      {/* Center Branding */}
      <div className="relative z-10 flex flex-col items-center text-center space-y-3 my-auto">
        {/* Wordmark */}
        <h1 className="text-4xl sm:text-5xl font-black tracking-[0.25em] text-white uppercase font-sans">
          ASCEND
        </h1>

        {/* Short vermilion rule */}
        <div className="w-7 h-0.5 bg-accent" aria-hidden="true" />

        {/* Tagline */}
        <p className="text-xs sm:text-sm font-medium tracking-widest text-brand-chalk/80 uppercase">
          {t('auth.tagline')}
        </p>
      </div>

      {/* Bottom Indicator */}
      <div className="relative z-10 pb-8 flex flex-col items-center text-center">
        {isHydrating ? (
          <div className="flex items-center gap-2 text-xs text-brand-chalk/70 font-mono">
            <span className="w-2 h-2 rounded-full bg-accent mr-1" />
            <span>{t('auth.initializing')}</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onContinue?.();
            }}
            className="text-xs tracking-wider text-brand-chalk/70 hover:text-white uppercase font-medium transition-colors cursor-pointer py-2 px-4 rounded-full border border-white/10 hover:border-white/30 backdrop-blur-xs bg-black/20"
          >
            {t('auth.tapContinue')}
          </button>
        )}
      </div>
    </div>
  );
}
