'use client';

import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface StepProgressBarProps {
  currentStep: 1 | 2 | 3 | 4;
  onBack: () => void;
  title?: string;
  /** Total segments. Default 4 (legacy flow); the simplified onboarding
   *  flow passes 2 (goals -> details-lite). */
  totalSteps?: number;
}

export default function StepProgressBar({
  currentStep,
  onBack,
  title,
  totalSteps = 4,
}: StepProgressBarProps) {
  const { t } = useTranslation();
  return (
    <div className="w-full max-w-md mx-auto pt-4 pb-6 px-4">
      {/* Top Navigation Row */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={onBack}
          aria-label={t('auth.goBack')}
          className="w-10 h-10 min-w-[44px] min-h-[44px] rounded-full bg-bg-card border border-border flex items-center justify-center text-text-primary hover:bg-bg-primary active:scale-95 transition-all shadow-2xs cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5 text-text-primary" />
        </button>

        {title ? (
          <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            {title}
          </span>
        ) : totalSteps !== 4 ? (
          <span className="text-xs font-medium text-text-muted">
            {t('auth.stepOfTotal', { step: currentStep, total: totalSteps })}
          </span>
        ) : (
          <span className="text-xs font-medium text-text-muted">
            {t('auth.stepOf', { step: currentStep })}
          </span>
        )}

        {/* Balance spacer so header stays centered */}
        <div className="w-10 h-10" aria-hidden="true" />
      </div>

      {/* Segment Progress Bar (segment count follows totalSteps) */}
      <div
        className="grid gap-2 w-full"
        style={{ gridTemplateColumns: `repeat(${totalSteps}, minmax(0, 1fr))` }}
        role="progressbar"
        aria-valuenow={currentStep}
        aria-valuemin={1}
        aria-valuemax={totalSteps}
      >
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              currentStep >= i + 1 ? 'bg-accent' : 'bg-bg-tertiary'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
