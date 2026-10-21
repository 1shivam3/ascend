'use client';

import React from 'react';
import { Dumbbell, Flame, Shield, Activity, CheckCircle2, Check } from 'lucide-react';
import { AthleteGoal, ATHLETE_GOAL_CONFIGS } from '@/lib/types';
import StepProgressBar from './StepProgressBar';
import { useTranslation } from '@/lib/i18n';

interface GoalItem {
  id: AthleteGoal;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}

// Titles come from the canonical ATHLETE_GOAL_CONFIGS so onboarding,
// Profile and every other surface name goals identically.
const GOAL_OPTIONS: GoalItem[] = [
  {
    id: 'build_muscle',
    title: ATHLETE_GOAL_CONFIGS.build_muscle.label,
    subtitle: 'Bigger, stronger muscles — weights go up little by little',
    icon: Dumbbell,
  },
  {
    id: 'lose_fat',
    title: ATHLETE_GOAL_CONFIGS.lose_fat.label,
    subtitle: 'Eat a little less, keep your muscle, lose the fat',
    icon: Flame,
  },
  {
    id: 'get_stronger',
    title: ATHLETE_GOAL_CONFIGS.get_stronger.label,
    subtitle: 'Lift heavier on the big exercises',
    icon: Shield,
  },
  {
    id: 'stamina',
    title: ATHLETE_GOAL_CONFIGS.stamina.label,
    subtitle: 'Better stamina and a healthier heart',
    icon: Activity,
  },
  {
    id: 'general_fitness',
    title: ATHLETE_GOAL_CONFIGS.general_fitness.label,
    subtitle: 'Longevity, joint health & balanced training',
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
  const { t } = useTranslation();
  return (
    <div className="min-h-screen w-full bg-bg-primary text-text-primary flex flex-col justify-between pb-8 animate-fade-in">
      {/* Top 3-segment progress indicator (Step 1 of 3) */}
      <StepProgressBar currentStep={1} onBack={onBack} />

      {/* Main Content */}
      <div className="w-full max-w-md mx-auto px-6 py-2 my-auto space-y-6">
        {/* Header */}
        <div className="text-left space-y-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
            {t('onboarding.goalsTitle')}
          </h1>
          <p className="text-sm text-text-muted">
            {t('onboarding.goalsSubtitle')}
          </p>
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
                className={`w-full p-4 rounded-2xl bg-bg-card border transition-all flex items-center justify-between text-left cursor-pointer shadow-2xs ${
                  isSelected
                    ? 'border-accent ring-1 ring-accent bg-accent/[0.02]'
                    : 'border-border hover:border-border-hover/40'
                }`}
              >
                {/* Left: Icon & Title/Subtitle */}
                <div className="flex items-center gap-3.5 pr-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-accent/10 text-accent'
                        : 'bg-bg-primary text-text-muted'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-text-primary leading-snug">
                      {item.title}
                    </h2>
                    <p className="text-2xs text-text-muted leading-snug mt-0.5">
                      {item.subtitle}
                    </p>
                  </div>
                </div>

                {/* Right: Selection Check Indicator */}
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border transition-all ${
                    isSelected
                      ? 'bg-accent border-accent text-white shadow-xs'
                      : 'border-border bg-transparent'
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
          className="w-full py-4 px-6 rounded-xl bg-accent hover:bg-accent-dim active:scale-[0.99] text-white font-semibold text-sm transition-all shadow-md cursor-pointer text-center"
        >
          {t('common.continue')}
        </button>

        <div className="text-center">
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer py-1"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
