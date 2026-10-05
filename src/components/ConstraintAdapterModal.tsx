'use client';

import React, { useState, useMemo } from 'react';
import { WorkoutExercise, RealWorldConstraint } from '@/lib/types';
import { adaptWorkoutForConstraints, getStimulusPreservingSwaps } from '@/lib/lifter-twin';
import {
  Clock,
  Dumbbell,
  BatteryLow,
  Check,
  X,
  ArrowRight,
  ChevronLeft,
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

  const [activeConstraintType, setActiveConstraintType] = useState<'time' | 'readiness' | 'equipment'>('time');
  const [selectedMinutes, setSelectedMinutes] = useState<number>(45);
  const [step, setStep] = useState<'summary' | 'swap_picker'>('summary');
  const [selectedExName, setSelectedExName] = useState<string>(exercises[0]?.name || '');
  const [selectedSubstitute, setSelectedSubstitute] = useState<string>('');

  // Run adaptation engine
  const constraintConfig: RealWorldConstraint = useMemo(() => ({
    type: activeConstraintType,
    availableMinutes: selectedMinutes,
    targetExerciseName: selectedExName,
    substituteExerciseName: selectedSubstitute || undefined,
  }), [activeConstraintType, selectedMinutes, selectedExName, selectedSubstitute]);

  const { adaptedExercises, changesSummary, timeSavedMinutes } = useMemo(() => {
    if (!exercises || exercises.length === 0) {
      return { adaptedExercises: [], changesSummary: [], timeSavedMinutes: 0 };
    }
    return adaptWorkoutForConstraints(exercises, constraintConfig, userUnit);
  }, [exercises, constraintConfig, userUnit]);

  const availableSwaps = useMemo(() => {
    return getStimulusPreservingSwaps(selectedExName);
  }, [selectedExName]);

  // Calculate estimated total session time
  const estimatedTotalMinutes = useMemo(() => {
    let totalSets = 0;
    adaptedExercises.forEach((e) => {
      totalSets += e.sets.length;
    });
    // approx 2.5 min per set including rest
    return Math.max(20, Math.round(totalSets * 2.4));
  }, [adaptedExercises]);

  if (!isOpen || !exercises || exercises.length === 0) return null;

  const handleConfirm = () => {
    onApplyAdaptedWorkout(adaptedExercises);
    toast.success(`Adapted session: ${changesSummary[0] || 'Workout updated'}`, 'Workout Adapted');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-xs p-0 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-bg-surface border-t sm:border border-border/70 rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile handle indicator */}
        <div className="w-10 h-1 bg-border/60 rounded-full mx-auto -mt-1 mb-2 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-2">
            {step === 'swap_picker' && (
              <button
                type="button"
                onClick={() => setStep('summary')}
                className="p-1 -ml-1 text-text-muted hover:text-text-primary"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <h2 className="text-xl font-black text-text-primary tracking-tight font-sans">
              {step === 'swap_picker' ? 'SELECT SUBSTITUTE' : 'ADAPT SESSION'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === 'summary' ? (
          <>
            {/* 1. Why? Reason selector */}
            <div className="space-y-1.5">
              <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted">
                WHY?
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveConstraintType('time');
                  }}
                  className={`p-2.5 rounded-xl text-left border transition-all ${
                    activeConstraintType === 'time'
                      ? 'border-accent bg-accent/10 text-text-primary'
                      : 'border-border/60 bg-bg-secondary/60 text-text-secondary hover:border-border'
                  }`}
                >
                  <Clock className={`w-4 h-4 mb-1.5 ${activeConstraintType === 'time' ? 'text-accent' : 'text-text-muted'}`} />
                  <span className="text-xs font-bold block">{selectedMinutes}m time</span>
                  <span className="text-3xs text-text-muted">Tight schedule</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveConstraintType('readiness');
                  }}
                  className={`p-2.5 rounded-xl text-left border transition-all ${
                    activeConstraintType === 'readiness'
                      ? 'border-accent bg-accent/10 text-text-primary'
                      : 'border-border/60 bg-bg-secondary/60 text-text-secondary hover:border-border'
                  }`}
                >
                  <BatteryLow className={`w-4 h-4 mb-1.5 ${activeConstraintType === 'readiness' ? 'text-accent' : 'text-text-muted'}`} />
                  <span className="text-xs font-bold block">Low readiness</span>
                  <span className="text-3xs text-text-muted">Fatigue / sleep</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveConstraintType('equipment');
                    setStep('swap_picker');
                  }}
                  className={`p-2.5 rounded-xl text-left border transition-all ${
                    activeConstraintType === 'equipment'
                      ? 'border-accent bg-accent/10 text-text-primary'
                      : 'border-border/60 bg-bg-secondary/60 text-text-secondary hover:border-border'
                  }`}
                >
                  <Dumbbell className={`w-4 h-4 mb-1.5 ${activeConstraintType === 'equipment' ? 'text-accent' : 'text-text-muted'}`} />
                  <span className="text-xs font-bold block">Equipment</span>
                  <span className="text-3xs text-text-muted">Station busy</span>
                </button>
              </div>

              {/* Time duration stepper if time selected */}
              {activeConstraintType === 'time' && (
                <div className="flex items-center gap-2 pt-1.5">
                  <span className="text-2xs text-text-muted font-medium">Minutes available:</span>
                  {[30, 45, 60].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSelectedMinutes(m)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold font-mono transition-all ${
                        selectedMinutes === m
                          ? 'bg-accent text-white'
                          : 'bg-bg-secondary text-text-muted border border-border/50'
                      }`}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 2. ASCEND will: Clean bullet list */}
            <div className="space-y-1.5 pt-1">
              <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted">
                ASCEND WILL:
              </span>
              <div className="p-3.5 rounded-xl bg-bg-secondary/70 border border-border/60 space-y-1.5">
                {changesSummary.map((change, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                    <span>{change}</span>
                  </div>
                ))}
                {timeSavedMinutes > 0 && (
                  <div className="flex items-start gap-2 text-xs font-medium text-accent pt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                    <span>Save approx. {timeSavedMinutes} min of workout duration</span>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Estimated session duration */}
            <div className="flex items-center justify-between px-1 text-xs">
              <span className="text-text-muted">Estimated session duration</span>
              <span className="font-mono font-bold text-text-primary text-sm">
                ~{estimatedTotalMinutes} min
              </span>
            </div>

            {/* 4. Action button */}
            <button
              type="button"
              onClick={handleConfirm}
              className="w-full py-3.5 btn-primary font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-accent/20 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>APPLY ADAPTATION</span>
            </button>
          </>
        ) : (
          /* Step 2: Equipment Swap Picker */
          <div className="space-y-4">
            <div className="space-y-1.5">
              <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted">
                WHICH EXERCISE IS OCCUPIED?
              </span>
              <select
                value={selectedExName}
                onChange={(e) => {
                  setSelectedExName(e.target.value);
                  setSelectedSubstitute('');
                }}
                className="w-full bg-bg-secondary border border-border/80 rounded-xl py-2 px-3 text-xs font-semibold text-text-primary outline-none focus:border-accent"
              >
                {exercises.map((ex, i) => (
                  <option key={i} value={ex.name}>
                    {ex.name} ({ex.sets.length} sets)
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted">
                SELECT STIMULUS-PRESERVING SUBSTITUTE:
              </span>
              {availableSwaps.length > 0 ? (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {availableSwaps.map((alt) => (
                    <button
                      key={alt.target}
                      type="button"
                      onClick={() => {
                        setSelectedSubstitute(alt.target);
                        setStep('summary');
                      }}
                      className={`w-full p-3 rounded-xl text-left border transition-all ${
                        selectedSubstitute === alt.target
                          ? 'border-accent bg-accent/15 text-text-primary'
                          : 'border-border/60 bg-bg-secondary/70 text-text-secondary hover:border-accent/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-text-primary">{alt.target}</span>
                        <span className="text-3xs font-mono text-accent">
                          {alt.targetSets}×{alt.targetReps} @{alt.targetRpe}
                        </span>
                      </div>
                      <p className="text-2xs text-text-muted mt-1 leading-snug">
                        {alt.stimulusReason}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-bg-secondary/50 text-2xs text-text-muted">
                  No automated swap registered. A dumbbell or cable variation will preserve training stimulus.
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setStep('summary')}
              className="w-full py-2.5 btn-secondary text-xs font-bold"
            >
              Back to Summary
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
