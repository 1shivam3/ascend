"use client";

import React, { useState } from 'react';
import { WorkoutExercise, RealWorldConstraint } from '@/lib/types';
import { adaptWorkoutForConstraints, STIMULUS_PRESERVING_SWAPS } from '@/lib/lifter-twin';
import {
  Clock,
  Dumbbell,
  BatteryLow,
  Zap,
  Check,
  X,
  ShieldCheck,
} from 'lucide-react';
import { useToast } from './ui/Toast';

interface ConstraintAdapterModalProps {
  isOpen: boolean;
  onClose: () => void;
  exercises: WorkoutExercise[];
  userUnit?: 'kg' | 'lbs';
  onApplyAdaptedWorkout: (adaptedExercises: WorkoutExercise[]) => void;
}

export default function ConstraintAdapterModal({
  isOpen,
  onClose,
  exercises,
  userUnit = 'kg',
  onApplyAdaptedWorkout,
}: ConstraintAdapterModalProps) {
  const toast = useToast();

  const [activeConstraintType, setActiveConstraintType] = useState<'time' | 'equipment' | 'readiness'>('time');
  const [selectedMinutes, setSelectedMinutes] = useState<number>(45);
  const [selectedExName, setSelectedExName] = useState<string>(exercises[0]?.name || '');
  const [selectedSubstitute, setSelectedSubstitute] = useState<string>('');

  if (!isOpen || !exercises || exercises.length === 0) return null;

  // Run adaptation preview
  const constraintConfig: RealWorldConstraint = {
    type: activeConstraintType,
    availableMinutes: selectedMinutes,
    targetExerciseName: selectedExName,
    substituteExerciseName: selectedSubstitute || undefined,
  };

  const { adaptedExercises, changesSummary, timeSavedMinutes } = adaptWorkoutForConstraints(
    exercises,
    constraintConfig,
    userUnit
  );

  const handleConfirm = () => {
    onApplyAdaptedWorkout(adaptedExercises);
    toast.success(`Adapted session: ${changesSummary[0] || 'Workout updated'}`, 'Workout Adapted');
    onClose();
  };

  const availableSwaps = STIMULUS_PRESERVING_SWAPS[selectedExName] || [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-md w-full p-4 sm:p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/70 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-text-primary leading-tight">
                Real-World Constraint Adaptation
              </h3>
              <p className="text-3xs text-text-muted font-mono">
                Preserve training intent when real-world conditions change
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

        {/* 3 Real-World Constraint Mode Selectors */}
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-bg-secondary border border-border/70">
          <button
            type="button"
            onClick={() => setActiveConstraintType('time')}
            className={`py-2 px-1.5 rounded-lg text-xs font-bold font-sans transition-all flex flex-col items-center gap-1 ${
              activeConstraintType === 'time'
                ? 'bg-accent text-white shadow-xs'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span className="text-3xs font-mono uppercase">Time Limit</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveConstraintType('equipment')}
            className={`py-2 px-1.5 rounded-lg text-xs font-bold font-sans transition-all flex flex-col items-center gap-1 ${
              activeConstraintType === 'equipment'
                ? 'bg-accent text-white shadow-xs'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <Dumbbell className="w-3.5 h-3.5" />
            <span className="text-3xs font-mono uppercase">Equipment Busy</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveConstraintType('readiness')}
            className={`py-2 px-1.5 rounded-lg text-xs font-bold font-sans transition-all flex flex-col items-center gap-1 ${
              activeConstraintType === 'readiness'
                ? 'bg-accent text-white shadow-xs'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <BatteryLow className="w-3.5 h-3.5" />
            <span className="text-3xs font-mono uppercase">Low Readiness</span>
          </button>
        </div>

        {/* Constraint-specific configuration options */}
        {activeConstraintType === 'time' && (
          <div className="p-3 rounded-xl bg-bg-secondary/70 border border-border/80 space-y-2 text-left">
            <span className="text-3xs font-mono font-bold text-text-muted uppercase block">
              Available Gym Duration:
            </span>
            <div className="grid grid-cols-3 gap-2">
              {[30, 45, 60].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setSelectedMinutes(mins)}
                  className={`py-2 rounded-lg text-xs font-mono font-bold border transition-all ${
                    selectedMinutes === mins
                      ? 'border-accent bg-accent/15 text-accent shadow-xs'
                      : 'border-border bg-bg-card text-text-secondary hover:border-accent/40'
                  }`}
                >
                  {mins} Minutes
                </button>
              ))}
            </div>
            <p className="text-3xs text-text-muted font-sans pt-1">
              Protects core compound intensity; caps working sets at 3 and streams accessory volume.
            </p>
          </div>
        )}

        {activeConstraintType === 'equipment' && (
          <div className="p-3 rounded-xl bg-bg-secondary/70 border border-border/80 space-y-2.5 text-left">
            <div>
              <span className="text-3xs font-mono font-bold text-text-muted uppercase block mb-1">
                Occupied Station / Exercise:
              </span>
              <select
                value={selectedExName}
                onChange={(e) => {
                  setSelectedExName(e.target.value);
                  setSelectedSubstitute('');
                }}
                className="w-full bg-bg-card border border-border rounded-lg py-1.5 px-2.5 text-xs text-text-primary outline-none focus:border-accent"
              >
                {exercises.map((ex, i) => (
                  <option key={i} value={ex.name}>
                    {ex.name} ({ex.sets.length} sets)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="text-3xs font-mono font-bold text-text-muted uppercase block mb-1">
                Stimulus-Preserving Substitutes:
              </span>
              {availableSwaps.length > 0 ? (
                <div className="grid grid-cols-1 gap-1.5">
                  {availableSwaps.map((alt) => (
                    <button
                      key={alt.target}
                      type="button"
                      onClick={() => setSelectedSubstitute(alt.target)}
                      className={`p-2 rounded-lg text-xs font-sans text-left border transition-all ${
                        selectedSubstitute === alt.target
                          ? 'border-accent bg-accent/15 text-accent font-bold'
                          : 'border-border bg-bg-card text-text-secondary hover:border-accent/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{alt.target}</span>
                        <span className="text-3xs font-mono text-text-muted">
                          {alt.targetSets}×{alt.targetReps} @ RPE {alt.targetRpe}
                        </span>
                      </div>
                      <p className="text-3xs text-text-muted mt-0.5 font-normal">
                        {alt.stimulusReason}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-2xs text-text-muted">
                  No automated swap registered. A dumbbell or cable equivalent will preserve movement volume.
                </p>
              )}
            </div>
          </div>
        )}

        {activeConstraintType === 'readiness' && (
          <div className="p-3 rounded-xl bg-bg-secondary/70 border border-border/80 text-left space-y-1.5">
            <span className="text-xs font-bold text-amber-400 font-sans flex items-center gap-1.5">
              <BatteryLow className="w-4 h-4" />
              <span>Low Readiness Adaptation</span>
            </span>
            <p className="text-2xs text-text-secondary leading-relaxed font-sans">
              Poor sleep, elevated life stress, or joint fatigue? ASCEND trims 1 accessory set to manage session fatigue and caps target RPE at ≤ 7.5. Preserves technical execution without digging into systemic recovery debt.
            </p>
          </div>
        )}

        {/* Adaptation Diff Preview */}
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-left space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-3xs font-mono font-bold uppercase text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Program Intent Preserved</span>
            </span>
            {timeSavedMinutes > 0 && (
              <span className="text-3xs font-mono font-bold text-accent">
                ~{timeSavedMinutes}m saved
              </span>
            )}
          </div>

          <ul className="space-y-1 text-2xs text-text-secondary font-sans list-disc list-inside">
            {changesSummary.map((item, i) => (
              <li key={i} className="leading-snug">
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handleConfirm}
            className="btn-primary py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
          >
            <Check className="w-4 h-4" />
            <span>Apply Adaptation</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5"
          >
            <span>Cancel</span>
          </button>
        </div>
      </div>
    </div>
  );
}
