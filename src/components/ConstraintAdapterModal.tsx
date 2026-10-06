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
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import { useToast } from './ui/Toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

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
  const [selectedMinutes, setSelectedMinutes] = useState<number>(30);
  const [step, setStep] = useState<'summary' | 'swap_picker'>('summary');
  const [selectedExName, setSelectedExName] = useState<string>(exercises[0]?.name || '');
  const [selectedSubstitute, setSelectedSubstitute] = useState<string>('');
  const [showDetailedExplanation, setShowDetailedExplanation] = useState<boolean>(false);

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
    return Math.max(20, Math.round(totalSets * 2.4));
  }, [adaptedExercises]);

  if (!isOpen || !exercises || exercises.length === 0) return null;

  const handleConfirm = () => {
    onApplyAdaptedWorkout(adaptedExercises);
    toast.success(`Adapted session applied!`, 'Workout Adapted');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-xs p-0 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-bg-card border-t sm:border border-border/80 rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="w-10 h-1 bg-border/70 rounded-full mx-auto -mt-1 mb-2 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-2">
            {step === 'swap_picker' && (
              <button
                type="button"
                onClick={() => setStep('summary')}
                className="p-1 -ml-1 text-text-muted hover:text-text-primary cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-accent block">
                ADAPTIVE SYSTEM
              </span>
              <h2 className="text-xl font-black text-text-primary tracking-tight font-display">
                {step === 'swap_picker' ? 'Choose Alternative' : 'Adapt Session'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === 'summary' ? (
          <>
            {/* 1. Why? Reason selector */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted block">
                WHY ADAPT TODAY?
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setActiveConstraintType('time')}
                  className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                    activeConstraintType === 'time'
                      ? 'border-accent bg-accent/15 text-text-primary shadow-xs ring-1 ring-accent/30'
                      : 'border-border/70 bg-bg-secondary text-text-secondary hover:border-border'
                  }`}
                >
                  <Clock className={`w-4 h-4 mb-1.5 ${activeConstraintType === 'time' ? 'text-accent' : 'text-text-muted'}`} />
                  <span className="text-xs font-bold block">{selectedMinutes}m limit</span>
                  <span className="text-[10px] text-text-muted">Short on time</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveConstraintType('readiness')}
                  className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                    activeConstraintType === 'readiness'
                      ? 'border-accent bg-accent/15 text-text-primary shadow-xs ring-1 ring-accent/30'
                      : 'border-border/70 bg-bg-secondary text-text-secondary hover:border-border'
                  }`}
                >
                  <BatteryLow className={`w-4 h-4 mb-1.5 ${activeConstraintType === 'readiness' ? 'text-accent' : 'text-text-muted'}`} />
                  <span className="text-xs font-bold block">Feeling tired</span>
                  <span className="text-[10px] text-text-muted">Low energy</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveConstraintType('equipment');
                    setStep('swap_picker');
                  }}
                  className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                    activeConstraintType === 'equipment'
                      ? 'border-accent bg-accent/15 text-text-primary shadow-xs ring-1 ring-accent/30'
                      : 'border-border/70 bg-bg-secondary text-text-secondary hover:border-border'
                  }`}
                >
                  <Dumbbell className={`w-4 h-4 mb-1.5 ${activeConstraintType === 'equipment' ? 'text-accent' : 'text-text-muted'}`} />
                  <span className="text-xs font-bold block">Equipment busy</span>
                  <span className="text-[10px] text-text-muted">Station taken</span>
                </button>
              </div>

              {/* Time limits quick selector */}
              {activeConstraintType === 'time' && (
                <div className="flex items-center gap-2 pt-1.5">
                  <span className="text-xs text-text-muted font-medium">Minutes available:</span>
                  {[20, 30, 45, 60].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSelectedMinutes(m)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                        selectedMinutes === m
                          ? 'bg-accent text-white shadow-xs'
                          : 'bg-bg-secondary text-text-muted border border-border/70 hover:text-text-primary'
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
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted block">
                ASCEND WILL:
              </span>
              <div className="p-3.5 rounded-xl bg-bg-secondary/70 border border-border/70 space-y-1.5">
                <div className="flex items-start gap-2 text-xs text-text-secondary">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                  <span>Preserve main compound lifts &amp; movement patterns</span>
                </div>
                <div className="flex items-start gap-2 text-xs text-text-secondary">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                  <span>Prune accessory volume to fit target duration</span>
                </div>
                <div className="flex items-start gap-2 text-xs text-text-secondary">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                  <span>Keep today&apos;s primary neuromuscular training stimulus</span>
                </div>
              </div>
            </div>

            {/* 3. Estimated session duration */}
            <div className="flex items-center justify-between px-1 text-xs">
              <span className="text-text-muted font-medium">Estimated workout time:</span>
              <span className="font-mono font-black text-text-primary text-sm">
                ~{estimatedTotalMinutes} min
              </span>
            </div>

            {/* Progressive disclosure: View details */}
            <div>
              <button
                type="button"
                onClick={() => setShowDetailedExplanation((prev) => !prev)}
                className="text-xs text-accent hover:underline flex items-center gap-1 cursor-pointer font-semibold"
              >
                <span>{showDetailedExplanation ? 'Hide decision details' : 'View decision details'}</span>
                {showDetailedExplanation ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showDetailedExplanation && (
                <div className="mt-2 p-3 rounded-xl bg-bg-secondary border border-border/70 text-2xs space-y-1.5 animate-fade-in font-mono">
                  {changesSummary.map((change, i) => (
                    <div key={i} className="text-text-secondary">
                      &bull; {change}
                    </div>
                  ))}
                  {timeSavedMinutes > 0 && (
                    <div className="text-accent font-semibold pt-1">
                      Time saved: ~{timeSavedMinutes} minutes vs original plan
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 4. Action button */}
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={handleConfirm}
              leftIcon={<Check className="w-4 h-4 stroke-[3]" />}
            >
              Apply Adaptation
            </Button>
          </>
        ) : (
          /* Step 2: Equipment Swap Picker */
          <div className="space-y-4">
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted block">
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
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted block">
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
                      className={`w-full p-3 rounded-xl text-left border transition-all cursor-pointer ${
                        selectedSubstitute === alt.target
                          ? 'border-accent bg-accent/15 text-text-primary ring-1 ring-accent/30'
                          : 'border-border/70 bg-bg-secondary/70 text-text-secondary hover:border-accent/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-text-primary">{alt.target}</span>
                        <span className="text-[10px] font-mono text-accent">
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

            <Button
              variant="secondary"
              size="md"
              fullWidth
              onClick={() => setStep('summary')}
            >
              Back to Summary
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
