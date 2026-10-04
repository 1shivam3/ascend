'use client';

import React, { useState } from 'react';
import { useStore } from '@/lib/store';
import { AthleteGoal, ATHLETE_GOAL_CONFIGS } from '@/lib/types';
import {
  X,
  Target,
  Flame,
  Dumbbell,
  Scale,
  Activity,
  Sparkles,
  Check,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useToast } from './ui/Toast';

interface GoalSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GOAL_ICONS: Record<AthleteGoal, React.ElementType> = {
  build_muscle: Flame,
  get_stronger: Dumbbell,
  lose_fat: Scale,
  stamina: Activity,
  general_fitness: Sparkles,
};

export default function GoalSelectorModal({ isOpen, onClose }: GoalSelectorModalProps) {
  const currentGoals = useStore((state) => state.goals || ['get_stronger', 'build_muscle']);
  const setGoals = useStore((state) => state.setGoals);
  const setTrainingProfile = useStore((state) => state.setTrainingProfile);
  const toast = useToast();

  const [selectedGoals, setSelectedGoals] = useState<AthleteGoal[]>(currentGoals);

  if (!isOpen) return null;

  const handleToggle = (goal: AthleteGoal) => {
    setSelectedGoals((prev) => {
      if (prev.includes(goal)) {
        if (prev.length <= 1) {
          toast.info('You must select at least one primary goal.', 'Goal Required');
          return prev;
        }
        return prev.filter((g) => g !== goal);
      } else {
        return [...prev, goal];
      }
    });
  };

  const handleSave = () => {
    setGoals(selectedGoals);
    const primaryGoal = selectedGoals[0] || 'build_muscle';
    setTrainingProfile({
      goal: primaryGoal === 'get_stronger'
        ? 'strength'
        : primaryGoal === 'build_muscle'
        ? 'muscle_gain'
        : primaryGoal === 'lose_fat'
        ? 'fat_loss'
        : 'general_fitness',
    });

    const count = selectedGoals.length;
    toast.success(
      `Updated active goal${count > 1 ? 's' : ''} to: ${selectedGoals
        .map((g) => ATHLETE_GOAL_CONFIGS[g].label)
        .join(' + ')}`,
      'Goals Calibrated'
    );
    onClose();
  };

  // Derive dynamic synergy label
  const isPowerbuilding =
    selectedGoals.includes('get_stronger') && selectedGoals.includes('build_muscle');
  const isRecomp =
    selectedGoals.includes('lose_fat') && selectedGoals.includes('build_muscle');
  const isAthletic =
    selectedGoals.includes('stamina') && selectedGoals.includes('get_stronger');

  return (
    <div className="modal-overlay z-50" onClick={onClose}>
      <div
        className="modal-content max-w-md w-full p-4 sm:p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-accent/15 flex items-center justify-center text-accent">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary leading-tight">
                Active Training &amp; Nutrition Goals
              </h2>
              <p className="text-3xs text-text-muted font-mono">
                Select one or combine multiple goals to adapt ASCEND
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dynamic Synergy Banner */}
        {(isPowerbuilding || isRecomp || isAthletic) && (
          <div className="p-2.5 rounded-xl bg-accent/10 border border-accent/30 flex items-center gap-2 text-2xs text-accent">
            <Zap className="w-4 h-4 shrink-0" />
            <span>
              {isPowerbuilding
                ? '⚡ Powerbuilding Synergy: Heavy compound singles/triples paired with hypertrophy accessory volume.'
                : isRecomp
                ? '🔥 Lean Recomposition: Strength retention in a calibrated deficit with elevated protein intake.'
                : '🏃 Hybrid Performance: Heavy compound progression with condensed rest intervals.'}
            </span>
          </div>
        )}

        {/* 5 Selectable Goals */}
        <div className="space-y-2">
          {(Object.keys(ATHLETE_GOAL_CONFIGS) as AthleteGoal[]).map((goalId) => {
            const config = ATHLETE_GOAL_CONFIGS[goalId];
            const isSelected = selectedGoals.includes(goalId);
            const Icon = GOAL_ICONS[goalId];

            return (
              <button
                key={goalId}
                type="button"
                onClick={() => handleToggle(goalId)}
                className={`w-full p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  isSelected
                    ? 'border-accent bg-accent/15 shadow-xs'
                    : 'border-border/70 bg-bg-card hover:border-accent/40'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    isSelected ? 'bg-accent text-white' : 'bg-bg-secondary text-text-muted'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold leading-tight ${
                        isSelected ? 'text-text-primary' : 'text-text-secondary'
                      }`}
                    >
                      {config.label}
                    </span>
                    <div
                      className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'border-accent bg-accent text-white'
                          : 'border-border bg-bg-secondary'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>

                  <p className="text-3xs text-text-muted mt-0.5 line-clamp-1">{config.tagline}</p>

                  {/* Impact preview pills */}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <span className="text-4xs font-mono px-1.5 py-0.2 rounded bg-bg-secondary/80 text-text-muted border border-border/60">
                      Reps: {config.defaultRepRange.min}–{config.defaultRepRange.max}
                    </span>
                    <span className="text-4xs font-mono px-1.5 py-0.2 rounded bg-bg-secondary/80 text-text-muted border border-border/60">
                      Rest: {config.defaultRestSeconds}s
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Real Impact Summary */}
        <div className="p-3 rounded-xl bg-bg-secondary/70 border border-border/80 space-y-1.5 text-left">
          <div className="flex items-center gap-1.5 text-3xs font-mono font-bold uppercase text-accent">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>How ASCEND Personalizes to Your Selection</span>
          </div>
          <p className="text-2xs text-text-secondary leading-relaxed">
            Your selection dynamically calibrates:
          </p>
          <ul className="text-3xs text-text-muted space-y-0.5 list-disc list-inside">
            <li><strong>Prescription Engine:</strong> Modifies target rep brackets and RPE progression.</li>
            <li><strong>Nutrition Engine:</strong> Recalculates maintenance, surplus (+250 kcal), or deficit (-450 kcal) with target protein ratios.</li>
            <li><strong>Dashboard Focus:</strong> Highlights 1RM PRs &amp; DOTS vs. Volume Tonnage vs. Deficit &amp; Weight Velocity.</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handleSave}
            className="btn-primary py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
          >
            <Check className="w-4 h-4" />
            <span>Apply Goals</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary py-2.5 text-xs font-semibold"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
