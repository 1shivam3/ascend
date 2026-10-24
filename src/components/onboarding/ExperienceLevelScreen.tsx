'use client';

import React from 'react';
import { UserMode } from '@/lib/types';
import StepProgressBar from './StepProgressBar';
import { useTranslation } from '@/lib/i18n';

interface ExperienceOption {
  id: UserMode;
  title: string;
  subtitle: string;
  description: string;
}

const EXPERIENCE_OPTIONS: ExperienceOption[] = [
  {
    id: 'beginner',
    title: 'Beginner',
    subtitle: 'Just getting started',
    description: 'Learning how to do exercises correctly & building the habit',
  },
  {
    id: 'intermediate',
    title: 'Intermediate',
    subtitle: 'Some experience',
    description: '1–2+ years of regular training, adding weight over time',
  },
  {
    id: 'advanced',
    title: 'Advanced',
    subtitle: 'Very experienced',
    description: 'Years of planned training cycles, heavy lifts & lots of hard work',
  },
];

interface ExperienceLevelScreenProps {
  selectedLevel: UserMode;
  onSelectLevel: (level: UserMode) => void;
  onContinue: () => void;
  onBack: () => void;
}

export default function ExperienceLevelScreen({
  selectedLevel,
  onSelectLevel,
  onContinue,
  onBack,
}: ExperienceLevelScreenProps) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen w-full bg-bg-primary text-text-primary flex flex-col justify-between pb-8 animate-fade-in">
      {/* Top 3-segment progress indicator (Step 2 of 3) */}
      <StepProgressBar currentStep={2} onBack={onBack} />

      {/* Main Content */}
      <div className="w-full max-w-md mx-auto px-6 py-2 my-auto space-y-6">
        {/* Header */}
        <div className="text-left space-y-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
            {t('onboarding.experienceTitle')}
          </h1>
          <p className="text-sm text-text-muted">
            This customizes your starting training volume and progression rate.
          </p>
        </div>

        {/* 3 Single-Select Cards */}
        <div className="space-y-3" role="radiogroup" aria-label="Experience level">
          {EXPERIENCE_OPTIONS.map((item) => {
            const isSelected = selectedLevel === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectLevel(item.id)}
                role="radio"
                aria-checked={isSelected}
                className={`w-full p-5 rounded-2xl bg-bg-card border transition-all flex items-center justify-between text-left cursor-pointer shadow-2xs ${
                  isSelected
                    ? 'border-accent ring-1 ring-accent bg-accent/[0.02]'
                    : 'border-border hover:border-border-hover/40'
                }`}
              >
                {/* Left: Titles & Copy */}
                <div className="pr-4 space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-text-primary">
                      {item.title}
                    </h2>
                    <span className="text-xs font-semibold text-accent">
                      &bull; {item.subtitle}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted leading-relaxed">
                    {item.description}
                  </p>
                </div>

                {/* Right: Radio Indicator */}
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                    isSelected
                      ? 'border-accent bg-accent'
                      : 'border-border bg-transparent'
                  }`}
                  aria-hidden="true"
                >
                  {isSelected && (
                    <div className="w-2 h-2 rounded-full bg-bg-card shadow-xs" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="w-full max-w-md mx-auto px-6 pt-4 space-y-3">
        <button
          type="button"
          onClick={onContinue}
          className="w-full py-4 px-6 rounded-xl bg-accent hover:bg-accent-dim active:scale-[0.99] text-accent-on font-semibold text-sm transition-all shadow-md cursor-pointer text-center"
        >
          {t('common.continue')}
        </button>

        <button
          type="button"
          onClick={onBack}
          className="w-full py-3.5 px-6 rounded-xl bg-bg-card hover:bg-bg-primary/60 active:scale-[0.99] text-text-primary border border-text-primary/20 font-semibold text-sm transition-all shadow-2xs cursor-pointer text-center"
        >
          {t('common.back')}
        </button>
      </div>
    </div>
  );
}
