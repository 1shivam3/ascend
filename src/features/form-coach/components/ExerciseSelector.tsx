/**
 * ASCEND Form Coach — Exercise Selector
 *
 * Clearly distinguishes active V1 supported exercises (Barbell Back Squat)
 * from coming soon analyzers (Deadlift, Bench Press, OHP) without misleading claims.
 */

import React from 'react';
import { Dumbbell, Check, Clock, ChevronRight, Activity } from 'lucide-react';

export interface ExerciseOption {
  id: string;
  name: string;
  muscle: string;
  status: 'active' | 'coming_soon';
  description: string;
}

const EXERCISE_OPTIONS: ExerciseOption[] = [
  {
    id: 'squat',
    name: 'Barbell Back Squat',
    muscle: 'Quadriceps, Glutes, Core',
    status: 'active',
    description: 'Real-time depth tracking, knee flexion angles, and rep counting from side profile.',
  },
  {
    id: 'deadlift',
    name: 'Conventional Deadlift',
    muscle: 'Hamstrings, Posterior Chain, Back',
    status: 'coming_soon',
    description: 'Hip hinge mechanics, bar lockout timing, and spinal alignment observation.',
  },
  {
    id: 'bench_press',
    name: 'Barbell Bench Press',
    muscle: 'Chest, Front Deltoids, Triceps',
    status: 'coming_soon',
    description: 'Bar path tracking, elbow tuck angles, and chest touch pause detection.',
  },
  {
    id: 'overhead_press',
    name: 'Overhead Press',
    muscle: 'Shoulders, Upper Chest, Triceps',
    status: 'coming_soon',
    description: 'Vertical bar path, head clearance, and lockout stability.',
  },
  {
    id: 'lunges',
    name: 'Walking Lunges',
    muscle: 'Quads, Glutes, Hamstrings',
    status: 'coming_soon',
    description: 'Front knee tracking, hip drop consistency, and step cadence.',
  },
];

interface ExerciseSelectorProps {
  selectedExerciseId: string;
  onSelect: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ExerciseSelector({
  selectedExerciseId,
  onSelect,
  onConfirm,
  onCancel,
}: ExerciseSelectorProps) {
  return (
    <div className="flex flex-col h-full max-w-lg mx-auto p-4 justify-between animate-fade-in text-text-primary">
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Select Exercise</h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Choose an exercise to start live camera form coaching.
          </p>
        </div>

        <div className="space-y-2.5">
          {EXERCISE_OPTIONS.map((ex) => {
            const isSelected = selectedExerciseId === ex.id;
            const isActive = ex.status === 'active';

            return (
              <div
                key={ex.id}
                role="button"
                tabIndex={isActive ? 0 : -1}
                onClick={() => {
                  if (isActive) onSelect(ex.id);
                }}
                onKeyDown={(e) => {
                  if (isActive && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onSelect(ex.id);
                  }
                }}
                className={`p-3.5 rounded-2xl border transition-all text-left flex items-start justify-between cursor-pointer ${
                  isSelected
                    ? 'border-accent-primary bg-accent-primary/10 shadow-sm'
                    : isActive
                    ? 'border-border-subtle bg-surface-elevated hover:border-text-secondary/30'
                    : 'border-border-subtle/50 bg-surface-base/50 opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="space-y-1 pr-3">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-sm text-text-primary">{ex.name}</span>
                    {isActive ? (
                      <span className="text-2xs uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                        Live V1
                      </span>
                    ) : (
                      <span className="text-2xs uppercase font-medium tracking-wider px-1.5 py-0.5 rounded-full bg-surface-elevated text-text-muted border border-border-subtle">
                        Coming Soon
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary">{ex.description}</p>
                  <span className="text-2xs text-text-muted font-mono">{ex.muscle}</span>
                </div>

                <div className="pt-1">
                  {isSelected ? (
                    <div className="w-6 h-6 rounded-full bg-accent-primary text-text-on-accent flex items-center justify-center">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  ) : isActive ? (
                    <ChevronRight className="w-5 h-5 text-text-muted" />
                  ) : (
                    <Clock className="w-4 h-4 text-text-muted" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pt-4 flex items-center space-x-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-3 px-4 rounded-xl border border-border-subtle bg-surface-elevated text-text-secondary font-medium text-sm hover:bg-surface-base transition-colors"
        >
          Close
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 py-3 px-4 rounded-xl bg-accent-primary text-text-on-accent font-semibold text-sm hover:opacity-95 transition-opacity"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
