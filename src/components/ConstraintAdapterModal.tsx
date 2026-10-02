"use client";

import React, { useState } from 'react';
import { WorkoutExercise, RealWorldConstraint } from '@/lib/types';
import { adaptWorkoutForConstraints } from '@/lib/lifter-twin';
import {
  Clock,
  Dumbbell,
  BatteryLow,
  Zap,
  Check,
  X,
  ArrowRight,
  ShieldCheck,
  Sparkles,
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

  const [activeConstraintType, setActiveConstraintType] = useState<'time' | 'equipment' | 'fatigue'>('time');
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
                Real-World Adaptation
              </h3>
              <p className="text-3xs text-text-muted font-mono">
                Preserve program intent when gym conditions change
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
            <span className="text-3xs font-mono uppercase">Gear Busy</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveConstraintType('fatigue')}
            className={`py-2 px-1.5 rounded-lg text-xs font-bold font-sans transition-all flex flex-col items-center gap-1 ${
              activeConstraintType === 'fatigue'
                ? 'bg-accent text-white shadow-xs'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <BatteryLow className="w-3.5 h-3.5" />
            <span className="text-3xs font-mono uppercase">Low Recovery</span>
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
              Keeps main heavy compounds intact; compresses secondary accessory sets.
            </p>
          </div>
        )}

        {activeConstraintType === 'equipment' && (
          <div className="p-3 rounded-xl bg-bg-secondary/70 border border-border/80 space-y-2.5 text-left">
            <div>
              <span className="text-3xs font-mono font-bold text-text-muted uppercase block mb-1">
                Occupied Exercise:
              </span>
              <select
                value={selectedExName}
                onChange={(e) => setSelectedExName(e.target.value)}
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
                Auto-Substitutes Available:
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  'Dumbbell Press',
                  'Incline Bench',
                  'Dips',
                  'Leg Press',
                  'Front Squat',
                  'Romanian Deadlift',
                  'Dumbbell Row',
                ].map((alt) => (
                  <button
                    key={alt}
                    type="button"
                    onClick={() => setSelectedSubstitute(alt)}
                    className={`py-1.5 px-2 rounded-lg text-2xs font-sans text-left truncate border transition-all ${
                      selectedSubstitute === alt
                        ? 'border-accent bg-accent/15 text-accent font-bold'
                        : 'border-border bg-bg-card text-text-secondary hover:border-accent/40'
                    }`}
                  >
                    {alt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeConstraintType === 'fatigue' && (
          <div className="p-3 rounded-xl bg-bg-secondary/70 border border-border/80 text-left space-y-1.5">
            <span className="text-xs font-bold text-amber-400 font-sans flex items-center gap-1.5">
              <BatteryLow className="w-4 h-4" />
              <span>CNS Recovery Shield</span>
            </span>
            <p className="text-2xs text-text-secondary leading-relaxed font-sans">
              Bad sleep, high exam stress, or sore joints? ASCEND drops 1 working set across all exercises and caps RPE at 7.5. You keep your motor coordination and strength stimulus without digging into systemic overtraining.
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
