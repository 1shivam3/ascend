'use client';

import React from 'react';
import { UserMode } from '@/lib/types';
import StepProgressBar from './StepProgressBar';

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
    description: 'Learning proper exercise execution & building gym consistency',
  },
  {
    id: 'intermediate',
    title: 'Intermediate',
    subtitle: 'Some experience',
    description: '1–2+ years of consistent training with progressive overload',
  },
  {
    id: 'advanced',
    title: 'Advanced',
    subtitle: 'Very experienced',
    description: 'Years of structured periodization, heavy lifts & high work capacity',
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
  return (
    <div className="min-h-screen w-full bg-[#F3F0E7] text-[#171916] flex flex-col justify-between pb-8 animate-fade-in">
      {/* Top 3-segment progress indicator (Step 2 of 3) */}
      <StepProgressBar currentStep={2} onBack={onBack} />

      {/* Main Content */}
      <div className="w-full max-w-md mx-auto px-6 py-2 my-auto space-y-6">
        {/* Header */}
        <div className="text-left space-y-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#171916] tracking-tight">
            What&apos;s your experience level?
          </h1>
          <p className="text-sm text-[#858076]">
            We&apos;ll match your starting workouts to your level.
          </p>
        </div>

        {/* Illustration */}
        <div className="flex justify-center">
          <img
            src="/images/illustrations/onboarding-experience.webp"
            alt="Fitness journey from beginner to advanced"
            className="w-48 h-48 object-contain"
            loading="eager"
          />
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
                className={`w-full p-5 rounded-2xl bg-white border transition-all flex items-center justify-between text-left cursor-pointer shadow-2xs ${
                  isSelected
                    ? 'border-[#E44427] ring-1 ring-[#E44427] bg-[#E44427]/[0.02]'
                    : 'border-[#E2DFD6] hover:border-[#858076]/40'
                }`}
              >
                {/* Left: Titles & Copy */}
                <div className="pr-4 space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-[#171916]">
                      {item.title}
                    </h2>
                    <span className="text-xs font-semibold text-[#E44427]">
                      &bull; {item.subtitle}
                    </span>
                  </div>
                  <p className="text-xs text-[#858076] leading-relaxed">
                    {item.description}
                  </p>
                </div>

                {/* Right: Radio Indicator */}
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                    isSelected
                      ? 'border-[#E44427] bg-[#E44427]'
                      : 'border-[#E2DFD6] bg-transparent'
                  }`}
                  aria-hidden="true"
                >
                  {isSelected && (
                    <div className="w-2 h-2 rounded-full bg-white shadow-xs" />
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
          className="w-full py-4 px-6 rounded-xl bg-[#E44427] hover:bg-[#d03b20] active:scale-[0.99] text-white font-semibold text-sm transition-all shadow-md cursor-pointer text-center"
        >
          Continue
        </button>

        <button
          type="button"
          onClick={onBack}
          className="w-full py-3.5 px-6 rounded-xl bg-white hover:bg-[#F3F0E7]/60 active:scale-[0.99] text-[#171916] border border-[#171916]/20 font-semibold text-sm transition-all shadow-2xs cursor-pointer text-center"
        >
          Back
        </button>
      </div>
    </div>
  );
}
