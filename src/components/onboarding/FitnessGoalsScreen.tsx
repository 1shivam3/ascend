'use client';

import React from 'react';
import { Dumbbell, Flame, Shield, Activity, CheckCircle2, Check } from 'lucide-react';
import { AthleteGoal, ATHLETE_GOAL_CONFIGS } from '@/lib/types';
import StepProgressBar from './StepProgressBar';

interface GoalItem {
  id: AthleteGoal;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}

// Titles and subtitles come from the canonical ATHLETE_GOAL_CONFIGS so onboarding,
// Profile and every other surface name goals identically. Subtitles are plain
// English — no jargon (novice-friendly).
const GOAL_OPTIONS: GoalItem[] = [
  {
    id: 'build_muscle',
    title: ATHLETE_GOAL_CONFIGS.build_muscle.label,
    subtitle: ATHLETE_GOAL_CONFIGS.build_muscle.tagline,
    icon: Dumbbell,
  },
  {
    id: 'lose_fat',
    title: ATHLETE_GOAL_CONFIGS.lose_fat.label,
    subtitle: ATHLETE_GOAL_CONFIGS.lose_fat.tagline,
    icon: Flame,
  },
  {
    id: 'get_stronger',
    title: ATHLETE_GOAL_CONFIGS.get_stronger.label,
    subtitle: ATHLETE_GOAL_CONFIGS.get_stronger.tagline,
    icon: Shield,
  },
  {
    id: 'stamina',
    title: ATHLETE_GOAL_CONFIGS.stamina.label,
    subtitle: ATHLETE_GOAL_CONFIGS.stamina.tagline,
    icon: Activity,
  },
  {
    id: 'general_fitness',
    title: ATHLETE_GOAL_CONFIGS.general_fitness.label,
    subtitle: ATHLETE_GOAL_CONFIGS.general_fitness.tagline,
    icon: CheckCircle2,
  },
];

interface FitnessGoalsScreenProps {
  selectedGoals: AthleteGoal[];
  onToggleGoal: (goal: AthleteGoal) => void;
  onContinue: () => void;
  onSkip: () => void;
  onBack: () => void;
}

export default function FitnessGoalsScreen({
  selectedGoals,
  onToggleGoal,
  onContinue,
  onSkip,
  onBack,
}: FitnessGoalsScreenProps) {
  return (
    <div className="min-h-screen w-full bg-[#F3F0E7] text-[#171916] flex flex-col justify-between pb-8 animate-fade-in">
      {/* Top 3-segment progress indicator (Step 1 of 3) */}
      <StepProgressBar currentStep={1} onBack={onBack} />

      {/* Main Content */}
      <div className="w-full max-w-md mx-auto px-6 py-2 my-auto space-y-6">
        {/* Header */}
        <div className="text-left space-y-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#171916] tracking-tight">
            What are your fitness goals?
          </h1>
          <p className="text-sm text-[#858076]">
            Select all that apply.
          </p>
        </div>

        {/* Illustration */}
        <div className="flex justify-center">
          <img
            src="/images/illustrations/onboarding-goals.webp"
            alt="People pursuing different fitness goals"
            className="w-48 h-48 object-contain"
            loading="eager"
          />
        </div>

        {/* 5 Multi-Select Cards in exact order */}
        <div className="space-y-3" role="group" aria-label="Fitness goals">
          {GOAL_OPTIONS.map((item) => {
            const isSelected = selectedGoals.includes(item.id);
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onToggleGoal(item.id)}
                aria-pressed={isSelected}
                className={`w-full p-4 rounded-2xl bg-white border transition-all flex items-center justify-between text-left cursor-pointer shadow-2xs ${
                  isSelected
                    ? 'border-[#E44427] ring-1 ring-[#E44427] bg-[#E44427]/[0.02]'
                    : 'border-[#E2DFD6] hover:border-[#858076]/40'
                }`}
              >
                {/* Left: Icon & Title/Subtitle */}
                <div className="flex items-center gap-3.5 pr-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-[#E44427]/10 text-[#E44427]'
                        : 'bg-[#F3F0E7] text-[#858076]'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-[#171916] leading-snug">
                      {item.title}
                    </h2>
                    <p className="text-2xs text-[#858076] leading-snug mt-0.5">
                      {item.subtitle}
                    </p>
                  </div>
                </div>

                {/* Right: Selection Check Indicator */}
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border transition-all ${
                    isSelected
                      ? 'bg-[#E44427] border-[#E44427] text-white shadow-xs'
                      : 'border-[#E2DFD6] bg-transparent'
                  }`}
                  aria-hidden="true"
                >
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
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

        <div className="text-center">
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-[#858076] hover:text-[#171916] transition-colors cursor-pointer py-1"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
