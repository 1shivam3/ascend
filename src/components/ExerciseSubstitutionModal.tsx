'use client';

import React, { useState } from 'react';
import { useStore } from '@/lib/store';
import { AISubstitutionResult } from '@/lib/types';
import { fetchExerciseSubstitution } from '@/lib/ai-coach';
import {
  ArrowRightLeft,
  X,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Dumbbell,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';

interface ExerciseSubstitutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  exerciseName: string;
  onApplyReplacement: (replacement: AISubstitutionResult) => void;
}

const REASON_OPTIONS = [
  'Equipment unavailable / busy',
  'Don’t like this exercise',
  'Too difficult / heavy today',
  'Hurts / joint discomfort',
  'Need a simpler movement',
];

export default function ExerciseSubstitutionModal({
  isOpen,
  onClose,
  exerciseName,
  onApplyReplacement,
}: ExerciseSubstitutionModalProps) {
  const store = useStore();
  const [selectedReason, setSelectedReason] = useState<string>(REASON_OPTIONS[0]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AISubstitutionResult | null>(null);

  if (!isOpen) return null;

  const handleFindReplacement = async (reasonToUse?: string) => {
    const reason = reasonToUse || selectedReason;
    setLoading(true);
    try {
      const sub = await fetchExerciseSubstitution(store, exerciseName, reason);
      setResult(sub);
    } catch (err) {
      console.error('Failed to get substitution:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (result) {
      onApplyReplacement(result);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-md p-5 shadow-2xl relative animate-scale-in space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-accent/15 flex items-center justify-center text-accent">
              <ArrowRightLeft className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-text-primary">
                Replace Exercise
              </h3>
              <p className="text-2xs text-text-muted">
                Substituting: <span className="font-semibold text-text-secondary">{exerciseName}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Reason Selector */}
        {!result && (
          <div className="space-y-3">
            <label className="text-2xs font-semibold uppercase tracking-wider text-text-muted block">
              Why do you need to replace it?
            </label>
            <div className="space-y-2">
              {REASON_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    setSelectedReason(opt);
                    handleFindReplacement(opt);
                  }}
                  disabled={loading}
                  className={`w-full text-left p-3 rounded-xl border text-xs font-medium transition-all flex items-center justify-between ${
                    selectedReason === opt
                      ? 'border-accent bg-accent/10 text-accent font-semibold'
                      : 'border-border hover:bg-bg-secondary text-text-primary'
                  }`}
                >
                  <span>{opt}</span>
                  {selectedReason === opt && <CheckCircle2 className="w-4 h-4 text-accent" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="py-6 text-center space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-accent mx-auto" />
            <p className="text-xs text-text-muted font-medium">
              Finding biomechanically equivalent exercise...
            </p>
          </div>
        )}

        {/* Result Card */}
        {result && !loading && (
          <div className="space-y-3.5 animate-fade-in">
            <div className="p-4 rounded-xl bg-bg-secondary border border-border space-y-2.5">
              <div className="flex items-center justify-between text-2xs text-text-muted">
                <span className="uppercase tracking-wider font-semibold">Suggested Alternative</span>
                <span className="font-medium text-accent">{result.movementPattern}</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs line-through text-text-muted">{result.originalExercise}</span>
                <span className="text-text-muted">→</span>
                <span className="text-base font-black text-text-primary">{result.replacementExercise}</span>
              </div>

              <div className="flex items-center gap-3 pt-1 text-xs text-text-secondary font-mono">
                {result.targetWeightKg !== undefined && (
                  <span className="px-2 py-0.5 rounded bg-bg-primary font-bold text-accent">
                    {result.targetWeightKg > 0 ? `${result.targetWeightKg} kg` : 'Bodyweight'}
                  </span>
                )}
                {result.targetReps && (
                  <span>Target: {result.targetReps} reps ({result.targetSets || 3} sets)</span>
                )}
              </div>

              <p className="text-xs text-text-secondary pt-1 leading-relaxed border-t border-border">
                {result.reason}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setResult(null)}
                className="flex-1 py-2.5 rounded-xl border border-border text-xs font-semibold text-text-secondary hover:bg-bg-secondary transition-colors"
              >
                Choose Other Reason
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 py-2.5 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent-hover transition-colors shadow-sm"
              >
                ✓ Use Replacement
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
