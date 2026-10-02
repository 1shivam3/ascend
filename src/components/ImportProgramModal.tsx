"use client";

import React from 'react';
import { DecodedProgram } from '@/lib/program-sharing';
import { useStore } from '@/lib/store';
import { PlannedWorkout } from '@/lib/types';
import { Download, Play, X, User, Dumbbell, Sparkles } from 'lucide-react';
import { useToast } from './ui/Toast';

interface ImportProgramModalProps {
  program: DecodedProgram | null;
  isOpen: boolean;
  onClose: () => void;
  onStartWorkout?: (plan: PlannedWorkout) => void;
}

export default function ImportProgramModal({
  program,
  isOpen,
  onClose,
  onStartWorkout,
}: ImportProgramModalProps) {
  const addPlannedWorkout = useStore((state) => state.addPlannedWorkout);
  const toast = useToast();

  if (!isOpen || !program) return null;

  const createPlanObject = (): PlannedWorkout => {
    return {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `plan_${Date.now()}`,
      name: program.name,
      exercises: program.exercises,
      createdAt: new Date().toISOString(),
    };
  };

  const handleImportOnly = () => {
    const newPlan = createPlanObject();
    addPlannedWorkout(newPlan);
    toast.success(`Imported "${program.name}" to your Workout Plans!`, 'Program Saved');
    onClose();
  };

  const handleImportAndStart = () => {
    const newPlan = createPlanObject();
    addPlannedWorkout(newPlan);
    toast.success(`Imported "${program.name}". Starting workout!`, 'Session Started');
    onClose();
    if (onStartWorkout) {
      onStartWorkout(newPlan);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-md w-full p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/70 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-text-primary leading-tight">
                Import Shared Routine
              </h3>
              <p className="text-2xs text-text-muted font-mono">1-Tap program import</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Coach / Program Info */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-black text-text-primary tracking-tight font-sans">
              {program.name}
            </h4>
            <span className="text-3xs font-mono font-bold text-accent bg-accent/15 px-2 py-0.5 rounded-md">
              {program.exercises.length} EXERCISES
            </span>
          </div>

          {program.coachName && (
            <div className="flex items-center gap-1.5 text-xs text-text-secondary font-mono">
              <User className="w-3.5 h-3.5 text-accent" />
              <span>Shared by Coach <strong className="text-text-primary">{program.coachName}</strong></span>
            </div>
          )}

          {program.notes && (
            <p className="text-2xs text-text-muted italic bg-bg-secondary p-2 rounded-lg border border-border/60">
              &quot;{program.notes}&quot;
            </p>
          )}
        </div>

        {/* Exercises List */}
        <div className="p-3 rounded-xl bg-bg-secondary border border-border/70 space-y-2 max-h-56 overflow-y-auto">
          <span className="text-3xs font-mono font-bold uppercase text-text-muted block">
            Routine Breakdown
          </span>
          <div className="space-y-1.5">
            {program.exercises.map((ex, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2 rounded-lg bg-bg-card border border-border/40 text-xs font-mono"
              >
                <div className="flex items-center gap-2">
                  <span className="text-2xs text-accent font-bold">#{idx + 1}</span>
                  <span className="font-bold text-text-primary">{ex.name}</span>
                </div>
                <div className="text-2xs text-text-secondary">
                  <span className="font-bold text-text-primary">{ex.targetSets}</span> sets ×{' '}
                  <span className="font-bold text-text-primary">{ex.targetReps}</span> reps
                  {ex.targetWeight ? (
                    <span className="text-accent ml-1 font-bold">
                      @{ex.targetWeight}{ex.targetUnit || 'kg'}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-2">
          {onStartWorkout && (
            <button
              type="button"
              onClick={handleImportAndStart}
              className="btn-primary w-full py-2.5 text-xs font-bold flex items-center justify-center gap-2 shadow-md hover:brightness-110 active:scale-[0.98] transition-all"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Import &amp; Start Workout Now</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleImportOnly}
            className="btn-secondary w-full py-2 text-xs font-semibold flex items-center justify-center gap-2"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Save to My Workout Plans</span>
          </button>
        </div>
      </div>
    </div>
  );
}
